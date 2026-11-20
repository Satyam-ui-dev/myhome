import json
import logging
import os
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
LOG_PATH = Path(os.environ.get("HOME_CONTROL_LOG_PATH", ROOT / "logs.json"))
ESP32_URL = os.environ.get("ESP32_URL", "http://192.168.1.19").rstrip("/")
API_KEY = os.environ.get("HOME_CONTROL_API_KEY", "change-me-123")
ANALYSIS_API_URL = os.environ.get("ANALYSIS_API_URL", "").rstrip("/")
ANALYSIS_INGEST_API_KEY = os.environ.get("ANALYSIS_INGEST_API_KEY", "")
STATUS_STALE_SECONDS = 15
ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
ALLOWED_ORIGINS.update(
    origin.strip().rstrip("/")
    for origin in os.environ.get("HOME_CONTROL_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
)
POLL_INTERVAL_SECONDS = 1
DEVICES = {"light", "light2", "fan", "socket"}


class LogStore:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.Lock()
        if self.path.exists():
            with self.path.open("r", encoding="utf-8") as file:
                data = json.load(file)
            if not isinstance(data, dict) or not isinstance(data.get("events"), list):
                raise ValueError(f"{self.path} must contain an object with an events array")
        else:
            data = {"version": 1, "events": []}
            self._write(data)

        self.data = data
        self.seen = {
            (event["boot"], event["id"])
            for event in data["events"]
            if isinstance(event, dict) and "boot" in event and "id" in event
        }
        self.status = None
        self.last_status_at = None
        self.error = "Waiting for ESP32"

    def _write(self, data):
        temporary_path = self.path.with_suffix(self.path.suffix + ".tmp")
        with temporary_path.open("w", encoding="utf-8", newline="\n") as file:
            json.dump(data, file, indent=2)
            file.write("\n")
        os.replace(temporary_path, self.path)

    def accept_status(self, status, received_at=None):
        if not isinstance(status, dict):
            raise ValueError("ESP32 status must be a JSON object")
        boot = status.get("boot")
        uptime = status.get("up")
        raw_events = status.get("events")
        if (not isinstance(boot, int) or isinstance(boot, bool)
                or not isinstance(uptime, int) or isinstance(uptime, bool)
                or not isinstance(raw_events, list)):
            raise ValueError("ESP32 status is missing boot, up, or events")

        timestamp_now = time.time() if received_at is None else received_at
        additions = []
        for event in raw_events:
            if not isinstance(event, dict):
                continue
            event_id = event.get("id")
            event_time = event.get("t")
            device = event.get("d")
            state = event.get("s")
            if (not isinstance(event_id, int) or isinstance(event_id, bool)
                    or not isinstance(event_time, int) or isinstance(event_time, bool)
                    or not isinstance(device, str) or device not in DEVICES
                    or state not in (0, 1)):
                continue
            key = (boot, event_id)
            if key in self.seen:
                continue
            additions.append({
                "boot": boot,
                "id": event_id,
                "timestamp": max(0, int(timestamp_now - uptime + event_time)),
                "device": device,
                "state": state,
            })

        with self.lock:
            if additions:
                updated = {"version": 1, "events": self.data["events"] + additions}
                self._write(updated)
                self.data = updated
                self.seen.update((event["boot"], event["id"]) for event in additions)
            self.status = {
                key: status[key]
                for key in ("light", "light2", "fan", "socket", "up", "boot")
                if key in status
            }
            self.last_status_at = timestamp_now
            self.error = ""

    def set_error(self, message):
        with self.lock:
            self.error = message

    def status_snapshot(self):
        with self.lock:
            connected = self.status is not None and not self.error
            error = self.error
            if (connected and self.last_status_at is not None
                    and time.time() - self.last_status_at > STATUS_STALE_SECONDS):
                connected = False
                error = "Collector data is stale"
            return {
                "connected": connected,
                "error": error,
                **(self.status or {}),
            }

    def logs_snapshot(self):
        with self.lock:
            return self.data


STORE = LogStore(LOG_PATH)


def poll_esp32():
    history_offset = 0
    history_synced = not ANALYSIS_API_URL
    while True:
        try:
            request = Request(
                ESP32_URL + "/api/status",
                headers={"X-API-Key": API_KEY},
            )
            with urlopen(request, timeout=4) as response:
                status = json.loads(response.read().decode("utf-8"))
            STORE.accept_status(status)
            if ANALYSIS_API_URL:
                try:
                    forward_status(status)
                except (URLError, TimeoutError, OSError, ValueError) as error:
                    logging.warning("Analysis API forward failed: %s", error)
        except (URLError, TimeoutError, OSError, ValueError, UnicodeDecodeError,
                json.JSONDecodeError) as error:
            STORE.set_error(str(error))
            logging.warning("ESP32 poll failed: %s", error)
        if not history_synced:
            try:
                saved_events = STORE.logs_snapshot()["events"]
                while history_offset < len(saved_events):
                    batch = saved_events[history_offset:history_offset + 500]
                    forward_history(batch)
                    history_offset += len(batch)
                history_synced = True
                logging.info("Saved local analysis history to the online API")
            except (URLError, TimeoutError, OSError, ValueError) as error:
                logging.warning("Analysis history sync failed: %s", error)
        time.sleep(POLL_INTERVAL_SECONDS)


def forward_status(status):
    request = Request(
        ANALYSIS_API_URL + "/api/ingest",
        data=json.dumps(status).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": ANALYSIS_INGEST_API_KEY,
        },
        method="POST",
    )
    with urlopen(request, timeout=4) as response:
        if response.status != 200:
            raise ValueError(f"Analysis API returned HTTP {response.status}")


def forward_history(events):
    request = Request(
        ANALYSIS_API_URL + "/api/import",
        data=json.dumps({"events": events}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-API-Key": ANALYSIS_INGEST_API_KEY,
        },
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        if response.status != 200:
            raise ValueError(f"Analysis API returned HTTP {response.status}")


class RequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self._send_json(STORE.status_snapshot())
        elif self.path == "/api/logs":
            self._send_json(STORE.logs_snapshot())
        elif self.path == "/health":
            self._send_json({"ok": True})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != "/api/ingest":
            self._send_json({"error": "Not found"}, 404)
            return
        if not ANALYSIS_INGEST_API_KEY:
            self._send_json({"error": "Ingestion API key is not configured"}, 503)
            return
        if not secrets.compare_digest(
                self.headers.get("X-API-Key", ""),
                ANALYSIS_INGEST_API_KEY):
            self._send_json({"error": "Unauthorized"}, 401)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json({"error": "Invalid Content-Length"}, 400)
            return
        if content_length <= 0 or content_length > 1_000_000:
            self._send_json({"error": "Invalid request size"}, 413)
            return

        try:
            status = json.loads(self.rfile.read(content_length).decode("utf-8"))
            STORE.accept_status(status)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self._send_json({"error": str(error)}, 400)
            return
        self._send_json({"accepted": True})

    def do_OPTIONS(self):
        if self.path != "/api/ingest":
            self._send_json({"error": "Not found"}, 404)
            return
        self.send_response(204)
        self._set_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-API-Key")
        self.end_headers()

    def _set_cors_headers(self):
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _send_json(self, payload, status_code=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(body)


def main():
    if ANALYSIS_API_URL and not ANALYSIS_INGEST_API_KEY:
        raise ValueError("ANALYSIS_INGEST_API_KEY is required when ANALYSIS_API_URL is set")
    threading.Thread(target=poll_esp32, daemon=True).start()
    logging.info("Polling ESP32 at %s", ESP32_URL)
    host = os.environ.get("HOME_CONTROL_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), RequestHandler)
    logging.info("Home Control API listening on %s:%s", host, port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logging.info("Stopping Home Control server")
    finally:
        server.server_close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()

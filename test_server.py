import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen

import server
from server import LogStore


class LogStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.log_path = Path(self.temporary_directory.name) / "logs.json"
        self.store = LogStore(self.log_path)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_saves_events_and_ignores_repeated_poll_data(self):
        status = {
            "boot": 123,
            "up": 100,
            "events": [{"id": 1, "t": 40, "d": "light", "s": 1}],
        }

        self.store.accept_status(status, received_at=1000)
        self.store.accept_status(status, received_at=1001)

        saved = json.loads(self.log_path.read_text(encoding="utf-8"))
        self.assertEqual(len(saved["events"]), 1)
        self.assertEqual(saved["events"][0], {
            "boot": 123,
            "id": 1,
            "timestamp": 940,
            "device": "light",
            "state": 1,
        })

    def test_event_id_is_unique_per_boot(self):
        self.store.accept_status({
            "boot": 123,
            "up": 10,
            "events": [{"id": 1, "t": 2, "d": "fan", "s": 1}],
        }, received_at=100)
        self.store.accept_status({
            "boot": 456,
            "up": 10,
            "events": [{"id": 1, "t": 3, "d": "fan", "s": 0}],
        }, received_at=200)

        self.assertEqual(len(self.store.logs_snapshot()["events"]), 2)

    def test_persisted_event_is_not_duplicated_after_server_restart(self):
        status = {
            "boot": 123,
            "up": 10,
            "events": [{"id": 1, "t": 2, "d": "fan", "s": 1}],
        }
        self.store.accept_status(status, received_at=100)
        restarted_store = LogStore(self.log_path)
        restarted_store.accept_status(status, received_at=101)

        self.assertEqual(len(restarted_store.logs_snapshot()["events"]), 1)


class CorsTests(unittest.TestCase):
    def setUp(self):
        self.previous_origins = server.ALLOWED_ORIGINS
        server.ALLOWED_ORIGINS = set(self.previous_origins)
        server.ALLOWED_ORIGINS.add("https://home.vercel.app")
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.RequestHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join()
        server.ALLOWED_ORIGINS = self.previous_origins

    def test_api_allows_configured_origin_only(self):
        url = f"http://127.0.0.1:{self.httpd.server_port}/api/logs"

        with urlopen(Request(url, headers={"Origin": "https://home.vercel.app"})) as response:
            self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://home.vercel.app")
            self.assertEqual(response.headers["Vary"], "Origin")

        with urlopen(Request(url, headers={"Origin": "https://other.example"})) as response:
            self.assertIsNone(response.headers.get("Access-Control-Allow-Origin"))

    def test_api_allows_local_next_origins(self):
        url = f"http://127.0.0.1:{self.httpd.server_port}/api/logs"

        for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
            with self.subTest(origin=origin):
                with urlopen(Request(url, headers={"Origin": origin})) as response:
                    self.assertEqual(response.headers["Access-Control-Allow-Origin"], origin)


if __name__ == "__main__":
    unittest.main()

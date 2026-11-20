# myhome

Home Control is a Next.js dashboard for controlling ESP32 devices and viewing
saved runtime, energy, and activity analysis.

## Run the web app

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

In a second terminal, run `python server.py` to collect ESP32 logs. The app
reads fresh logs from `http://127.0.0.1:8000` and falls back to the deployment
snapshot in `public/logs.json`.

## Live analysis on deployment

The deployed analysis page cannot use `127.0.0.1`: that address refers to the
visitor's computer. This repository includes a Render API service definition
(`render.yaml`) with persistent storage. Deploy it as a Render Blueprint and
set `HOME_CONTROL_ALLOWED_ORIGINS` to the exact HTTPS origin of the deployed
Next.js site (for example, `https://your-site.vercel.app`).

The Render service generates `ANALYSIS_INGEST_API_KEY`. Set the following
environment variables on the computer running the ESP32 collector, then start
`python server.py`. The collector continues polling the ESP32 on the LAN and
forwards each status update to Render:

```powershell
$env:ANALYSIS_API_URL = "https://your-api-service.onrender.com"
$env:ANALYSIS_INGEST_API_KEY = "<value from Render>"
python server.py
```

In the Next.js deployment settings, set
`NEXT_PUBLIC_ANALYSIS_API_URL` to the same Render service URL and redeploy the
frontend. The analysis API provides `GET /api/status` and `GET /api/logs`;
`POST /api/ingest` is protected by `ANALYSIS_INGEST_API_KEY`. Keep that key
only in Render and the collector environment, never in the frontend.

The ESP32 stays private on the home network; the collector sends outbound
HTTPS updates, so the backend does not need direct access to the ESP32.
Render's persistent disk requires a paid service plan.

## Static analysis snapshot

If live backend hosting is not configured, the page falls back to
`public/logs.json`. To refresh this snapshot before deploying:

```powershell
Copy-Item .\logs.json .\public\logs.json
```

Snapshot data only includes events up to the time it was copied.

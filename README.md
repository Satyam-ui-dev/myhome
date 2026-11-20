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

The deployed analysis page uses this static snapshot because `127.0.0.1`
refers to the visitor's own computer, not the machine hosting the site. To
refresh the snapshot before deploying, copy the collector's latest logs:

```powershell
Copy-Item .\logs.json .\public\logs.json
```

The deployment will show events only through the time this snapshot was made.
Live updates on a deployed site require hosting the Python collector at a
public API URL.

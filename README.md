# Home Control

Next.js dashboard for controlling ESP32 devices and viewing saved runtime,
energy, and activity analysis.

## Run the web app

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

In a second terminal, run `python server.py` to collect ESP32 logs. The app
reads fresh logs from `http://127.0.0.1:8000` and falls back to the deployment
snapshot in `public/logs.json`.

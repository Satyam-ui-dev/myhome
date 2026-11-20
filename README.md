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

## Live analysis on Vercel

The deployed analysis page uses Vercel API routes and Supabase for online
status and event storage. In Supabase, create a project and run
[`supabase/schema.sql`](./supabase/schema.sql) in the SQL Editor.

Set these environment variables in the Vercel project settings:

- `SUPABASE_URL`: the Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role key. Keep it server
  side; never use a `NEXT_PUBLIC_` prefix.
- `ANALYSIS_INGEST_API_KEY`: a long random secret used to authenticate the
  collector.

Redeploy the Vercel app after setting the variables. The API provides
`GET /api/status`, `GET /api/logs`, and protected `POST /api/ingest` and
`POST /api/import` endpoints.

The ESP32 stays private on the home network. Run the collector on a computer
on that network, set the URL of the deployed Vercel site and the same ingest
secret, then start `python server.py`:

```powershell
$env:ANALYSIS_API_URL = "https://your-site.vercel.app"
$env:ANALYSIS_INGEST_API_KEY = "<same secret set in Vercel>"
python server.py
```

Keep the collector running so it can forward switch status and events
continuously. On startup it also backfills the existing local `logs.json` in
batches. Supabase stores every unique event online; its primary key prevents
duplicate events during backfill or when the ESP32 repeats recent data.

## Static analysis snapshot

If live backend hosting is not configured, the page falls back to
`public/logs.json`. To refresh this snapshot before deploying:

```powershell
Copy-Item .\logs.json .\public\logs.json
```

Snapshot data only includes events up to the time it was copied.

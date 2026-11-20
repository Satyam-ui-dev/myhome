"use client";

import { useEffect, useState } from "react";

const DEVICES = [
  { id: "light", name: "Light 1", watts: 15, field: "light_s" },
  { id: "light2", name: "Light 2", watts: 15, field: "light2_s" },
  { id: "fan", name: "Fan", watts: 60, field: "fan_s" },
  { id: "socket", name: "5-pin socket", watts: 100, field: "socket_s" }
];
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_ANALYSIS_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}h ${minutes}m ${remainder}s`;
  if (minutes) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function getDisplayedState(reportedState) {
  if (typeof reportedState === "boolean") return !reportedState;
  if (reportedState === 0 || reportedState === 1) return reportedState === 0;
  return null;
}

export default function AnalysisDashboard() {
  const [status, setStatus] = useState({ connected: false });
  const [events, setEvents] = useState([]);
  const [connection, setConnection] = useState("Loading saved analysis...");
  const [error, setError] = useState("");

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refresh() {
    const [statusResult, logsResult] = await Promise.allSettled([
      fetchJson(`${API_BASE_URL}/api/status`),
      fetchJson(`${API_BASE_URL}/api/logs`)
    ]);

    let nextStatus = statusResult.status === "fulfilled" ? statusResult.value : { connected: false };
    let logs = logsResult.status === "fulfilled" ? logsResult.value : null;
    let snapshot = false;
    if (!logs || !Array.isArray(logs.events)) {
      try {
        logs = await fetchJson("/logs.json");
        snapshot = true;
      } catch (loadError) {
        setConnection("Cannot load saved analysis");
        setError(`Error: ${loadError.message}`);
        return;
      }
    }

    setStatus(nextStatus);
    setEvents(logs.events || []);
    setConnection(
      snapshot
        ? "Showing the saved logs.json snapshot from this deployment"
        : nextStatus.connected
          ? "Connected to ESP32 through the local server"
          : "ESP32 offline — showing saved analysis"
    );
    setError(snapshot
      ? "This snapshot only includes events present when the site was deployed."
      : nextStatus.error || "");
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main>
      <h2>Device Analysis</h2>
      <div className="card analysis-card">
        <div className="muted">{connection}</div>
        <div className="muted">Saved activity remains available while the ESP32 is offline.</div>
      </div>
      {DEVICES.map((device) => {
        const deviceEvents = events
          .filter((event) => event.device === device.id)
          .sort((a, b) => b.timestamp - a.timestamp);
        let onAt = null;
        const rows = [];
        [...deviceEvents].reverse().forEach((event) => {
          const isOn = getDisplayedState(event.state);
          let duration = "-";
          if (isOn) onAt = event.timestamp;
          else if (isOn === false && onAt !== null) {
            duration = formatDuration(event.timestamp - onAt);
            onAt = null;
          }
          rows.push({
            timestamp: event.timestamp,
            state: isOn,
            duration
          });
        });
        rows.reverse();
        const lastState = deviceEvents[0]?.state;
        const displayedState = getDisplayedState(
          status.connected ? status[device.id] : lastState
        );

        return (
          <section className="card analysis-card" key={device.id}>
            <h3>{device.name}</h3>
            <p className={`status ${displayedState === null ? "" : displayedState ? "on" : "off"}`}>
              {status.connected ? "Status" : "Last recorded"}: {displayedState === null ? "unknown" : displayedState ? "ON" : "OFF"}
            </p>
            <p className="muted">Rated power: {device.watts} W</p>
            <h4>Recent activity</h4>
            <div className="activity-scroll" role="region" aria-label={`${device.name} recent activity`} tabIndex="0">
              <table>
                <thead><tr><th>Time</th><th>Event</th><th>Was ON for</th></tr></thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.timestamp}-${index}`}>
                      <td>{new Date(row.timestamp * 1000).toLocaleString()}</td>
                      <td className={row.state ? "on" : "off"}>{row.state ? "ON" : "OFF"}</td>
                      <td>{row.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <p className="muted">No activity yet since ESP32 started.</p>}
          </section>
        );
      })}
      <div className="muted" role="status" aria-live="polite">{error}</div>
    </main>
  );
}

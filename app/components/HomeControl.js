"use client";

import { useEffect, useState } from "react";

const ESP_IP = "192.168.1.19";
const API_KEY = "change-me-123";
const DEVICES = [
  { id: "light", name: "Light 1" },
  { id: "light2", name: "Light 2" },
  { id: "fan", name: "Fan" },
  { id: "socket", name: "5-pin socket" }
];

export default function HomeControl() {
  const [states, setStates] = useState({});
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");

  async function call(path, method = "GET") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`http://${ESP_IP}${path}`, {
        method,
        headers: { "X-API-Key": API_KEY },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStates(data);
      setConnected(true);
      setMessage("");
    } catch (error) {
      setConnected(false);
      setMessage(`Error: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  useEffect(() => {
    call("/api/status");
    const timer = setInterval(() => call("/api/status"), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <main>
      <h2>Home Control</h2>
      <div className="card control-card">
        <span className={`dot ${connected ? "up" : "down"}`} />
        <span>{connected ? `Connected to ${ESP_IP}` : "Cannot reach ESP32"}</span>
      </div>

      {DEVICES.map((device) => {
        const isOn = typeof states[device.id] === "boolean" ? states[device.id] : null;
        return (
          <div className="card control-card" key={device.id}>
            <h3>{device.name}</h3>
            {isOn !== null && (
              <img
                className="device-image"
                src={`/images/${device.id}-${isOn ? "on" : "off"}.png`}
                alt={`${device.name} is ${isOn ? "ON" : "OFF"}`}
              />
            )}
            <button
              className={`state-toggle ${isOn === null ? "unk" : isOn ? "on" : "off"}`}
              type="button"
              role="switch"
              aria-checked={isOn === null ? "mixed" : isOn}
              aria-label={`${device.name} ${isOn === null ? "status unknown" : `is ${isOn ? "ON" : "OFF"}`}`}
              onClick={() => call(`/api/${device.id}?state=toggle`, "POST")}
            >
              <span className="toggle-label">{isOn === null ? "Unknown" : isOn ? "ON" : "OFF"}</span>
              <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
            </button>
          </div>
        );
      })}

      <div className="card control-card">
        <h3>Device analysis</h3>
        <p>View separate runtime, energy, and activity analysis for each device.</p>
        <a href="/analysis" className="analysis-link">Open device analysis</a>
      </div>
      <div className="home-message">{message}</div>
    </main>
  );
}

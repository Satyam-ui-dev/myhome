"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function SiteNav() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(localStorage.getItem("home-control-theme") === "light");
  }, []);

  function toggleTheme() {
    const nextLight = !light;
    setLight(nextLight);
    const theme = nextLight ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("home-control-theme", theme);
  }

  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("home-control-theme") || "dark";
  }, []);

  return (
    <nav className="navbar" aria-label="Main navigation">
      <Link href="/">Home</Link>
      <Link href="/analysis">Analysis</Link>
      <Link href="/about">About</Link>
      <button
        className="theme-toggle"
        type="button"
        aria-label={`Switch to ${light ? "dark" : "light"} theme`}
        aria-pressed={light}
        onClick={toggleTheme}
      >
        <span className="theme-icon" aria-hidden="true">{light ? "☾" : "☀"}</span>
        <span>{light ? "Dark mode" : "Light mode"}</span>
      </button>
    </nav>
  );
}

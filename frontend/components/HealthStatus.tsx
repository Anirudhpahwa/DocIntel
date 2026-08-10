"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, fetchHealth, type HealthResponse } from "@/lib/api";

type LoadState = "loading" | "loaded" | "error";

const SERVICES: { key: keyof HealthResponse; label: string; description: string; icon: string }[] = [
  { key: "api", label: "API", description: "FastAPI application server", icon: "⚙️" },
  { key: "database", label: "Database", description: "PostgreSQL", icon: "\u{1F5C4}️" },
  { key: "pgvector", label: "pgvector", description: "Vector extension", icon: "\u{1F9E9}" },
  { key: "ollama", label: "Ollama", description: "AI model service", icon: "\u{1F9E0}" },
];

/**
 * The Dashboard's "System Status" card (Phase 6D restyle). Reuses the
 * exact same `fetchHealth()` call and 15s poll this component already
 * had -- no second health-check implementation, no new endpoint. Only
 * the rendering changed: a compact per-service row (icon, label,
 * description, "Operational"/"Unavailable") instead of the old flat
 * list, plus a link straight to the real `/api/health` JSON so "view
 * system health" is an actual working link, not a placeholder.
 */
export default function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchHealth();
        if (!cancelled) {
          setHealth(data);
          setState("loaded");
        }
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">System Status</h2>

      {state === "loading" && (
        <p className="mt-3 text-sm text-slate-500">Checking backend connection…</p>
      )}

      {state === "error" && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
          <span aria-hidden>&#9888;</span>
          Cannot reach the backend API
        </div>
      )}

      {state === "loaded" && health && (
        <ul className="mt-3 divide-y divide-slate-100">
          {SERVICES.map(({ key, label, description, icon }) => {
            const ok = health[key] === "ok";
            return (
              <li key={key} className="flex items-center gap-3 py-2.5">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm"
                >
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-400">{description}</span>
                </span>
                <span
                  className={`shrink-0 text-xs font-medium ${ok ? "text-emerald-600" : "text-red-600"}`}
                >
                  {ok ? "● Operational" : "⚠ Unavailable"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <a
        href={`${API_BASE_URL}/api/health`}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        View system health &#8599;
      </a>
    </div>
  );
}

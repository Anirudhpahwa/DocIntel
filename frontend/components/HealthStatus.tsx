"use client";

import { useEffect, useState } from "react";
import { fetchHealth, type HealthResponse } from "@/lib/api";

type LoadState = "loading" | "loaded" | "error";

const LABELS: Record<keyof HealthResponse, string> = {
  api: "API Connected",
  database: "Database Connected",
  pgvector: "Vector Search Ready",
  ollama: "AI Runtime Available",
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  );
}

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
          <StatusDot ok={false} />
          Cannot reach the backend API
        </div>
      )}

      {state === "loaded" && health && (
        <ul className="mt-3 space-y-2">
          {(Object.keys(LABELS) as Array<keyof HealthResponse>).map((key) => (
            <li key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <StatusDot ok={health[key] === "ok"} />
              {LABELS[key]}
              {health[key] !== "ok" && (
                <span className="text-xs text-slate-400">(unavailable)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { generateSummary, type SummarizeResponse, type SummaryScope } from "@/lib/api";

interface SummaryPanelProps {
  scope: SummaryScope;
}

/**
 * Self-contained "Generate Summary" button + result panel for a selected
 * document or folder. Summaries are session-only, kept in this component's
 * state (never persisted to Postgres or cached, per Phase 5 spec) -- the
 * caller must pass `key={document.id}` / `key={folder.id}` at the call site
 * so switching selection remounts this component and drops any stale
 * summary, the same pattern AskPanel already uses for the question box.
 */
export default function SummaryPanel({ scope }: SummaryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await generateSummary(scope);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
      setResult(null);
    } finally {
      setLoading(false);
      setHasGenerated(true);
    }
  }

  return (
    <div className="mt-6 border-t border-slate-100 pt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Generating…" : hasGenerated ? "Regenerate Summary" : "Generate Summary"}
        </button>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Generating summary…
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && !loading && !error && (
        <div className="mt-4 space-y-3">
          {result.summary
            .split(/\n{2,}/)
            .filter((paragraph) => paragraph.trim().length > 0)
            .map((paragraph, i) => (
              <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {paragraph.trim()}
              </p>
            ))}

          {result.documents_included > 0 && (
            <p className="text-xs text-slate-400">
              Based on {result.documents_included} document
              {result.documents_included === 1 ? "" : "s"}, {result.chunks_used} indexed chunk
              {result.chunks_used === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

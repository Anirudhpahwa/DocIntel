"use client";

import { useEffect, useRef, useState } from "react";
import { askQuestion, type QueryResponse, type QueryScope } from "@/lib/api";

type LoadingStage = null | "searching" | "generating";

interface AskPanelProps {
  scope: QueryScope;
  /** Human-readable description of the current scope, e.g. "January_Report.pdf", "Reports", "all documents". */
  scopeLabel: string;
}

const FILE_ICON = "\u{1F4C4}"; // 📄

export default function AskPanel({ scope, scopeLabel }: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState<LoadingStage>(null);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stale results from a previous file/folder are cleared by remounting
  // this component on scope change (see the `key` prop where it's used in
  // DocumentExplorer) rather than resetting state in an effect here.

  useEffect(() => {
    return () => {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || stage !== null) return;

    setError(null);
    setResult(null);
    setStage("searching");

    // Two-phase loading label for a single non-streaming request: retrieval
    // is typically fast, generation is the slow part, so we flip the label
    // after a short delay rather than waiting on a second round-trip.
    stageTimerRef.current = setTimeout(() => setStage("generating"), 900);

    try {
      const response = await askQuestion(trimmed, scope);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong answering your question");
    } finally {
      if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
      setStage(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">
        Ask about <span className="text-slate-600">{scopeLabel}</span>
      </h2>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a plain-English question about these documents…"
          disabled={stage !== null}
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={stage !== null || !question.trim()}
          className="shrink-0 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Ask
        </button>
      </form>

      {stage && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          {stage === "searching" ? "Searching documents…" : "Generating answer…"}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && !stage && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {result.answer}
            </p>
          </div>

          {result.sources.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {result.sources.map((source, index) => (
                  <li
                    key={`${source.document_id}-${source.page_number ?? "none"}-${index}`}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="flex items-center gap-1.5 truncate font-medium text-slate-800">
                      <span aria-hidden>{FILE_ICON}</span>
                      <span className="truncate">{source.document_name}</span>
                    </p>
                    {source.page_number !== null && (
                      <p className="mt-0.5 text-xs text-slate-500">Page {source.page_number}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

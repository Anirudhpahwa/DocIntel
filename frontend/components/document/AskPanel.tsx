"use client";

import { useState } from "react";
import { ApiError, askQuestion, type QueryResponse, type QueryScope } from "@/lib/api";
import { parseAnswerBlocks } from "@/lib/answerFormatting";
import SourceCard from "@/components/document/SourceCard";

interface AskPanelProps {
  scope: QueryScope;
  /** Human-readable description of the current scope, e.g. "January_Report.pdf", "Reports", "all documents". */
  scopeLabel: string;
}

const EXAMPLE_QUESTIONS = [
  "How many trains ran from Ahmedabad to Mumbai from August 6 to August 8?",
  "What safety observations were recorded?",
  "What maintenance activities were completed?",
];

function scopeDescription(scope: QueryScope): string {
  switch (scope.type) {
    case "folder":
      return "Your question will be answered using documents in this folder and its subfolders.";
    case "document":
      return "Your question will be answered using this document only.";
    default:
      return "Your question will be answered using all indexed documents.";
  }
}

/** Maps a failed /api/query call to fixed, user-facing copy -- never the
 * raw backend `detail` string or a stack trace. The backend's own error
 * handling (404/422/503/500) is untouched; this only decides what the
 * Ask page displays for each status. */
function describeAskError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 503:
        return "AI service is unavailable. Make sure Ollama is running.";
      case 404:
        return "Selected document or folder could not be found.";
      case 422:
        return "Please enter a valid question.";
      default:
        return "Something went wrong while answering your question.";
    }
  }
  return "Something went wrong while answering your question.";
}

export default function AskPanel({ scope, scopeLabel }: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stale results from a previous file/folder are cleared by remounting
  // this component on scope change (see the `key` prop where it's used in
  // app/ask/page.tsx) rather than resetting state in an effect here.

  async function submitQuestion(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || loading) return;

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const response = await askQuestion(trimmed, scope);
      setResult(response);
    } catch (err) {
      setError(describeAskError(err));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitQuestion(question);
  }

  const idle = !loading && !error && !result;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">
          Ask about <span className="text-slate-600">{scopeLabel}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">{scopeDescription(scope)}</p>

        <form onSubmit={handleSubmit} className="mt-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a plain-English question about these documents…"
              disabled={loading}
              className="flex-1 rounded-md border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="shrink-0 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Asking…" : "Ask"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">Press Enter to ask</p>
        </form>
      </div>

      {idle && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
          <p className="text-base font-medium text-slate-700">Ask questions about your documents</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Select a document or folder from the left, then ask a plain-English question.
          </p>
          <div className="mx-auto mt-5 flex max-w-lg flex-col gap-2">
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuestion(example)}
                className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Searching documents and generating answer…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {result && !loading && !error && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer</p>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-800">
            {parseAnswerBlocks(result.answer).map((block, i) =>
              block.type === "list" ? (
                block.ordered ? (
                  <ol key={i} className="list-decimal space-y-1 pl-5">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                )
              ) : (
                <p key={i} className="whitespace-pre-wrap">
                  {block.text}
                </p>
              )
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sources{result.sources.length > 0 ? ` (${result.sources.length})` : ""}
            </p>

            {result.sources.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No supporting documents were found.</p>
            ) : (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {result.sources.map((source, index) => (
                    <SourceCard
                      key={`${source.document_id}-${source.page_number ?? "none"}-${index}`}
                      source={source}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Sources are selected by the system and show where the information was found.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

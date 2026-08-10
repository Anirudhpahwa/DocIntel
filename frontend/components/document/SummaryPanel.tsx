"use client";

import { useState } from "react";
import {
  ApiError,
  generateSummary,
  type DocumentItem,
  type FolderNode,
  type SummarizeResponse,
  type SummaryScope,
} from "@/lib/api";
import { countContents } from "@/lib/tree";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";
import { parseAnswerBlocks } from "@/lib/answerFormatting";

const FILE_ICON = "\u{1F4C4}"; // 📄
const FOLDER_ICON = "\u{1F4C1}"; // 📁

export type SummaryTarget =
  | { kind: "document"; document: DocumentItem }
  | { kind: "folder"; folder: FolderNode };

interface SummaryPanelProps {
  target: SummaryTarget;
}

/** Maps a failed /api/summarize call to fixed, user-facing copy -- never
 * the raw backend `detail` string or a stack trace. Backend error handling
 * (404/422/503/500, summarize.py) is untouched; this only decides what the
 * Summaries page displays for each status -- same pattern as the Ask
 * page's `describeAskError` (Phase 6B). */
function describeSummaryError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 404:
        return "Selected document or folder could not be found.";
      case 422:
        return "Please select a valid document or folder.";
      case 503:
        return "AI service is unavailable. Make sure Ollama is running.";
      default:
        return "Something went wrong while generating the summary.";
    }
  }
  return "Something went wrong while generating the summary.";
}

/**
 * The Summaries page's right-hand workspace for a single selected document
 * or folder (Phase 6C): a scope-info card (name, type/count, actual
 * metadata -- never invented) with the Generate/Regenerate Summary button,
 * plus the result once generated.
 *
 * Session-only state, exactly as Phase 5 designed it -- no summary
 * history, nothing persisted to Postgres or cached. The caller remounts
 * this component (`key={scope.type + scope.id}`) whenever the selected
 * document/folder changes, which is what clears a stale summary/error and
 * resets "Regenerate" back to "Generate" -- not an effect watching the
 * scope, per the task's own preference for the key/remount approach.
 */
export default function SummaryPanel({ target }: SummaryPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const scope: SummaryScope =
    target.kind === "document"
      ? { type: "document", id: target.document.id }
      : { type: "folder", id: target.folder.id };

  const name = target.kind === "document" ? target.document.name : target.folder.name;

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await generateSummary(scope);
      setResult(response);
    } catch (err) {
      setError(describeSummaryError(err));
      setResult(null);
    } finally {
      setLoading(false);
      setHasGenerated(true);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">
          Summarize <span className="text-slate-600">{name}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {target.kind === "folder"
            ? "AI summary will be generated using all indexed documents in this folder."
            : "AI summary will be generated using this document's indexed content."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="shrink-0 text-2xl">
            {target.kind === "folder" ? FOLDER_ICON : FILE_ICON}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900" title={name}>
              {name}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {target.kind === "folder" ? (
                <>
                  Folder &middot; {countContents(target.folder).documents} document
                  {countContents(target.folder).documents === 1 ? "" : "s"}
                </>
              ) : (
                <>
                  {target.document.file_type.toUpperCase()} &middot;{" "}
                  {PROCESSING_STATUS_DISPLAY[target.document.processing_status].label}
                </>
              )}
            </p>
          </div>
        </div>

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
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Reading documents and generating summary…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {result && !loading && !error && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</p>
          <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-800">
            {parseAnswerBlocks(result.summary).map((block, i) =>
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

          {result.documents_included > 0 && (
            <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">
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

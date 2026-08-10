"use client";

import { useEffect, useState } from "react";
import { ApiError, fetchDocumentContentRaw, type DocumentContentResponse, type DocumentItem } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";
import { parseAnswerBlocks } from "@/lib/answerFormatting";

const FILE_ICON = "\u{1F4C4}"; // 📄

interface DocumentPreviewProps {
  document: DocumentItem;
  onClose: () => void;
  onDelete: () => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "pdf"; objectUrl: string }
  | { kind: "text"; content: string };

/** Maps a failed preview load to clean copy -- the backend's own detail
 * strings (Document.tsx "Document not found", "...no longer available",
 * "Could not read this document's content", "Preview isn't supported for
 * file type ...") are already short, human-readable sentences (§ Phase 7
 * error handling), so they're shown as-is rather than re-mapped to a
 * second set of fixed copy the way Ask/Summaries' status-code mapping
 * does. Only a true network/unexpected failure gets a generic fallback. */
function describePreviewError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong loading this document.";
}

/**
 * Full in-page document preview (Phase 7) -- replaces the old narrow
 * `DocumentFileDetail` side panel when a document is selected on the
 * Documents page, so PDF pages and extracted text have real room to be
 * readable. One backend endpoint (`GET /api/documents/{id}/content`)
 * serves both: the raw PDF is handed to the browser's own PDF viewer via
 * an <iframe> + object URL (no PDF.js/renderer dependency added); DOCX/TXT
 * come back as already-extracted text (reusing extraction_service
 * unchanged, same code path Phase 3 indexing already uses) and are
 * rendered through the same paragraph/list formatter Ask/Summaries use
 * (`lib/answerFormatting.ts`) -- presentation only, the text itself is
 * never altered.
 *
 * A single fetch() (not a bare <iframe src=...>) is used even for PDFs so
 * that a failed load (missing file, deleted document, backend down) shows
 * the same clean in-app error card every other file type gets, rather
 * than the browser's own opaque error page inside the iframe -- cross-
 * origin restrictions mean the app can't otherwise tell an iframe's HTTP
 * error apart from a successful load. The resulting object URL is
 * revoked on close/unmount so a previewed PDF doesn't leak memory.
 */
export default function DocumentPreview({ document, onClose, onDelete }: DocumentPreviewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    // No setState("loading") here: the caller keys this component by
    // document.id (DocumentExplorer.tsx), so a document change is a full
    // remount and the initial useState({kind:"loading"}) above already
    // covers it -- setting it again synchronously in the effect body would
    // just be a redundant, avoidable extra render.
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    async function load() {
      try {
        const response = await fetchDocumentContentRaw(document.id);

        if (document.file_type === "pdf") {
          const blob = await response.blob();
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          createdObjectUrl = objectUrl;
          setState({ kind: "pdf", objectUrl });
        } else {
          const data: DocumentContentResponse = await response.json();
          if (cancelled) return;
          setState({ kind: "text", content: data.content });
        }
      } catch (err) {
        if (!cancelled) setState({ kind: "error", message: describePreviewError(err) });
      }
    }

    load();
    return () => {
      cancelled = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [document.id, document.file_type]);

  const status = PROCESSING_STATUS_DISPLAY[document.processing_status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="mt-0.5 shrink-0 text-2xl">
            {FILE_ICON}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900" title={document.name}>
              {document.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>{document.file_type.toUpperCase()}</span>
              <span aria-hidden>&middot;</span>
              <span>{formatBytes(document.file_size)}</span>
              <span aria-hidden>&middot;</span>
              <span className={status.colorClassName}>
                <span aria-hidden className={status.spin ? "inline-block animate-spin" : "inline-block"}>
                  {status.icon}
                </span>{" "}
                {status.label}
              </span>
              <span aria-hidden>&middot;</span>
              <span>Uploaded {formatDate(document.created_at)}</span>
              {document.updated_at !== document.created_at && (
                <>
                  <span aria-hidden>&middot;</span>
                  <span>Updated {formatDate(document.updated_at)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete document
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close preview"
            title="Close preview"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="min-h-[70vh] rounded-lg border border-slate-200 bg-white">
        {state.kind === "loading" && (
          <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-slate-500">
            <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            Loading document…
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex h-[70vh] items-center justify-center p-6">
            <p className="max-w-md text-center text-sm text-red-700">{state.message}</p>
          </div>
        )}

        {state.kind === "pdf" && (
          <iframe
            src={state.objectUrl}
            title={document.name}
            className="h-[70vh] w-full rounded-lg border-0"
          />
        )}

        {state.kind === "text" && (
          <div className="h-[70vh] overflow-y-auto p-6">
            <div className="space-y-3 text-sm leading-relaxed text-slate-800">
              {parseAnswerBlocks(state.content).map((block, i) =>
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
          </div>
        )}
      </div>
    </div>
  );
}

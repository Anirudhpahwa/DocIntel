import type { DocumentItem, FolderNode } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { countContents } from "@/lib/tree";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";

interface DocumentFileDetailProps {
  document: DocumentItem;
  // Optional (Phase 6A): the Documents page's file detail panel wires these
  // up to reuse the existing delete flow (useDocumentTree.handleDeleteDocument)
  // and to let the panel be dismissed; other/future callers that only want
  // read-only detail can omit them, same optional-prop pattern FolderTree
  // already uses for its delete buttons.
  onDelete?: () => void;
  onClose?: () => void;
}

export function DocumentFileDetail({ document, onDelete, onClose }: DocumentFileDetailProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span aria-hidden>{"\u{1F4C4}"}</span>
          {document.name}
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close details"
            title="Close"
          >
            &times;
          </button>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">Type</dt>
        <dd className="text-slate-900">{document.file_type.toUpperCase()}</dd>

        <dt className="text-slate-500">Size</dt>
        <dd className="text-slate-900">{formatBytes(document.file_size)}</dd>

        <dt className="text-slate-500">Uploaded</dt>
        <dd className="text-slate-900">{formatDate(document.created_at)}</dd>

        {document.updated_at !== document.created_at && (
          <>
            <dt className="text-slate-500">Last updated</dt>
            <dd className="text-slate-900">{formatDate(document.updated_at)}</dd>
          </>
        )}

        <dt className="text-slate-500">Status</dt>
        <dd className={PROCESSING_STATUS_DISPLAY[document.processing_status].colorClassName}>
          <span
            aria-hidden
            className={PROCESSING_STATUS_DISPLAY[document.processing_status].spin ? "inline-block animate-spin" : "inline-block"}
          >
            {PROCESSING_STATUS_DISPLAY[document.processing_status].icon}
          </span>{" "}
          {PROCESSING_STATUS_DISPLAY[document.processing_status].label}
          {document.processing_status === "failed" && document.processing_error && (
            <span className="mt-1 block text-xs text-red-500">{document.processing_error}</span>
          )}
        </dd>
      </dl>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-5 w-full rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete document
        </button>
      )}
    </div>
  );
}

interface DocumentFolderDetailProps {
  folder: FolderNode;
  // Optional (Phase 6A): see DocumentFileDetailProps above — same reuse pattern.
  onDelete?: () => void;
}

/**
 * Compact info bar shown above a folder's contents on the Documents page
 * (Phase 6A) -- name/path, recursive document+folder counts (via the same
 * `countContents` helper used everywhere else), and delete. Deliberately
 * not a full standalone card (see docs/CLAUDE_CONTEXT.md request to avoid
 * "giant cards that waste most of the screen"). No summarization here
 * (Phase 6B) -- that's exclusively a Summaries-page (`/summaries`) feature;
 * `SummaryPanel`/`/api/summarize` are untouched and still reachable there.
 */
export function DocumentFolderDetail({ folder, onDelete }: DocumentFolderDetailProps) {
  const { documents, folders } = countContents(folder);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4">
      <div>
        <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span aria-hidden>{"\u{1F4C1}"}</span>
          {folder.name}
        </p>
        <p className="mt-1 text-xs text-slate-400">{folder.path}</p>
      </div>
      <div className="flex items-center gap-5 text-sm text-slate-500">
        <span>
          {documents} document{documents === 1 ? "" : "s"}
        </span>
        <span>
          {folders} folder{folders === 1 ? "" : "s"}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete folder
          </button>
        )}
      </div>
    </div>
  );
}

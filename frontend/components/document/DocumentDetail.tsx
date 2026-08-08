import type { DocumentItem, FolderNode } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { countContents } from "@/lib/tree";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";

function GenerateSummaryButton() {
  return (
    <button
      type="button"
      disabled
      title="AI-generated summaries arrive in a later phase"
      className="cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
    >
      Generate Summary
    </button>
  );
}

export function DocumentFileDetail({ document }: { document: DocumentItem }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8">
      <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span aria-hidden>{"\u{1F4C4}"}</span>
        {document.name}
      </p>

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

      <div className="mt-6">
        <GenerateSummaryButton />
      </div>
    </div>
  );
}

export function DocumentFolderDetail({ folder }: { folder: FolderNode }) {
  const { documents, folders } = countContents(folder);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8">
      <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span aria-hidden>{"\u{1F4C1}"}</span>
        {folder.name}
      </p>
      <p className="mt-1 text-xs text-slate-400">{folder.path}</p>

      <div className="mt-5 text-sm">
        <p className="text-slate-500">Contains:</p>
        <p className="text-slate-900">
          {documents} document{documents === 1 ? "" : "s"}
        </p>
        <p className="text-slate-900">
          {folders} folder{folders === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-6">
        <GenerateSummaryButton />
      </div>
    </div>
  );
}

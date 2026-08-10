import type { QuerySource } from "@/lib/api";

const FILE_ICON = "\u{1F4C4}"; // 📄

/** File extension parsed straight out of the backend-returned `document_name`
 * -- display-only, not a new/independent piece of source data. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toUpperCase();
}

/**
 * A single backend-returned source, rendered as a compact card (Phase 6B).
 * Every field here (`document_name`, `page_number`) comes straight from
 * `POST /api/query`'s `sources[]` -- nothing is invented or re-derived
 * beyond parsing the file extension out of the name already given.
 */
export default function SourceCard({ source }: { source: QuerySource }) {
  const ext = extensionOf(source.document_name);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 shrink-0 text-base">
          {FILE_ICON}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800" title={source.document_name}>
            {source.document_name}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {source.page_number !== null && (
              <span className="text-xs text-slate-500">Page {source.page_number}</span>
            )}
            {ext && (
              <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                {ext}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

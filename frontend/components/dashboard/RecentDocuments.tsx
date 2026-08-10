import Link from "next/link";
import type { FlatDocument } from "@/lib/tree";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";

const FILE_ICON = "\u{1F4C4}"; // 📄

interface RecentDocumentsProps {
  documents: FlatDocument[];
}

/**
 * The Dashboard's "Recent Documents" list (Phase 6D) -- real documents
 * from the existing tree, already sorted by `updated_at` (most-recent
 * first, a real timestamp the API already returns) by the caller
 * (`DashboardOverview.tsx`). No relative-time strings ("2 hours ago")
 * are shown -- the API gives an exact timestamp, not a duration, and
 * displaying an invented one wasn't asked for.
 *
 * The Documents page's folder navigation is client-side-only state (no
 * URL for "open this specific folder/file"), so there's no real deep
 * link to a single document -- each row instead navigates to
 * `/documents`, same as the spec's documented fallback.
 */
export default function RecentDocuments({ documents }: RecentDocumentsProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Recent Documents</h2>
        <Link href="/documents" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          View all documents
        </Link>
      </div>

      {documents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No documents yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {documents.map(({ document, folderName }) => {
            const status = PROCESSING_STATUS_DISPLAY[document.processing_status];
            return (
              <li key={document.id}>
                <Link
                  href="/documents"
                  className="flex items-center gap-3 py-2.5 text-sm hover:bg-slate-50"
                >
                  <span aria-hidden className="shrink-0 text-lg">
                    {FILE_ICON}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800" title={document.name}>
                      {document.name}
                    </span>
                    {folderName && <span className="block text-xs text-slate-400">{folderName}</span>}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      document.processing_status === "indexed"
                        ? "bg-emerald-50 text-emerald-700"
                        : document.processing_status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useDocumentTree } from "@/lib/useDocumentTree";
import { countContents, flattenDocuments } from "@/lib/tree";
import HealthStatus from "@/components/HealthStatus";
import UploadControls from "@/components/document/UploadControls";
import OverviewCards from "@/components/dashboard/OverviewCards";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentDocuments from "@/components/dashboard/RecentDocuments";
import FolderOverview from "@/components/dashboard/FolderOverview";

const RECENT_DOCUMENTS_LIMIT = 5;

/**
 * Dashboard (`/`) content, Phase 6D. Owns no tree-fetch logic of its own
 * -- `useDocumentTree()` is the same hook Documents/Ask/Summaries already
 * use, reused unchanged here purely to derive real numbers (via
 * `countContents`/`flattenDocuments`, `lib/tree.ts`) for the overview
 * cards, recent documents, and folder overview. Every value shown is
 * computed from the real `/api/documents/tree` response; nothing is
 * invented (no storage size, chunk counts, trends, or fake timestamps --
 * see docs/CLAUDE_CONTEXT.md's data rule for this phase).
 *
 * Replaces the old `WelcomePanel.tsx` (a static welcome message + quick
 * links) now that the Dashboard is a real workspace overview rather than
 * a landing blurb -- moved into `components/dashboard/` alongside the
 * other Dashboard-only pieces it composes.
 */
export default function DashboardOverview() {
  const { tree, loading, error, isEmpty, loadTree } = useDocumentTree();

  const stats = (() => {
    if (!tree) return null;
    const { documents: documentCount, folders: folderCount } = countContents(tree);
    const flat = flattenDocuments(tree);
    const indexedCount = flat.filter((f) => f.document.processing_status === "indexed").length;
    const processingCount = flat.filter((f) => f.document.processing_status === "processing").length;
    const failedCount = flat.filter((f) => f.document.processing_status === "failed").length;
    // updated_at is ISO 8601, so a plain string comparison sorts chronologically.
    const recent = [...flat]
      .sort((a, b) => (a.document.updated_at < b.document.updated_at ? 1 : -1))
      .slice(0, RECENT_DOCUMENTS_LIMIT);
    return { documentCount, folderCount, indexedCount, processingCount, failedCount, recent };
  })();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Your document intelligence workspace</p>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading workspace…</p>}

      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && isEmpty && (
        <>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-base font-medium text-slate-700">Your workspace is empty</p>
            <p className="max-w-sm text-sm text-slate-500">
              Upload your first documents to start asking questions and generating summaries.
            </p>
            <div className="mt-2">
              <UploadControls variant="toolbar" onUploaded={loadTree} />
            </div>
          </div>
          <HealthStatus />
        </>
      )}

      {!loading && !error && tree && !isEmpty && stats && (
        <>
          <OverviewCards
            documentCount={stats.documentCount}
            folderCount={stats.folderCount}
            indexedCount={stats.indexedCount}
            processingCount={stats.processingCount}
            failedCount={stats.failedCount}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <HealthStatus />
            <QuickActions onUploaded={loadTree} />
          </div>

          <RecentDocuments documents={stats.recent} />

          <FolderOverview folders={tree.folders} />
        </>
      )}
    </div>
  );
}

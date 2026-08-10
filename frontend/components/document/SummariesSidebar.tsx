"use client";

import type { DocumentTree } from "@/lib/api";
import FolderTree, { type Selection } from "@/components/document/FolderTree";

interface SummariesSidebarProps {
  tree: DocumentTree | null;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  selection: Selection;
  onSelectFolder: (id: number) => void;
  onSelectDocument: (id: number) => void;
}

/**
 * The Summaries page's document-scope sidebar (Phase 6C). Reuses
 * `FolderTree` and `useDocumentTree`'s fetch/selection state unchanged --
 * same tree, same data layer as Documents/Ask, no second tree-fetching
 * implementation.
 *
 * Deliberately has no "All Documents" row, unlike `AskSidebar` (Phase
 * 6B): summarization has no `all` scope on the backend --
 * `SummaryScope`'s type is `"document" | "folder"` only, and
 * `summary_service.generate_summary` rejects `"all"` with a 422
 * (`InvalidSummaryScopeError`, Phase 5) -- so no sidebar entry should
 * promise a feature the API contract doesn't offer. This is why
 * Summaries gets its own sidebar component rather than reusing
 * `AskSidebar` with a hidden row.
 */
export default function SummariesSidebar({
  tree,
  loading,
  error,
  isEmpty,
  selection,
  onSelectFolder,
  onSelectDocument,
}: SummariesSidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
      <p className="mt-1 px-1 text-xs text-slate-400">
        Select a document or folder to summarize.
      </p>

      <div className="mt-4">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && isEmpty && (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-500">No documents yet</p>
            <p className="mt-1 text-xs text-slate-400">Upload documents from the Documents page first.</p>
          </div>
        )}

        {!loading && !error && tree && !isEmpty && (
          <FolderTree
            folders={tree.folders}
            documents={tree.documents}
            selection={selection}
            onSelectFolder={onSelectFolder}
            onSelectDocument={onSelectDocument}
          />
        )}
      </div>
    </aside>
  );
}

"use client";

import type { DocumentTree } from "@/lib/api";
import FolderTree, { type Selection } from "@/components/document/FolderTree";

interface AskSidebarProps {
  tree: DocumentTree | null;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  selection: Selection;
  onSelectFolder: (id: number) => void;
  onSelectDocument: (id: number) => void;
  onSelectAll: () => void;
}

const ALL_DOCUMENTS_ICON = "\u{1F4DA}"; // 📚

/**
 * The Ask page's document-scope sidebar (Phase 6B). Reuses `FolderTree`
 * (the same recursive tree renderer `DocumentSidebar` uses for
 * `/summaries`) and `useDocumentTree`'s fetch/selection state unchanged --
 * no new tree-fetching logic, no new backend calls. What's new here is
 * purely presentational: a title, a prominent "All Documents" row above
 * the tree (selection === null), and Ask-specific chrome that doesn't
 * belong on `/summaries`' read-only sidebar (which has no "all" scope --
 * Phase 5 explicitly rejects it) -- which is why this is its own
 * component rather than a further-overloaded `DocumentSidebar`.
 */
export default function AskSidebar({
  tree,
  loading,
  error,
  isEmpty,
  selection,
  onSelectFolder,
  onSelectDocument,
  onSelectAll,
}: AskSidebarProps) {
  const allSelected = selection === null;

  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
      <p className="mt-1 px-1 text-xs text-slate-400">
        Select a scope for your question -- a folder includes its nested subfolders.
      </p>

      <button
        type="button"
        onClick={onSelectAll}
        className={`mt-3 flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
          allSelected ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
        }`}
        aria-current={allSelected ? "true" : undefined}
      >
        <span aria-hidden className="mt-0.5 shrink-0 text-base">
          {ALL_DOCUMENTS_ICON}
        </span>
        <span className="min-w-0">
          <span className={`block text-sm font-medium ${allSelected ? "text-slate-900" : "text-slate-700"}`}>
            All Documents
          </span>
          <span className="block text-xs text-slate-400">Ask about all documents</span>
        </span>
      </button>

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

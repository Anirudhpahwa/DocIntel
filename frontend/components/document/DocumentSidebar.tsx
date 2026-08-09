"use client";

import type { DocumentItem, DocumentTree, FolderNode } from "@/lib/api";
import FolderTree, { type Selection } from "@/components/document/FolderTree";
import UploadControls from "@/components/document/UploadControls";

interface DocumentSidebarProps {
  tree: DocumentTree | null;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  selection: Selection;
  onSelectFolder: (id: number) => void;
  onSelectDocument: (id: number) => void;
  onRefresh?: () => void;
  // Delete actions and upload are only wired up where the workspace is
  // meant to manage documents (the /documents page). The Ask and
  // Summaries workspaces (Phase 6) reuse this same sidebar purely for
  // scope selection and simply omit these — FolderTree hides delete
  // buttons when its handlers aren't provided, and UploadControls is
  // only rendered when onUploaded is given.
  onDeleteFolder?: (folder: FolderNode) => void;
  onDeleteDocument?: (document: DocumentItem) => void;
  onUploaded?: () => void;
}

/**
 * The document tree sidebar shared by every workspace that needs scope
 * selection (Documents, Ask, Summaries — Phase 6). Extracted from
 * DocumentExplorer.tsx's original inline `<aside>` markup so the tree UI
 * itself is never duplicated across routes.
 */
export default function DocumentSidebar({
  tree,
  loading,
  error,
  isEmpty,
  selection,
  onSelectFolder,
  onSelectDocument,
  onRefresh,
  onDeleteFolder,
  onDeleteDocument,
  onUploaded,
}: DocumentSidebarProps) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
        {tree && onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs text-slate-400 hover:text-slate-600"
            title="Refresh"
            aria-label="Refresh document tree"
          >
            ⟳
          </button>
        )}
      </div>

      <div className="mt-3">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}

        {!loading && error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && !error && isEmpty && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">No documents yet</p>
            <p className="text-xs text-slate-400">Upload files or a folder to get started.</p>
          </div>
        )}

        {!loading && !error && tree && !isEmpty && (
          <FolderTree
            folders={tree.folders}
            documents={tree.documents}
            selection={selection}
            onSelectFolder={onSelectFolder}
            onSelectDocument={onSelectDocument}
            onDeleteFolder={onDeleteFolder}
            onDeleteDocument={onDeleteDocument}
          />
        )}
      </div>

      {onUploaded && <UploadControls onUploaded={onUploaded} />}
    </aside>
  );
}

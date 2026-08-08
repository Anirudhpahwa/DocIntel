"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteDocument, deleteFolder, fetchDocumentTree } from "@/lib/api";
import type { DocumentItem, DocumentTree, FolderNode } from "@/lib/api";
import { findDocumentById, findFolderById } from "@/lib/tree";
import FolderTree, { type Selection } from "@/components/document/FolderTree";
import UploadControls from "@/components/document/UploadControls";
import { DocumentFileDetail, DocumentFolderDetail } from "@/components/document/DocumentDetail";
import WelcomePanel from "@/components/WelcomePanel";

/** Owns the document tree + selection state and lays out the sidebar/main split. */
export default function DocumentExplorer() {
  const [tree, setTree] = useState<DocumentTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  // Stable, reusable refresh — called from event handlers (upload/delete),
  // never directly from an effect.
  const loadTree = useCallback(async () => {
    try {
      const data = await fetchDocumentTree();
      setTree(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch on mount, inlined (not via loadTree) so state updates stay
  // scoped to this effect's own cancellation guard.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await fetchDocumentTree();
        if (cancelled) return;
        setTree(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load documents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDeleteFolder(folder: FolderNode) {
    const confirmed = window.confirm(
      `Delete folder "${folder.name}" and everything inside it? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await deleteFolder(folder.id);
      if (selection?.type === "folder" && selection.id === folder.id) setSelection(null);
      await loadTree();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  }

  async function handleDeleteDocument(document: DocumentItem) {
    const confirmed = window.confirm(`Delete "${document.name}"? This cannot be undone.`);
    if (!confirmed) return;

    try {
      await deleteDocument(document.id);
      if (selection?.type === "document" && selection.id === document.id) setSelection(null);
      await loadTree();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete document");
    }
  }

  const selectedFolder =
    tree && selection?.type === "folder" ? findFolderById(tree, selection.id) : null;
  const selectedDocument =
    tree && selection?.type === "document" ? findDocumentById(tree, selection.id) : null;
  const isEmpty = tree !== null && tree.folders.length === 0 && tree.documents.length === 0;

  return (
    <div className="flex flex-1">
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 md:block">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Documents
          </h2>
          {tree && (
            <button
              type="button"
              onClick={loadTree}
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

          {!loading && error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

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
              onSelectFolder={(id) => setSelection({ type: "folder", id })}
              onSelectDocument={(id) => setSelection({ type: "document", id })}
              onDeleteFolder={handleDeleteFolder}
              onDeleteDocument={handleDeleteDocument}
            />
          )}
        </div>

        <UploadControls onUploaded={loadTree} />
      </aside>

      <main className="flex-1 p-6">
        {selectedDocument && <DocumentFileDetail document={selectedDocument} />}
        {selectedFolder && !selectedDocument && <DocumentFolderDetail folder={selectedFolder} />}
        {!selectedDocument && !selectedFolder && <WelcomePanel />}
      </main>
    </div>
  );
}

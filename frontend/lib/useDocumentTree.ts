"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteDocument, deleteFolder, fetchDocumentTree } from "@/lib/api";
import type { DocumentItem, DocumentTree, FolderNode, QueryScope } from "@/lib/api";
import { findDocumentById, findFolderById } from "@/lib/tree";
import type { Selection } from "@/components/document/FolderTree";

/**
 * Owns the document tree fetch + selection state shared by every workspace
 * that needs to browse/select a document or folder (Documents, Ask,
 * Summaries) — extracted from what used to be inline state in
 * DocumentExplorer.tsx (Phase 6) so each route's page can reuse the exact
 * same tree-loading/selection/scope-derivation logic instead of
 * duplicating it per page.
 */
export function useDocumentTree() {
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

  const queryScope: QueryScope = selectedDocument
    ? { type: "document", id: selectedDocument.id }
    : selectedFolder
      ? { type: "folder", id: selectedFolder.id }
      : { type: "all" };
  const scopeLabel = selectedDocument?.name ?? selectedFolder?.name ?? "all documents";

  return {
    tree,
    loading,
    error,
    isEmpty,
    selection,
    setSelection,
    selectedFolder,
    selectedDocument,
    queryScope,
    scopeLabel,
    loadTree,
    handleDeleteFolder,
    handleDeleteDocument,
  };
}

"use client";

import { useDocumentTree } from "@/lib/useDocumentTree";
import DocumentSidebar from "@/components/document/DocumentSidebar";
import { DocumentFileDetail, DocumentFolderDetail } from "@/components/document/DocumentDetail";

/** Nothing selected yet — contextual to the Documents workspace (Phase 6). */
function NothingSelected() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8">
      <h2 className="text-lg font-semibold text-slate-900">Select a file or folder</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
        Choose an item from the tree on the left to see its details, or
        upload files or a folder to get started.
      </p>
    </section>
  );
}

/**
 * The Documents workspace (`/documents`, Phase 6): browse, upload, and
 * manage the document tree. Owns no tree/selection state itself anymore —
 * that lives in useDocumentTree(), shared with the Ask and Summaries
 * workspaces so the fetch/selection logic is never duplicated. Ask/Summary
 * functionality lives on their own dedicated routes now, not here.
 */
export default function DocumentExplorer() {
  const {
    tree,
    loading,
    error,
    isEmpty,
    selection,
    setSelection,
    selectedFolder,
    selectedDocument,
    loadTree,
    handleDeleteFolder,
    handleDeleteDocument,
  } = useDocumentTree();

  return (
    <div className="flex flex-1">
      <DocumentSidebar
        tree={tree}
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        selection={selection}
        onSelectFolder={(id) => setSelection({ type: "folder", id })}
        onSelectDocument={(id) => setSelection({ type: "document", id })}
        onRefresh={loadTree}
        onDeleteFolder={handleDeleteFolder}
        onDeleteDocument={handleDeleteDocument}
        onUploaded={loadTree}
      />

      <main className="flex-1 p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {selectedDocument && <DocumentFileDetail document={selectedDocument} />}
          {selectedFolder && !selectedDocument && <DocumentFolderDetail folder={selectedFolder} />}
          {!selectedDocument && !selectedFolder && <NothingSelected />}
        </div>
      </main>
    </div>
  );
}

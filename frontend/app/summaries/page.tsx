"use client";

import { useDocumentTree } from "@/lib/useDocumentTree";
import DocumentSidebar from "@/components/document/DocumentSidebar";
import SummaryPanel from "@/components/document/SummaryPanel";
import type { SummaryScope } from "@/lib/api";

const FILE_ICON = "\u{1F4C4}"; // 📄
const FOLDER_ICON = "\u{1F4C1}"; // 📁

/** Shown until a document or folder is selected — summarization has no "all documents" scope (§16). */
function NothingSelected() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-8">
      <h2 className="text-lg font-semibold text-slate-900">Select a document or folder</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
        Choose a file or folder from the tree on the left, then generate a
        summary of its contents.
      </p>
    </section>
  );
}

/**
 * Summaries workspace (`/summaries`, Phase 6): dedicated summarization
 * page. Reuses the same tree/selection state as Documents/Ask
 * (useDocumentTree) for scope selection only — no upload/delete here.
 * Reuses SummaryPanel and the existing /api/summarize flow unchanged.
 * Unlike Ask, summarization has no "all documents" scope (the backend
 * rejects it with 422 — see docs/CLAUDE_CONTEXT.md §16), so nothing is
 * rendered here until a specific document or folder is selected.
 */
export default function SummariesPage() {
  const {
    tree,
    loading,
    error,
    isEmpty,
    selection,
    setSelection,
    selectedFolder,
    selectedDocument,
    scopeLabel,
  } = useDocumentTree();

  const summaryScope: SummaryScope | null = selectedDocument
    ? { type: "document", id: selectedDocument.id }
    : selectedFolder
      ? { type: "folder", id: selectedFolder.id }
      : null;

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
      />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          {summaryScope ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8">
              <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <span aria-hidden>{selectedDocument ? FILE_ICON : FOLDER_ICON}</span>
                {scopeLabel}
              </p>
              <SummaryPanel key={`${summaryScope.type}-${summaryScope.id}`} scope={summaryScope} />
            </div>
          ) : (
            <NothingSelected />
          )}
        </div>
      </main>
    </div>
  );
}

"use client";

import { useDocumentTree } from "@/lib/useDocumentTree";
import SummariesSidebar from "@/components/document/SummariesSidebar";
import SummaryPanel, { type SummaryTarget } from "@/components/document/SummaryPanel";

/** Shown until a document or folder is selected -- summarization has no
 * "all documents" scope (Phase 5, §16): the backend rejects `scope.type:
 * "all"` with a 422, so this page never offers or implies that option. */
function NothingSelected() {
  return (
    <section className="rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
      <h2 className="text-base font-medium text-slate-700">Generate document summaries</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Select a document or folder from the left to generate an AI-powered summary.
      </p>
    </section>
  );
}

/**
 * Summaries workspace (`/summaries`, Phase 6C): select a document or
 * folder on the left, generate its summary on the right. Reuses
 * `useDocumentTree()` unchanged for tree fetch/selection state (same hook
 * Documents/Ask use) and `generateSummary`/`POST /api/summarize`
 * unchanged for the actual call -- no backend file touched.
 *
 * `SummaryTarget` carries the real `DocumentItem`/`FolderNode` (not just
 * an id) so `SummaryPanel` can render actual metadata (file type,
 * processing status, recursive document count) without a second fetch --
 * `selectedFolder`/`selectedDocument` already come fully populated from
 * the shared tree.
 */
export default function SummariesPage() {
  const { tree, loading, error, isEmpty, selection, setSelection, selectedFolder, selectedDocument } =
    useDocumentTree();

  const target: SummaryTarget | null = selectedDocument
    ? { kind: "document", document: selectedDocument }
    : selectedFolder
      ? { kind: "folder", folder: selectedFolder }
      : null;

  return (
    <div className="flex flex-1">
      <SummariesSidebar
        tree={tree}
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        selection={selection}
        onSelectFolder={(id) => setSelection({ type: "folder", id })}
        onSelectDocument={(id) => setSelection({ type: "document", id })}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          {target ? (
            <SummaryPanel key={`${target.kind}-${target.kind === "document" ? target.document.id : target.folder.id}`} target={target} />
          ) : (
            <NothingSelected />
          )}
        </div>
      </main>
    </div>
  );
}

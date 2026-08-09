"use client";

import { useDocumentTree } from "@/lib/useDocumentTree";
import DocumentSidebar from "@/components/document/DocumentSidebar";
import AskPanel from "@/components/document/AskPanel";

/**
 * Ask workspace (`/ask`, Phase 6): dedicated Q&A page. Reuses the same
 * tree/selection state as Documents/Summaries (useDocumentTree) purely for
 * scope selection — no upload or delete actions here, this page is about
 * asking questions, not managing documents. Reuses AskPanel and the
 * existing /api/query flow completely unchanged; scope defaults to "all
 * documents" when nothing is selected, exactly like before Phase 6.
 */
export default function AskPage() {
  const { tree, loading, error, isEmpty, selection, setSelection, queryScope, scopeLabel } =
    useDocumentTree();

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
          <AskPanel
            key={`${queryScope.type}-${"id" in queryScope ? queryScope.id : "all"}`}
            scope={queryScope}
            scopeLabel={scopeLabel}
          />
        </div>
      </main>
    </div>
  );
}

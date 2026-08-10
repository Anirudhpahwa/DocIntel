"use client";

import { useDocumentTree } from "@/lib/useDocumentTree";
import AskSidebar from "@/components/document/AskSidebar";
import AskPanel from "@/components/document/AskPanel";

/**
 * Ask workspace (`/ask`, Phase 6B): a dedicated question-answering
 * workspace -- select a scope on the left, ask a plain-English question
 * on the right, see a grounded answer and its backend-selected sources.
 *
 * Reuses `useDocumentTree()` unchanged for tree fetch/selection state
 * (same hook Documents/Summaries use -- no duplicated fetch logic) and
 * `askQuestion`/`POST /api/query` unchanged for the actual RAG call. Only
 * new pieces are presentational: `AskSidebar` (adds the "All Documents"
 * option atop the existing `FolderTree`) and a rewritten `AskPanel`
 * (empty state, example questions, mapped error copy, formatted
 * answer/sources). No backend file, database, or API contract changed.
 */
export default function AskPage() {
  const { tree, loading, error, isEmpty, selection, setSelection, queryScope, scopeLabel } =
    useDocumentTree();

  return (
    <div className="flex flex-1">
      <AskSidebar
        tree={tree}
        loading={loading}
        error={error}
        isEmpty={isEmpty}
        selection={selection}
        onSelectFolder={(id) => setSelection({ type: "folder", id })}
        onSelectDocument={(id) => setSelection({ type: "document", id })}
        onSelectAll={() => setSelection(null)}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
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

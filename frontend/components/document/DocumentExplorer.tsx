"use client";

import { useMemo, useState } from "react";
import { useDocumentTree } from "@/lib/useDocumentTree";
import type { DocumentTree, FolderNode } from "@/lib/api";
import UploadControls from "@/components/document/UploadControls";
import Breadcrumbs from "@/components/document/Breadcrumbs";
import FolderCard from "@/components/document/FolderCard";
import FileRow from "@/components/document/FileRow";
import { DocumentFolderDetail } from "@/components/document/DocumentDetail";
import DocumentPreview from "@/components/document/DocumentPreview";

/**
 * Walks the tree from the root using a chain of folder ids, stopping at the
 * first id that no longer resolves (e.g. the folder was just deleted).
 * `folderPathIds` (DocumentExplorer's own navigation state) is therefore
 * never a second copy of tree data -- it's just a list of ids, always
 * re-resolved against the current `tree` on every render, so a tree
 * refresh (upload/delete) can never leave the breadcrumb pointing at a
 * stale/non-existent folder.
 */
function resolveFolderPath(tree: DocumentTree | null, ids: number[]): FolderNode[] {
  if (!tree) return [];
  const path: FolderNode[] = [];
  let level = tree.folders;
  for (const id of ids) {
    const found = level.find((f) => f.id === id);
    if (!found) break;
    path.push(found);
    level = found.folders;
  }
  return path;
}

/**
 * The Documents workspace (`/documents`, Phase 6A): a folder-card/grid
 * browser -- browse top-level folders, open one to see its contents,
 * navigate deeper, select a file to see its details -- replacing the old
 * sidebar-tree + single large detail-card layout.
 *
 * Still owns no tree-fetch/delete logic itself; all of that stays in
 * useDocumentTree(), shared unchanged with Ask/Summaries (rule: don't
 * duplicate tree state, docs/CLAUDE_CONTEXT.md §32 rule 20). The only new
 * state here is purely local UI navigation -- which folder is "open" and
 * the search text -- neither of which Ask/Summaries have any use for.
 *
 * `selection` (from the shared hook) is reused here to mean "the selected
 * file, currently open in preview" (Phase 7) -- this page never sets it to
 * a folder selection; opening a folder is expressed as navigation
 * (folderPathIds) instead, with the open folder's own info/summary shown
 * inline via DocumentFolderDetail's compact mode.
 *
 * Selecting a document now swaps the entire main content area for
 * `DocumentPreview` (PDF/DOCX/TXT content, full width -- a narrow side
 * panel isn't wide enough to make a document actually readable) instead
 * of the old side-panel `DocumentFileDetail`. `folderPathIds`/`search`
 * are untouched by opening or closing a preview, so closing it returns
 * the user to the exact same folder/search context they were browsing --
 * never back to the Documents root or the Dashboard.
 */
export default function DocumentExplorer() {
  const {
    tree,
    loading,
    error,
    isEmpty,
    setSelection,
    selectedDocument,
    loadTree,
    handleDeleteFolder,
    handleDeleteDocument,
  } = useDocumentTree();

  const [folderPathIds, setFolderPathIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");

  const folderPath = useMemo(() => resolveFolderPath(tree, folderPathIds), [tree, folderPathIds]);
  const currentFolder = folderPath[folderPath.length - 1] ?? null;

  const subfolders = currentFolder ? currentFolder.folders : (tree?.folders ?? []);
  const files = currentFolder ? currentFolder.documents : (tree?.documents ?? []);

  const query = search.trim().toLowerCase();
  const filteredSubfolders = query
    ? subfolders.filter((f) => f.name.toLowerCase().includes(query))
    : subfolders;
  const filteredFiles = query ? files.filter((d) => d.name.toLowerCase().includes(query)) : files;

  const levelHasContent = subfolders.length > 0 || files.length > 0;
  const hasSearchResults = filteredSubfolders.length > 0 || filteredFiles.length > 0;

  function openFolder(folder: FolderNode) {
    setFolderPathIds([...folderPath.map((f) => f.id), folder.id]);
    setSelection(null);
  }

  /** depth 0 = "Documents" root, depth N = folderPath[N - 1]. */
  function goToBreadcrumb(depth: number) {
    setFolderPathIds(folderPath.slice(0, depth).map((f) => f.id));
    setSelection(null);
  }

  /** Always exactly one level up from wherever the user currently is -- the
   * immediate parent folder, or the top-level Documents view if there isn't
   * one. Just `goToBreadcrumb` one level shallower than the current depth. */
  function goToParent() {
    goToBreadcrumb(folderPath.length - 1);
  }

  return (
    <main className="flex-1 p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Documents</h1>
            <p className="mt-1 text-sm text-slate-500">Browse, manage and explore your documents</p>
          </div>
          {tree && !isEmpty && !selectedDocument && (
            <UploadControls variant="toolbar" onUploaded={loadTree} />
          )}
        </div>

        {tree && !isEmpty && selectedDocument && (
          // Previewing a document: the normal breadcrumb/search row is
          // replaced by a single, unambiguous way back. folderPathIds and
          // search are untouched here, so closing the preview (below)
          // returns to this exact same folder/search context.
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="flex w-fit cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <span aria-hidden>&larr;</span>
            Back to Documents
          </button>
        )}

        {tree && !isEmpty && !selectedDocument && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-sm">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                {"\u{1F50D}"}
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search folders and documents…"
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              {folderPath.length > 0 && (
                <button
                  type="button"
                  onClick={goToParent}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-slate-500 hover:text-slate-900"
                  aria-label={`Back to ${
                    folderPath.length > 1 ? folderPath[folderPath.length - 2].name : "Documents"
                  }`}
                >
                  <span aria-hidden>&larr;</span>
                  Back
                </button>
              )}
              <Breadcrumbs folderPath={folderPath} onNavigate={goToBreadcrumb} />
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-slate-400">Loading documents…</p>}

        {!loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && isEmpty && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-base font-medium text-slate-700">No documents yet</p>
            <p className="max-w-sm text-sm text-slate-500">
              Upload files or a folder to start building your document workspace.
            </p>
            <div className="mt-2">
              <UploadControls variant="toolbar" onUploaded={loadTree} />
            </div>
          </div>
        )}

        {!loading && !error && tree && !isEmpty && selectedDocument && (
          <DocumentPreview
            key={selectedDocument.id}
            document={selectedDocument}
            onDelete={() => handleDeleteDocument(selectedDocument)}
            onClose={() => setSelection(null)}
          />
        )}

        {!loading && !error && tree && !isEmpty && !selectedDocument && (
          <div className="space-y-6">
            {currentFolder && (
              <DocumentFolderDetail
                folder={currentFolder}
                onDelete={() => handleDeleteFolder(currentFolder)}
              />
            )}

            {!levelHasContent && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                This folder is empty.
              </p>
            )}

            {levelHasContent && query && !hasSearchResults && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                No folders or documents match &ldquo;{search.trim()}&rdquo;.
              </p>
            )}

            {filteredSubfolders.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {currentFolder ? "Subfolders" : "Top Level Folders"} ({filteredSubfolders.length})
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredSubfolders.map((folder) => (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      onOpen={() => openFolder(folder)}
                      onDelete={() => handleDeleteFolder(folder)}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredFiles.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {currentFolder ? "Files" : "Top Level Files"} ({filteredFiles.length})
                </h2>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                  {filteredFiles.map((document) => (
                    <FileRow
                      key={document.id}
                      document={document}
                      selected={false}
                      onSelect={() => setSelection({ type: "document", id: document.id })}
                      onDelete={() => handleDeleteDocument(document)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

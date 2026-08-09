"use client";

import type { FolderNode } from "@/lib/api";

interface BreadcrumbsProps {
  /** Ancestor chain from top-level down to the currently open folder (empty = root). */
  folderPath: FolderNode[];
  /** depth 0 = "Documents" root, depth N = folderPath[N - 1]. */
  onNavigate: (depth: number) => void;
}

/**
 * "Documents / Folder / Subfolder" trail above the Documents page's folder
 * contents (Phase 6A). Purely client-side: it navigates the page's local
 * folder-path state (see DocumentExplorer.tsx), not a route or a backend
 * call, per spec ("do not add unnecessary routing or backend logic").
 */
export default function Breadcrumbs({ folderPath, onNavigate }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate(0)}
        aria-current={folderPath.length === 0 ? "page" : undefined}
        className={
          folderPath.length === 0
            ? "font-medium text-slate-900"
            : "text-slate-500 hover:text-slate-900"
        }
      >
        Documents
      </button>
      {folderPath.map((folder, index) => (
        <span key={folder.id} className="flex items-center gap-1">
          <span aria-hidden className="text-slate-300">
            /
          </span>
          <button
            type="button"
            onClick={() => onNavigate(index + 1)}
            aria-current={index === folderPath.length - 1 ? "page" : undefined}
            className={`truncate ${
              index === folderPath.length - 1
                ? "font-medium text-slate-900"
                : "text-slate-500 hover:text-slate-900"
            }`}
            title={folder.name}
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

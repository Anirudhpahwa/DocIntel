"use client";

import type { FolderNode } from "@/lib/api";
import { countContents } from "@/lib/tree";

const FOLDER_ICON = "\u{1F4C1}"; // 📁

interface FolderCardProps {
  folder: FolderNode;
  onOpen: () => void;
  onDelete?: () => void;
}

/**
 * A single folder card in the Documents page's folder grid (Phase 6A).
 * Counts are recursive (nested subfolders included), reusing the same
 * `countContents` helper the old detail card and the folder-tree sidebar
 * already rely on -- one counting implementation, not a new one.
 */
export default function FolderCard({ folder, onOpen, onDelete }: FolderCardProps) {
  const { documents, folders } = countContents(folder);

  return (
    <div className="group relative flex cursor-pointer flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:shadow-sm">
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-2 top-2 hidden cursor-pointer rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
          aria-label={`Delete folder ${folder.name}`}
          title="Delete folder"
        >
          &times;
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex cursor-pointer flex-col items-start gap-2 text-left"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-lg"
        >
          {FOLDER_ICON}
        </span>
        <span className="w-full truncate text-sm font-medium text-slate-900" title={folder.name}>
          {folder.name}
        </span>
      </button>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>
          {documents} document{documents === 1 ? "" : "s"}
        </span>
        <span>
          {folders} folder{folders === 1 ? "" : "s"}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-1 cursor-pointer rounded-md border border-slate-200 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Open
      </button>
    </div>
  );
}

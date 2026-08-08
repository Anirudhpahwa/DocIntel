"use client";

import { useState } from "react";
import type { FolderNode } from "@/lib/api";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";

export type Selection = { type: "folder" | "document"; id: number } | null;

interface FolderTreeProps {
  folders: FolderNode[];
  documents: FolderNode["documents"];
  selection: Selection;
  onSelectFolder: (id: number) => void;
  onSelectDocument: (id: number) => void;
  onDeleteFolder: (folder: FolderNode) => void;
  onDeleteDocument: (document: FolderNode["documents"][number]) => void;
  depth?: number;
}

const FILE_ICON = "\u{1F4C4}"; // 📄
const FOLDER_ICON = "\u{1F4C1}"; // 📁

export default function FolderTree({
  folders,
  documents,
  selection,
  onSelectFolder,
  onSelectDocument,
  onDeleteFolder,
  onDeleteDocument,
  depth = 0,
}: FolderTreeProps) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "ml-4 space-y-0.5 border-l border-slate-100 pl-2"}>
      {folders.map((folder) => (
        <FolderRow
          key={`folder-${folder.id}`}
          folder={folder}
          selection={selection}
          onSelectFolder={onSelectFolder}
          onSelectDocument={onSelectDocument}
          onDeleteFolder={onDeleteFolder}
          onDeleteDocument={onDeleteDocument}
          depth={depth}
        />
      ))}
      {documents.map((doc) => (
        <DocumentRow
          key={`doc-${doc.id}`}
          document={doc}
          selected={selection?.type === "document" && selection.id === doc.id}
          onSelect={onSelectDocument}
          onDelete={onDeleteDocument}
        />
      ))}
    </ul>
  );
}

function FolderRow({
  folder,
  selection,
  onSelectFolder,
  onSelectDocument,
  onDeleteFolder,
  onDeleteDocument,
  depth,
}: {
  folder: FolderNode;
  selection: Selection;
  onSelectFolder: (id: number) => void;
  onSelectDocument: (id: number) => void;
  onDeleteFolder: (folder: FolderNode) => void;
  onDeleteDocument: (document: FolderNode["documents"][number]) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isSelected = selection?.type === "folder" && selection.id === folder.id;
  const isEmpty = folder.folders.length === 0 && folder.documents.length === 0;

  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm ${
          isSelected ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-4 shrink-0 text-center text-[10px] text-slate-400"
          aria-label={expanded ? "Collapse folder" : "Expand folder"}
          disabled={isEmpty}
        >
          {isEmpty ? "" : expanded ? "▾" : "▸"}
        </button>
        <button
          type="button"
          onClick={() => onSelectFolder(folder.id)}
          className="flex flex-1 items-center gap-1.5 truncate text-left"
          title={folder.path}
        >
          <span aria-hidden>{FOLDER_ICON}</span>
          <span className="truncate">{folder.name}</span>
        </button>
        <button
          type="button"
          onClick={() => onDeleteFolder(folder)}
          className="hidden shrink-0 rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
          aria-label={`Delete folder ${folder.name}`}
          title="Delete folder"
        >
          &times;
        </button>
      </div>

      {expanded && !isEmpty && (
        <FolderTree
          folders={folder.folders}
          documents={folder.documents}
          selection={selection}
          onSelectFolder={onSelectFolder}
          onSelectDocument={onSelectDocument}
          onDeleteFolder={onDeleteFolder}
          onDeleteDocument={onDeleteDocument}
          depth={depth + 1}
        />
      )}
    </li>
  );
}

function DocumentRow({
  document,
  selected,
  onSelect,
  onDelete,
}: {
  document: FolderNode["documents"][number];
  selected: boolean;
  onSelect: (id: number) => void;
  onDelete: (document: FolderNode["documents"][number]) => void;
}) {
  return (
    <li>
      <div
        className={`group flex items-center gap-1.5 rounded-md py-1 pl-5 pr-1.5 text-sm ${
          selected ? "bg-slate-100 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(document.id)}
          className="flex flex-1 items-center gap-1.5 truncate text-left"
          title={document.name}
        >
          <span aria-hidden>{FILE_ICON}</span>
          <span className="truncate">{document.name}</span>
        </button>
        {(() => {
          const status = PROCESSING_STATUS_DISPLAY[document.processing_status];
          return (
            <span
              aria-hidden
              className={`shrink-0 text-xs ${status.colorClassName} ${status.spin ? "animate-spin" : ""}`}
              title={
                document.processing_status === "failed" && document.processing_error
                  ? `Failed: ${document.processing_error}`
                  : status.label
              }
            >
              {status.icon}
            </span>
          );
        })()}
        <button
          type="button"
          onClick={() => onDelete(document)}
          className="hidden shrink-0 rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
          aria-label={`Delete ${document.name}`}
          title="Delete file"
        >
          &times;
        </button>
      </div>
    </li>
  );
}

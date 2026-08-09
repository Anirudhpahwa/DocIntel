"use client";

import type { DocumentItem } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { PROCESSING_STATUS_DISPLAY } from "@/lib/processingStatus";

const FILE_ICON = "\u{1F4C4}"; // 📄

interface FileRowProps {
  document: DocumentItem;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

/**
 * A single file row in the Documents page's files list (Phase 6A) --
 * deliberately a compact list row rather than a folder-sized card, per
 * spec ("Files should NOT use the same visual treatment as folders").
 * Selecting a row only highlights it and is meant to feed a detail panel;
 * it does not open/preview the file (preview is explicitly Phase 7).
 */
export default function FileRow({ document, selected, onSelect, onDelete }: FileRowProps) {
  const status = PROCESSING_STATUS_DISPLAY[document.processing_status];

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 text-sm ${
        selected ? "bg-slate-50" : "hover:bg-slate-50"
      }`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span aria-hidden className="shrink-0 text-lg">
          {FILE_ICON}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${selected ? "font-medium text-slate-900" : "text-slate-800"}`}
            title={document.name}
          >
            {document.name}
          </span>
          <span className="mt-0.5 block text-xs text-slate-400">
            {document.file_type.toUpperCase()} &middot; {formatBytes(document.file_size)} &middot;{" "}
            <span
              className={`${status.colorClassName} ${status.spin ? "inline-block animate-spin" : ""}`}
            >
              {status.icon}
            </span>{" "}
            <span className={status.colorClassName}>{status.label}</span>
          </span>
        </span>
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete()}
          className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
          aria-label={`Delete ${document.name}`}
          title="Delete file"
        >
          &times;
        </button>
      )}
    </div>
  );
}

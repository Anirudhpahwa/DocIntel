"use client";

import { useEffect, useRef, useState } from "react";
import { uploadDocuments, type UploadResponse } from "@/lib/api";

interface UploadControlsProps {
  onUploaded: () => void;
  // "sidebar" (default): the original stacked, compact buttons used in
  // DocumentSidebar (also reused read-only-free by Ask/Summaries, though
  // they never pass onUploaded so this component doesn't render there).
  // "toolbar": prominent side-by-side buttons for the Documents page header
  // (Phase 6A). "cards": two full quick-action-card buttons for the
  // Dashboard's Quick Actions grid (Phase 6D), visually matching its
  // Link-based "Ask a Question"/"Browse Documents" cards. All three variants
  // share the same upload logic/inputs below — just different button
  // layouts, so there is still exactly one upload implementation.
  variant?: "sidebar" | "toolbar" | "cards";
}

function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath && withPath.webkitRelativePath.length > 0
    ? withPath.webkitRelativePath
    : file.name;
}

export default function UploadControls({ onUploaded, variant = "sidebar" }: UploadControlsProps) {
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // webkitdirectory/directory aren't in React's typed input attributes —
  // set them imperatively so this stays valid TSX.
  useEffect(() => {
    const input = folderInputRef.current;
    input?.setAttribute("webkitdirectory", "");
    input?.setAttribute("directory", "");
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const relativePaths = files.map(relativePathOf);

    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const response = await uploadDocuments(files, relativePaths);
      setResult(response);
      if (response.created + response.replaced > 0) {
        onUploaded();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const inputs = (
    <>
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  if (variant === "cards") {
    return (
      <>
        {inputs}
        <button
          type="button"
          disabled={uploading}
          onClick={() => filesInputRef.current?.click()}
          className="group flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base text-slate-600">
            {"\u{2B06}"}
          </span>
          <span>
            <span className="block text-sm font-medium text-slate-900">Upload Files</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
              Upload documents from your device
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => folderInputRef.current?.click()}
          className="group flex flex-col items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-base text-slate-600">
            {"\u{1F4C1}"}
          </span>
          <span>
            <span className="block text-sm font-medium text-slate-900">Upload Folder</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
              Upload a folder with documents
            </span>
          </span>
        </button>
        {(uploading || error || result) && (
          <div className="col-span-2 -mt-2">
            {uploading && <p className="text-xs text-slate-400">Uploading…</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            {result && <UploadResultSummary result={result} onDismiss={() => setResult(null)} />}
          </div>
        )}
      </>
    );
  }

  if (variant === "toolbar") {
    return (
      <div className="flex flex-col items-end gap-2">
        {inputs}
        <div className="flex items-center gap-2">
          {uploading && <span className="text-xs text-slate-400">Uploading…</span>}
          <button
            type="button"
            disabled={uploading}
            onClick={() => filesInputRef.current?.click()}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Upload Files
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => folderInputRef.current?.click()}
            className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Upload Folder
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {result && (
          <div className="w-full max-w-sm">
            <UploadResultSummary result={result} onDismiss={() => setResult(null)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
      {inputs}

      <button
        type="button"
        disabled={uploading}
        onClick={() => filesInputRef.current?.click()}
        className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Upload Files
      </button>
      <button
        type="button"
        disabled={uploading}
        onClick={() => folderInputRef.current?.click()}
        className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Upload Folder
      </button>

      {uploading && <p className="text-xs text-slate-400">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {result && <UploadResultSummary result={result} onDismiss={() => setResult(null)} />}
    </div>
  );
}

function UploadResultSummary({
  result,
  onDismiss,
}: {
  result: UploadResponse;
  onDismiss: () => void;
}) {
  const uploadFailures = result.results.filter((r) => r.status === "error");
  const processingFailures = result.results.filter(
    (r) => r.status !== "error" && r.processing_status === "failed"
  );

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-slate-600">
          {result.created} created, {result.replaced} replaced
          {result.failed > 0 && <span className="text-red-600">, {result.failed} failed</span>}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-slate-400 hover:text-slate-600"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
      {(uploadFailures.length > 0 || processingFailures.length > 0) && (
        <ul className="mt-1.5 space-y-1 border-t border-slate-200 pt-1.5">
          {uploadFailures.map((item) => (
            <li key={`upload-${item.relative_path}`} className="text-red-600">
              <span className="font-medium">{item.filename}:</span> {item.error}
            </li>
          ))}
          {processingFailures.map((item) => (
            <li key={`processing-${item.relative_path}`} className="text-amber-600">
              <span className="font-medium">{item.filename}:</span> uploaded, but indexing failed
              — {item.processing_error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

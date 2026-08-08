"use client";

import { useEffect, useRef, useState } from "react";
import { uploadDocuments, type UploadResponse } from "@/lib/api";

interface UploadControlsProps {
  onUploaded: () => void;
}

function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  return withPath.webkitRelativePath && withPath.webkitRelativePath.length > 0
    ? withPath.webkitRelativePath
    : file.name;
}

export default function UploadControls({ onUploaded }: UploadControlsProps) {
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

  return (
    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
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
  const failedItems = result.results.filter((r) => r.status === "error");

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
      {failedItems.length > 0 && (
        <ul className="mt-1.5 space-y-1 border-t border-slate-200 pt-1.5">
          {failedItems.map((item) => (
            <li key={item.relative_path} className="text-red-600">
              <span className="font-medium">{item.filename}:</span> {item.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

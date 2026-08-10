/**
 * Thin wrapper around the DocIntel backend API.
 *
 * Phase 1 only needs the health endpoint; later phases will extend this
 * file with document/folder/query calls rather than scattering fetch()
 * calls across components.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8010";

export type ServiceStatus = "ok" | "unavailable";

export interface HealthResponse {
  api: ServiceStatus;
  database: ServiceStatus;
  pgvector: ServiceStatus;
  ollama: ServiceStatus;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return response.json();
}

// ---- Documents & folders (Phase 2) ----

export type ProcessingStatus = "pending" | "processing" | "indexed" | "failed";

export interface DocumentItem {
  id: number;
  folder_id: number | null;
  name: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
  processing_status: ProcessingStatus;
  processing_error: string | null;
}

export interface FolderNode {
  id: number;
  name: string;
  parent_id: number | null;
  path: string;
  created_at: string;
  folders: FolderNode[];
  documents: DocumentItem[];
}

export interface DocumentTree {
  folders: FolderNode[];
  documents: DocumentItem[];
}

export async function fetchDocumentTree(): Promise<DocumentTree> {
  const response = await fetch(`${API_BASE_URL}/api/documents/tree`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load document tree (status ${response.status})`);
  }

  return response.json();
}

export interface UploadFileResult {
  filename: string;
  relative_path: string;
  status: "created" | "replaced" | "error";
  document_id: number | null;
  error: string | null;
  processing_status: ProcessingStatus | null;
  processing_error: string | null;
}

export interface UploadResponse {
  results: UploadFileResult[];
  created: number;
  replaced: number;
  failed: number;
}

/**
 * Upload one or more files. `relativePaths[i]` must be the logical path
 * for `files[i]` — just the filename for a flat upload, or
 * "Folder/Sub/file.pdf" for a folder upload (see FileInput helpers below).
 */
export async function uploadDocuments(
  files: File[],
  relativePaths: string[]
): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file, index) => {
    formData.append("files", file);
    formData.append("paths", relativePaths[index]);
  });

  const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Upload failed (status ${response.status})`);
  }

  return response.json();
}

async function deleteRequest(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? `Delete failed (status ${response.status})`);
  }
}

export function deleteDocument(id: number): Promise<void> {
  return deleteRequest(`/api/documents/${id}`);
}

export function deleteFolder(id: number): Promise<void> {
  return deleteRequest(`/api/folders/${id}`);
}

// ---- RAG query (Phase 4) ----

export type QueryScope = { type: "all" } | { type: "folder"; id: number } | { type: "document"; id: number };

export interface QuerySource {
  document_id: number;
  document_name: string;
  page_number: number | null;
}

export interface QueryResponse {
  answer: string;
  sources: QuerySource[];
  chunks_retrieved: number;
}

/**
 * A failed API call, carrying the HTTP status code alongside the message
 * (Phase 6B) -- lets a caller map a specific status (503 Ollama down, 404
 * unknown scope, 422 bad input) to its own friendly copy instead of only
 * having the backend's raw `detail` string. Doesn't change what the
 * backend sends or how; this only captures a field the Response object
 * already had. `instanceof Error`, so existing callers that just read
 * `.message` (uploadDocuments/deleteDocument/generateSummary's callers)
 * are unaffected.
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function askQuestion(question: string, scope: QueryScope): Promise<QueryResponse> {
  const response = await fetch(`${API_BASE_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, scope }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message =
      typeof detail?.detail === "string"
        ? detail.detail
        : Array.isArray(detail?.detail) && detail.detail[0]?.msg
          ? detail.detail[0].msg
          : `Query failed (status ${response.status})`;
    throw new ApiError(message, response.status);
  }

  return response.json();
}

// ---- Summarization (Phase 5) ----

/** Summarization always targets one specific selection -- unlike QueryScope, "all" isn't offered. */
export type SummaryScope = { type: "document" | "folder"; id: number };

export interface SummarizeResponse {
  summary: string;
  documents_included: number;
  chunks_used: number;
}

export async function generateSummary(scope: SummaryScope): Promise<SummarizeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message =
      typeof detail?.detail === "string"
        ? detail.detail
        : Array.isArray(detail?.detail) && detail.detail[0]?.msg
          ? detail.detail[0].msg
          : `Summary generation failed (status ${response.status})`;
    throw new Error(message);
  }

  return response.json();
}

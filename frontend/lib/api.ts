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
    throw new Error(message);
  }

  return response.json();
}

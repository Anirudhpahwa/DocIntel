/**
 * Thin wrapper around the DocIntel backend API.
 *
 * Phase 1 only needs the health endpoint; later phases will extend this
 * file with document/folder/query calls rather than scattering fetch()
 * calls across components.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

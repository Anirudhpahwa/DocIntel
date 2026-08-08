"""
Centralized application configuration.

All configurable values are read from environment variables (via a .env file
in local development). Nothing here should be hardcoded.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> parents[1] = backend/, parents[2] = repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # PostgreSQL connection string, e.g.
    # postgresql+psycopg://docintel:docintel@localhost:5432/docintel
    database_url: str = "postgresql+psycopg://docintel:docintel@localhost:5432/docintel"

    # Ollama runtime (locally installed, not containerized in Phase 1)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # CORS: comma-separated list of allowed frontend origins
    cors_origins: str = "http://localhost:3000"

    # Local filesystem root for uploaded documents (Phase 2). Physical files
    # live under <storage_root>/documents/. Never used to serve/browse
    # arbitrary paths — only through the storage service's safety checks.
    storage_root: str = str(_REPO_ROOT / "storage")

    # Reject uploads larger than this, in megabytes.
    max_upload_size_mb: int = 100

    # Phase 4: RAG settings. Kept configurable rather than hardcoded so
    # they can be tuned without touching retrieval_service.py/rag_service.py.
    rag_top_k: int = 8
    # Minimum cosine similarity (1 - cosine_distance, so 1.0 = identical)
    # a retrieved chunk must clear to be considered relevant. Tuned against
    # test-data/NHSRCL-Demo: all-MiniLM-L6-v2 puts genuinely off-topic
    # questions (e.g. general world knowledge) around ~0.13-0.20 similarity
    # against this corpus, while on-topic chunks — even ones that don't
    # contain the specific fact asked about — land at ~0.25 and up. 0.2
    # sits in the gap: low enough to keep real answers in (a straight
    # "what date is this report" question's correct chunk scored 0.28),
    # high enough to reject pure noise before ever calling the LLM. See
    # README for the measurements this was based on.
    rag_similarity_threshold: float = 0.2
    rag_max_question_length: int = 2000
    ollama_timeout_seconds: int = 60
    # Low, not zero: keeps answers deterministic-ish and reduces the small
    # local model's tendency to "reason" its way into an inconsistent
    # numeric synthesis, without making it totally rigid.
    ollama_temperature: float = 0.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()

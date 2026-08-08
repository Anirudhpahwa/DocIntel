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

    # Phase 5: summarization settings. Character budget for the built
    # summarization context (DOCUMENT/SOURCE_CHUNK blocks, see
    # summary_service.py) above which a single-pass prompt is abandoned in
    # favor of a two-stage map->combine summarization instead. Measured
    # against test-data/NHSRCL-Demo: the entire nested corpus (5 documents,
    # 8 chunks) is ~2,700 characters total, so 12,000 leaves generous
    # headroom while still comfortably fitting the single-pass path for
    # this project's actual demo scale — see README for the measurement.
    summary_max_context_chars: int = 12000
    # Explicit num_ctx for summarization Ollama calls only (never applied to
    # the unmodified Phase 4 RAG generation path). Summarization prompts can
    # legitimately be longer than a single RAG question, so this is set
    # generously rather than relying on Ollama's undocumented default
    # context window; llama3.2 supports up to 131072 so 8192 is trivial for it.
    summary_num_ctx: int = 8192
    # A second, independent trigger for the map->combine fallback, on top of
    # summary_max_context_chars: even a small folder (well under the char
    # budget) is routed through map->combine once it holds more than this
    # many documents. Empirically justified, not a guess -- testing
    # llama3.2:3B against test-data/NHSRCL-Demo found a 3-document folder
    # synthesized reliably in one pass, but a 5-document folder in one pass
    # occasionally merged/mislabeled a single document's own numbers (a
    # source stating "6 track inspections and 4 signal inspections" came
    # back as "10 track inspections and 4 signal inspections" in the
    # single-pass output). Summarizing each document individually first
    # (proven reliable in isolation) and combining those short summaries
    # afterward eliminated the error across repeated runs. See README for
    # the measurement.
    summary_single_pass_max_documents: int = 3

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


settings = Settings()

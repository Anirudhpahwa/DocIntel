"""
Centralized application configuration.

All configurable values are read from environment variables (via a .env file
in local development). Nothing here should be hardcoded.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # PostgreSQL connection string, e.g.
    # postgresql+psycopg://docintel:docintel@localhost:5432/docintel
    database_url: str = "postgresql+psycopg://docintel:docintel@localhost:5432/docintel"

    # Ollama runtime (locally installed, not containerized in Phase 1)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # CORS: comma-separated list of allowed frontend origins
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()

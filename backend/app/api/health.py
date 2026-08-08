"""
System health endpoint.

Reports the status of the API itself, PostgreSQL, the pgvector extension,
and the Ollama runtime. Each dependency is checked independently so that a
missing/unavailable Ollama runtime never takes down the API.
"""

import logging

from fastapi import APIRouter

from app.db import check_database_connection, check_pgvector_available
from app.services.ollama_service import check_ollama_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health_check() -> dict[str, str]:
    status = {"api": "ok"}

    try:
        check_database_connection()
        status["database"] = "ok"
    except Exception:
        logger.exception("Database health check failed")
        status["database"] = "unavailable"

    try:
        status["pgvector"] = "ok" if check_pgvector_available() else "unavailable"
    except Exception:
        logger.exception("pgvector health check failed")
        status["pgvector"] = "unavailable"

    try:
        status["ollama"] = "ok" if await check_ollama_available() else "unavailable"
    except Exception:
        logger.exception("Ollama health check failed")
        status["ollama"] = "unavailable"

    return status

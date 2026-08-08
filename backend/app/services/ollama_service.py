"""
Ollama connectivity check.

Phase 1 only establishes a health check against the locally running Ollama
runtime. Actual model calls (RAG, summarization, Q&A) are implemented in a
later phase.
"""

import httpx

from app.config import settings


async def check_ollama_available() -> bool:
    """Return True if the Ollama server responds, False otherwise."""
    url = f"{settings.ollama_base_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url)
            return response.status_code == 200
    except httpx.RequestError:
        return False

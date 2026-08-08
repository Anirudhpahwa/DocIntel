"""
Ollama connectivity: the Phase 1 health check, plus (Phase 4) the actual
grounded-answer generation call used by rag_service.py. Both talk to the
locally running Ollama server over its HTTP API — never the `ollama` CLI
process, never an external LLM API. The model name is always read from
settings.ollama_model, never hardcoded.
"""

import httpx

from app.config import settings


class OllamaUnavailableError(Exception):
    """
    Raised when Ollama can't be reached or returns an error. Callers
    (rag_service / the query router) catch this to distinguish "the AI
    runtime is down" from a database/retrieval failure, and to keep raw
    connection errors out of the response sent to the frontend.
    """


async def check_ollama_available() -> bool:
    """Return True if the Ollama server responds, False otherwise."""
    url = f"{settings.ollama_base_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url)
            return response.status_code == 200
    except httpx.RequestError:
        return False


async def generate_answer(system_prompt: str, user_prompt: str) -> str:
    """
    Ask the configured Ollama model to answer, given a system prompt and a
    user prompt (rag_service builds the latter from retrieved document
    context + the question). Single-turn, non-streaming — Phase 4 doesn't
    need conversation history or token-by-token streaming.
    """
    url = f"{settings.ollama_base_url}/api/generate"
    payload = {
        "model": settings.ollama_model,
        "system": system_prompt,
        "prompt": user_prompt,
        "stream": False,
        "options": {"temperature": settings.ollama_temperature},
    }

    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.RequestError as exc:
        raise OllamaUnavailableError("Could not reach the local Ollama server") from exc
    except httpx.HTTPStatusError as exc:
        raise OllamaUnavailableError(
            f"Ollama returned an error (status {exc.response.status_code})"
        ) from exc

    answer = (data.get("response") or "").strip()
    if not answer:
        raise OllamaUnavailableError("Ollama returned an empty response")
    return answer

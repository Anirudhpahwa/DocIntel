"""
Ollama connectivity: the Phase 1 health check, plus (Phase 4) the actual
grounded-answer generation calls used by rag_service.py. Both talk to the
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


# Phase 4 source-selection: constrains Ollama's output to exactly this
# shape via its native structured-output support (the `format` field
# accepting a JSON schema, not just `"json"`) rather than hoping the model
# free-forms valid JSON and parsing it after the fact. No extra parsing
# library is introduced — the schema is enforced by Ollama itself, and the
# result is plain `json.loads` on the backend side (in rag_service).
_ANSWER_WITH_SOURCES_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "supporting_source_ids": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["answer", "supporting_source_ids"],
}


async def check_ollama_available() -> bool:
    """Return True if the Ollama server responds, False otherwise."""
    url = f"{settings.ollama_base_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url)
            return response.status_code == 200
    except httpx.RequestError:
        return False


async def _call_generate(
    system_prompt: str,
    user_prompt: str,
    response_format: dict | None = None,
    extra_options: dict | None = None,
) -> dict:
    """
    Shared low-level call to Ollama's /api/generate. `response_format`,
    when given, is passed through as Ollama's `format` field (a JSON
    schema) to constrain the model's output shape. `extra_options`, when
    given, is merged into the request's `options` object on top of the
    default temperature (e.g. Phase 5 summarization sets `num_ctx` this
    way; no existing caller passes it, so this is purely additive and
    changes nothing for Phase 4's RAG generation). Raises
    OllamaUnavailableError on any connection failure or non-2xx response —
    the only error handling shared by all callers below.
    """
    url = f"{settings.ollama_base_url}/api/generate"
    options = {"temperature": settings.ollama_temperature}
    if extra_options:
        options.update(extra_options)
    payload = {
        "model": settings.ollama_model,
        "system": system_prompt,
        "prompt": user_prompt,
        "stream": False,
        "options": options,
    }
    if response_format is not None:
        payload["format"] = response_format

    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            return response.json()
    except httpx.RequestError as exc:
        raise OllamaUnavailableError("Could not reach the local Ollama server") from exc
    except httpx.HTTPStatusError as exc:
        raise OllamaUnavailableError(
            f"Ollama returned an error (status {exc.response.status_code})"
        ) from exc


async def generate_answer(
    system_prompt: str, user_prompt: str, extra_options: dict | None = None
) -> str:
    """
    Ask the configured Ollama model to answer, given a system prompt and a
    user prompt, and return the raw text response. Single-turn,
    non-streaming. A plain-text primitive — unused by rag_service's Phase 4
    query path (which needs structured source-selection JSON instead, see
    generate_answer_with_sources below), but reused as-is by Phase 5's
    summary_service, which has no need for that JSON shape and only adds
    `extra_options={"num_ctx": ...}` on top of the same call.
    """
    data = await _call_generate(system_prompt, user_prompt, extra_options=extra_options)
    answer = (data.get("response") or "").strip()
    if not answer:
        raise OllamaUnavailableError("Ollama returned an empty response")
    return answer


async def generate_answer_with_sources(system_prompt: str, user_prompt: str) -> str:
    """
    Phase 4 source-selection: asks Ollama for a structured JSON object
    (validated against _ANSWER_WITH_SOURCES_SCHEMA by Ollama itself) of the
    shape {"answer": str, "supporting_source_ids": [str, ...]}. Returns the
    raw JSON string as-is — this function does no interpretation of the
    content, it's a thin HTTP call like generate_answer above. rag_service
    is responsible for parsing it and validating supporting_source_ids
    against the SOURCE_N labels it actually handed to the model; the LLM's
    output is never trusted as citation metadata here or anywhere upstream
    of that validation.
    """
    data = await _call_generate(system_prompt, user_prompt, response_format=_ANSWER_WITH_SOURCES_SCHEMA)
    raw = (data.get("response") or "").strip()
    if not raw:
        raise OllamaUnavailableError("Ollama returned an empty response")
    return raw

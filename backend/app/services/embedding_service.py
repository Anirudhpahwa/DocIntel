"""
Local sentence embeddings via Sentence Transformers — no external API, no
API key. The model downloads once from Hugging Face on first use (cached
under the usual ~/.cache/huggingface/ afterward) and every embedding call
after that runs entirely on-device.

The model is loaded once per process and reused (loading it per-chunk, or
even per-document, would be needlessly slow) — see _get_model().
"""

from sentence_transformers import SentenceTransformer

from app.models.document_chunk import EMBEDDING_DIMENSIONS

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Batch-embed chunk texts, returning one EMBEDDING_DIMENSIONS-length
    vector per input string, in the same order. Batching the whole list in
    one model.encode() call is meaningfully faster than embedding chunks
    one at a time.
    """
    if not texts:
        return []

    model = _get_model()
    vectors = model.encode(texts, batch_size=32, show_progress_bar=False, convert_to_numpy=True)

    result = vectors.tolist()
    assert all(len(v) == EMBEDDING_DIMENSIONS for v in result), (
        f"{MODEL_NAME} produced vectors of unexpected dimension "
        f"(expected {EMBEDDING_DIMENSIONS})"
    )
    return result

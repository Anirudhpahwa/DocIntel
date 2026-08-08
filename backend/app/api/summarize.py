"""
POST /api/summarize -- Phase 5. Generates a natural-language summary of a
selected document or folder (recursively including nested subfolders),
built entirely from already-indexed chunks (Phase 3) -- no new document
processing pipeline, no new scope-resolution logic. Router stays thin: all
logic lives in summary_service.py, mirroring query.py's relationship to
rag_service.py.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import SummarizeRequest, SummarizeResponse
from app.services import summary_service
from app.services.ollama_service import OllamaUnavailableError
from app.services.retrieval_service import ScopeNotFoundError
from app.services.summary_service import InvalidSummaryScopeError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["summarize"])


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest, db: Session = Depends(get_db)) -> SummarizeResponse:
    try:
        result = await summary_service.generate_summary(
            db, scope_type=request.scope.type, scope_id=request.scope.id
        )
    except InvalidSummaryScopeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ScopeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except OllamaUnavailableError:
        # Same distinction as query.py: "AI runtime down" vs. a DB/retrieval
        # failure (500 below), raw connection error never leaked.
        logger.exception("Ollama unavailable while generating a summary")
        raise HTTPException(
            status_code=503, detail="AI model is currently unavailable."
        ) from None
    except Exception:
        logger.exception("Unexpected error generating summary")
        raise HTTPException(
            status_code=500, detail="Something went wrong generating the summary."
        ) from None

    return SummarizeResponse(
        summary=result.summary,
        documents_included=result.documents_included,
        chunks_used=result.chunks_used,
    )

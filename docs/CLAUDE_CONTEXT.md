# DocIntel — Engineering Handoff / Context Document

**You are continuing development of DocIntel. Read this file completely before making changes.** It was written by inspecting the actual repository (source, migrations, config, README) at the end of Phase 4 — not from memory of a prior conversation. Treat this file as orientation; treat the repository as the ultimate source of truth. If they disagree, the code wins, and this file should be corrected.

---

## 1. Project overview

**DocIntel** is an NHSRCL summer internship project: a locally hosted, completely free document intelligence tool. It's explicitly a demo/internship project, not production infrastructure — simplicity and correctness are prioritized over scale or performance.

Intended workflow: upload individual files, multiple files, or entire (nested) folders → browse the resulting hierarchy → select a file or folder as "scope" (or leave nothing selected to search everything) → ask a normal English question → get an answer grounded only in the selected documents, with citations → (Phase 5, future) generate a summary for a file or folder.

The user should never need to know about embeddings, vectors, SQL, RAG, or document IDs. They upload files and ask questions; the backend does the rest.

## 2. Hard constraints

- Completely free. No paid APIs — no OpenAI, Anthropic, Gemini, or paid embedding APIs.
- Fully local execution. No cloud storage/database, no public-hosting requirement.
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`, local, 384 dimensions.
- LLM: Ollama, model `llama3.2`, via Ollama's local HTTP API (never the CLI as a subprocess).
- Don't introduce new technology without a demonstrated need (§22 lists what's deliberately excluded).

## 3. Technology stack (verified against the repo)

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4 |
| Backend | Python, FastAPI, SQLAlchemy 2.x, Alembic |
| Database | PostgreSQL 16 + pgvector |
| Extraction | PyMuPDF (`import pymupdf`, not the deprecated `fitz` alias) for PDF; `python-docx` for DOCX; stdlib for TXT |
| Embeddings | `sentence-transformers`, `all-MiniLM-L6-v2`, 384 dims |
| LLM | Ollama, `llama3.2`, HTTP API |
| Infra | Docker Compose — Postgres/pgvector only; backend, frontend, Ollama all run as local processes |

Backend pins (`backend/requirements.txt`): `fastapi==0.115.6`, `uvicorn[standard]==0.32.1`, `sqlalchemy==2.0.36`, `psycopg[binary]==3.2.3`, `pydantic==2.10.3`, `pydantic-settings==2.6.1`, `httpx==0.28.1`, `alembic==1.14.0`, `python-multipart==0.0.20`, `pymupdf==1.28.2`, `python-docx==1.2.0`, `sentence-transformers==5.7.0`, `pgvector==0.5.0`. Frontend (`package.json`): `next@16.3.0`, `react@19.2.8`, Tailwind v4, ESLint.

## 4. Current local environment

Authoritative source: `backend/app/config.py` (`Settings`) and root `.env.example` — read before changing anything here. No secrets appear in this document; local `.env`/`backend/.env` only hold non-sensitive local dev defaults already documented in `.env.example`/`docker-compose.yml`.

| Service | Address | Why |
|---|---|---|
| Frontend | `localhost:3000` | Next.js default |
| Backend | `localhost:8010` | See below |
| PostgreSQL host port | `5433` → container `5432` | 5432 already occupied by another local project |
| Ollama | `localhost:11434` (default `OLLAMA_BASE_URL`) | Ollama default, unchanged |

**Why 8010, not 8000:** ports 8000 and later 8002 were both found unreliably held by phantom/stale TCP listeners tied to other local Docker networking on the dev machine (`netstat` showed LISTENING sockets with no live owning process). Separately, `uvicorn --reload`'s file-watcher was observed once respawning its worker under the *global* Python interpreter instead of the project's venv, silently serving stale code. 8010 is the current working value. Don't revert this without verifying the underlying problem is actually gone; if `--reload` seems to serve stale code, drop it and run `python -m uvicorn app.main:app --port 8010` directly. These are dev-machine workarounds, not architecture — don't over-interpret them, but don't casually revert them either.

## 5. Architecture

```
                         User (browser)
                              │
                  Next.js frontend (localhost:3000)
                   DocumentExplorer / FolderTree /
                   UploadControls / DocumentDetail / AskPanel
                              │  HTTP (fetch), JSON + multipart
                FastAPI backend (localhost:8010)
                   app/api/{health,documents,folders,query}.py
        ┌─────────────────────┼───────────────────────┐
        ▼                     ▼                        ▼
  PostgreSQL + pgvector  Local filesystem         Ollama (localhost:11434)
  (localhost:5433)        (storage/documents/)     model: llama3.2
        │
        └── folders, documents, document_chunks (+ embeddings)
```

Backend layering: `app/api/*.py` (thin routers) → `app/services/*.py` (all logic) → `app/models/*.py` / Postgres.

**Upload/index flow:** browser → `POST /api/documents/upload` → `storage_service` (UUID-named file to disk) + `document_service` (upsert Folder/Document) → `document_processing_service.process_document()` synchronously runs `extraction_service` → `chunking_service` → `embedding_service` → writes `DocumentChunk` rows → `processing_status` becomes `indexed`/`failed`.

**Query/answer flow:** browser → `POST /api/query` → `rag_service.answer_question()` → `embedding_service.embed_texts([question])` → `retrieval_service` (scope resolve + pgvector search) → `rag_service._build_context()` → `ollama_service.generate_answer()` → `rag_service._dedupe_sources()` → JSON `{answer, sources, chunks_retrieved}`.

## 6. Phase 1 — Foundation (COMPLETE)

FastAPI bootstrap + CORS (`app/main.py`), Next.js/TS/Tailwind scaffold, Postgres+pgvector via Docker Compose (named volume `docintel_postgres_data`), `GET /api/health` checking API/DB (`SELECT 1`)/pgvector (`CREATE EXTENSION IF NOT EXISTS vector` + lookup)/Ollama (`GET /api/tags`) independently so one failure never breaks the others. Current verified response: `{"api":"ok","database":"ok","pgvector":"ok","ollama":"ok"}`. All config env-driven via `pydantic-settings`. `HealthStatus.tsx` polls every 15s.

## 7. Phase 2 — File & folder management (COMPLETE)

Single/multiple/folder/nested-folder upload (browser `webkitdirectory` + `webkitRelativePath`), document tree browsing, selection, deletion (single + recursive folder), duplicate-path replacement, path-traversal protection, unsupported-type rejection.

- Physical files: `storage/documents/`, **server-generated UUID filename** (`storage_service.generate_physical_path`) — never user input. Path traversal structurally impossible for storage I/O.
- Logical hierarchy lives in Postgres: `Folder.path` is a unique materialized path (e.g. `"NHSRCL-Demo/Operations"`), used for find-or-create (`document_service.get_or_create_folder_path`); `Folder.parent_id` is the real self-referential tree FK.
- Duplicate upload (same folder+filename) **replaces** the `Document` row in place, same ID (`document_service.upsert_document`).
- **`document_service.collect_documents_under_folder(db, folder_id)`** — BFS helper resolving a folder + all nested subfolders to a flat document list. Written for recursive delete; **reused unchanged by Phase 4's folder-scope retrieval**. This is deliberate reuse, not duplicated logic.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service status |
| POST | `/api/documents/upload` | Multipart `files[]`+`paths[]` (1:1). Auto-creates missing folders. Per-file success/failure. |
| GET | `/api/documents/tree` | Full nested hierarchy in one response |
| DELETE | `/api/documents/{id}` | DB row + physical file + (Phase 3+) chunks |
| DELETE | `/api/folders/{id}` | Recursive: subfolders, documents, chunks cascade |

## 8. Phase 3 — Document processing, chunking, embeddings (COMPLETE)

Pipeline (`document_processing_service.process_document`, synchronous, inside the upload request, no background queue): `extract_document()` → `chunk_pages()` → `embed_texts()` → `DocumentChunk` rows → status.

- **Extraction** (`extraction_service.py`): PDF via PyMuPDF, page-by-page, empty pages skipped, `page_number` 1-based and preserved. DOCX via python-docx, all paragraphs joined into one block, `page_number` always `None` (no reliable page boundaries — none fabricated). TXT via UTF-8 read with `errors="replace"` fallback, `page_number` always `None`.
- **Cleaning** (`chunking_service.clean_text`): whitespace normalization only — numbers/dates/names/punctuation never altered (matters directly for Phase 4 numeric questions).
- **Chunking** (`chunking_service.chunk_pages`): `CHUNK_SIZE=1200` chars, `CHUNK_OVERLAP=200` chars. Paragraphs greedily packed without splitting words; ~200 trailing chars of the previous block prepended to each next block, word-boundary-trimmed. `chunk_index` is 0-based, sequential per document (not reset per page).
- **Embeddings** (`embedding_service.py`): `SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")` loaded once into a module-level singleton, reused for every call. `embed_texts()` batch-encodes and asserts 384-dim output. 100% local; model downloads once (~90MB) from Hugging Face, cached at `~/.cache/huggingface/`.
- **Status** (`Document.processing_status`): `pending`→`processing`→`indexed`/`failed`. Transaction shape: (1) mark `processing`, delete existing chunks, commit — old chunks from a re-upload must never survive, success or failure; (2) extract/chunk/embed/insert/mark `indexed`, committed together only on full success; (3) on exception, roll back the partial insert, mark `failed` with truncated `processing_error`, commit. Result: always ends in `indexed` (fresh chunks) or `failed` (zero chunks), never stale.
- **No HNSW/vector index** on `document_chunks.embedding` — deliberate. At current scale (8 chunks total in the test corpus; realistically low hundreds), pgvector's brute-force scan is fast enough; an approximate index would be premature optimization with a real recall trade-off nobody asked for.

## 9. Phase 4 — RAG question answering (IMPLEMENTED; retrieval/source-precision issue RESOLVED — §14–15)

```
question → embed (embedding_service, same 384-dim model as chunks, no second model)
        → resolve scope → document-id set (retrieval_service, reuses collect_documents_under_folder)
        → pgvector cosine similarity, ORDER BY ... LIMIT RAG_TOP_K, entirely in SQL
        → drop chunks below RAG_SIMILARITY_THRESHOLD
        → build "SOURCE_N / Document / Page / text" context (rag_service._build_context),
          each candidate chunk labeled with a backend-generated, request-scoped SOURCE_N id
        → Ollama llama3.2 via HTTP /api/generate, structured JSON output (format=JSON schema),
          temperature=OLLAMA_TEMPERATURE (0.0)
        → LLM returns {"answer": ..., "supporting_source_ids": [...]} — ids only, never metadata
        → backend validates supporting_source_ids against the SOURCE_N ids actually sent,
          discards unknown ids, maps survivors back to DB metadata (rag_service._parse_and_validate_llm_output)
        → answer + sources from the *selected*, validated chunks' DB metadata (never from the LLM)
```

**`POST /api/query`** (`app/api/query.py`, thin — logic in `rag_service.py`). Request:
```json
{"question": "What were the major causes of delay?", "scope": {"type": "all"}}
```
`scope.type` ∈ `"all"`/`"folder"`/`"document"` (Pydantic `Literal`, bad value → 422). `"folder"`/`"document"` require `scope.id` (`QueryScope` model_validator → 422 if missing). Response:
```json
{"answer": "…", "sources": [{"document_id": 15, "document_name": "August_06_Report.pdf", "page_number": 1}], "chunks_retrieved": 6}
```
Validation: `question` non-empty after strip, ≤ `rag_max_question_length` (2000) → 422. Nonexistent scope id → `ScopeNotFoundError` → 404. Ollama down → `OllamaUnavailableError` → 503 `"AI model is currently unavailable."` (full traceback logged server-side only). Other exceptions → 500, logged.

**Scope:** `"all"` = no filter. `"document"` = one id (existence-checked). `"folder"` = `document_service.collect_documents_under_folder`, includes **all nested subfolders**; empty folder short-circuits to `[]` without querying pgvector. Every scope additionally requires `processing_status == "indexed"` — pending/processing/failed documents are never searched.

## 10. Phase 4 retrieval details — VALUES UNCHANGED BY THE §14–15 RESOLUTION

Read `app/services/retrieval_service.py` before changing anything here. **`RAG_TOP_K` and `RAG_SIMILARITY_THRESHOLD` were deliberately left unchanged when §14–15 was resolved** — the investigation (below) proved no single threshold value could fix source-precision without breaking multi-document retrieval, so the fix was moved downstream into LLM-side source *selection*, not retrieval math.

- Same embedding model as Phase 3, no second model.
- Metric: cosine, via `DocumentChunk.embedding.cosine_distance(query_embedding)` (pgvector-python's `<=>` operator), `ORDER BY ... LIMIT top_k` **entirely in SQL** — never ranked in Python. `similarity = 1 - distance` is trivial Python arithmetic on an already-computed scalar, not a re-implementation.
- **`RAG_TOP_K = 8`** (`Settings.rag_top_k`, `.env`-overridable). **Confirmed correct, not a bug** — §14–15's investigation showed lowering it risks starving multi-document questions (Test 2's "42 trains" case) for no reliable precision gain.
- **`RAG_SIMILARITY_THRESHOLD = 0.2`** (`Settings.rag_similarity_threshold`). Post-filter in Python on the already-small ranked result, not a re-ranking. Zero chunks passing → LLM never called, `rag_service.NO_CONTEXT_MESSAGE` returned directly.
- Threshold basis: measured against `test-data/NHSRCL-Demo`. An off-topic question ("Prime Minister of India") topped out at **0.1994** similarity; on-topic-but-not-specific chunks land at **0.25+**. 0.2 sits in that gap — verified to reject the PM case (0 chunks) while admitting a correct chunk for a "what date is this report" question that scored 0.2785. **Both values are final as of the §14–15 resolution** — a follow-up threshold sweep (0.20–0.65, documented in §15) proved no single higher threshold value narrows source precision without breaking either Test 2 (multi-document sum) or Test 4 (maintenance question, whose correct chunk scores only 0.4373 — below several irrelevant chunks in other questions). Retrieval configuration was intentionally left untouched; precision was fixed one stage later (§11).

**Context construction** (`rag_service._build_context`): each chunk → `SOURCE N / Document: name / Page: N (omitted if None) / <text>`, blocks joined with blank lines, then `f"{context}\n\nQuestion: {question}"` sent as the Ollama prompt.

## 11. Phase 4 citations — now via LLM evidence selection over backend-controlled metadata

As of the §14–15 resolution, source precision is handled by a new stage between retrieval and citation-building, **not** by retrieving fewer chunks:

- `rag_service._build_context` labels every retrieved (post-threshold) chunk with a **backend-generated, request-scoped id** — `SOURCE_1`, `SOURCE_2`, … in retrieval-rank order — and returns both the prompt context and a `source_map: dict[str, RetrievedChunk]` mapping each label back to its real chunk. These labels are never database ids and are never exposed outside the single request that generated them.
- The LLM is asked (via Ollama's structured JSON output, see §12) to return `{"answer": ..., "supporting_source_ids": [...]}` — a judgment about which specific `SOURCE_N` labels *directly support* its answer, explicitly distinct from "topically related." The system prompt (§12) states this distinction and gives worked examples of both correct narrow-selection and correct multi-source-selection.
- **The LLM may only select from ids it was given — it can never invent a label, and it can never return a document name/page number/chunk id directly** (the response schema's `supporting_source_ids` only accepts a list of strings, so an attempt to smuggle a metadata object there fails Pydantic validation outright, not silent coercion). This is the same architectural rule as before, extended one stage: the LLM still never produces or parses citation data — it only points at backend-issued labels.
- `rag_service._parse_and_validate_llm_output` is the trust boundary: it parses the JSON, validates it against `schemas.LLMAnswerWithSources`, and checks every returned id against the ids actually sent for that request. **Unknown ids are discarded and logged; the rest of a valid selection is kept** (chosen over rejecting the whole selection — simpler, and doesn't throw away an otherwise-correct answer's citations over one bad id). Malformed JSON, a schema mismatch, or an empty `answer` field all fall back to a safe canned message (`rag_service.GENERATION_FAILED_MESSAGE`) with zero sources — never a crash, never a raw parse error surfaced to the caller.
- Only after validation are `sources` built from **database metadata on the selected chunks** (`rag_service._dedupe_sources`, unchanged) — this remains exclusively backend-authoritative, never parsed from LLM prose.

Dedup key: `(document_id, page_number)` — DOCX/TXT (`page_number=None`) collapse to one card per document; same-page PDF chunks collapse to one card per page. Order preserved (most-similar first, i.e. retrieval rank, not the LLM's output order).

**`chunks_retrieved` was deliberately NOT redefined** to mean "sources selected" — it still reflects how many chunks cleared retrieval/threshold and were sent to the LLM as candidates. The (usually smaller) selected-and-deduped set is what appears in `sources`. A response can legitimately show `chunks_retrieved: 7, sources: [1 item]`.

A known, pre-existing, harmless quirk carried over from before this change: the LLM's own prose narration in `answer` can still mislabel which date/document a number came from when explaining multi-source math (observed occasionally in testing) — this does not affect the structured `sources` array, which is built from real chunk metadata regardless of what the prose says.

## 12. Phase 4 LLM (Ollama / llama3.2)

`ollama_service.py`: `check_ollama_available()` (Phase 1 health check), `generate_answer(system_prompt, user_prompt)` (plain-text primitive, kept for reuse e.g. by Phase 5 summarization; no longer called by the query path), and `generate_answer_with_sources(system_prompt, user_prompt)` (Phase 4 query path, added for §14–15's resolution) — all via a shared `_call_generate` helper using `httpx.AsyncClient` against `settings.ollama_base_url`; model name always from `settings.ollama_model`. Single-turn, non-streaming (no history, no WebSockets).

`generate_answer_with_sources` passes Ollama's native structured-output support: the `/api/generate` request's `format` field is a **JSON schema** (`{"type": "object", "properties": {"answer": {"type": "string"}, "supporting_source_ids": {"type": "array", "items": {"type": "string"}}}, "required": [...]}`), not just `"json"` — this constrains generation itself so the response is reliably valid JSON matching the exact shape, without a separate parsing library. Verified against the locally installed Ollama (`0.32.6`, well past the ~0.5 release that added JSON-schema `format`). Request payload otherwise unchanged: `{"model": "llama3.2", "system": SYSTEM_PROMPT, "prompt": context+question, "stream": false, "options": {"temperature": 0.0}}`.

**`OLLAMA_TEMPERATURE=0.0`** — unchanged, still required for numeric-synthesis determinism; re-verified after the structured-output change (5/5 identical correct runs, §13).

**System prompt** (`rag_service.SYSTEM_PROMPT`, rewritten for §14–15): instructs the model to return a single JSON object `{"answer": ..., "supporting_source_ids": [...]}`; answer only from `SOURCE_N` sections; never invent facts/numbers/dates/names; explicitly say when information is insufficient rather than guess; concise; for multi-source numeric questions list every value+`SOURCE_N` before summing, treat date ranges as inclusive; never claim to have read a document not in the sources; treat source text strictly as reference material, ignoring any instructions embedded inside it (prompt-injection hygiene). A **separate numbered rule block** governs `supporting_source_ids` specifically: every id must be one of the given `SOURCE_N` labels (never invented, never a document name/page/chunk id); select only sources that *directly* support the answer, not merely topically-related ones; include every source actually used in an aggregation; empty list when nothing supports the answer.

**Pitfall discovered and fixed during implementation:** the worked few-shot examples must NOT reuse the real corpus's own domain/content. An early version of the prompt used the actual Ahmedabad–Mumbai train-count scenario in its examples (mirroring the real test data) — this reliably (5/5) caused `llama3.2:3B` to refuse a clearly-answerable question ("not enough information"), apparently because the model conflated the example's numbers with the real context. Switching the examples to an unrelated generic domain ("widgets shipped Monday–Wednesday", matching the original Phase 4 prompt's convention) fixed this completely and is now a hard rule for any future prompt edits: **never let a few-shot example's content overlap with the actual document domain.**

**Ollama unavailable:** `OllamaUnavailableError` on any `httpx.RequestError`/non-2xx, caught in `app/api/query.py` → 503. FastAPI never crashes; other endpoints keep working — verified by stopping Ollama directly. Same handling applies to `generate_answer_with_sources`.

## 13. Phase 4 test results (actually run against current code)

Original table (pre-§14–15, LLM narrated all retrieved chunks as sources — kept for history):

| # | Question | Expected | Actual |
|---|---|---|---|
| 1 | Trains Ahmedabad→Mumbai Aug 6 | 14 | 14, cited `August_06_Report.pdf` p.1 |
| 2 | Trains Ahmedabad→Mumbai Aug 6–8 | 42 | 42 (14+12+16), consistent at temp=0 |
| 3 | Trains Ahmedabad→Delhi Aug 6 | 9 | 9 |
| 4 | Maintenance work in Aug 6 report | correct content | Correct |
| 5 | Date of Aug 6 report | August 06, 2026 | Correct (initially failed at threshold 0.3 — the correct chunk scored 0.2785 — this is why threshold was lowered to 0.2) |
| 6 | Fact absent from corpus | explicit refusal | Explicit refusal, no invented number |

**Re-run against the source-selection implementation (§14–15 resolution), directly through `rag_service.answer_question`, real DB + real Ollama, nothing mocked:**

| # | Question | Scope | Answer | chunks_retrieved | sources returned |
|---|---|---|---|---|---|
| 1 | Trains Ahmedabad→Mumbai Aug 6 | all | 14 | 7 | `August_06_Report.pdf` p.1 only — no sibling-day reports |
| 2 | Trains Ahmedabad→Mumbai Aug 6–8 | all | 42 (14+16+12) | 7 | all 3: `August_06/07/08_Report.pdf` p.1 |
| 3 | Maintenance work in Aug 6 report | all | correct (track inspection km 45–78) | 5 | `August_06_Report.pdf` p.2 only — not p.1, despite same document |
| 4 | Trains Ahmedabad→Chennai Aug 6 (hallucination) | all | explicit refusal | 7 | `[]` |
| 5 | Trains Ahmedabad→Mumbai | document (`August_06_Report.pdf`) | 14 | 2 | `August_06_Report.pdf` p.1 only |
| 6 | Trains Ahmedabad→Mumbai Aug 6–8 | folder (`Operations`) | 42 | 6 | all 3 daily reports p.1 |
| 7 | Trains Ahmedabad→Mumbai Aug 6–8 (wrong scope) | folder (`Safety`) | insufficient-info refusal | 0 | `[]`, zero leakage |

**5x reliability runs** (temperature=0.0, real Ollama, no mocking): Test 2 (multi-doc sum) — 5/5 runs answered 42 with all 3 required sources selected, no invented ids, no extraneous sources. Test 1 (narrow) — 5/5 runs answered 14 with exactly one source (`August_06_Report.pdf` p.1) selected every time.

**Backend validation unit-tested directly** (adversarial LLM output, no live Ollama needed): unknown/invented `SOURCE_N` id mixed with a valid one → invalid one discarded, valid one kept, no crash. All-invented ids → empty selection, no crash. Malformed JSON → safe fallback message, zero sources, no crash. Missing `answer` field → safe fallback. Empty `answer` string → safe fallback. LLM attempting to smuggle a metadata object (`{"document": ..., "page": ...}`) into `supporting_source_ids` → rejected by Pydantic type validation (`list[str]`), safe fallback, never coerced or trusted.

**Hallucination tests:** "Trains Ahmedabad→Chennai Aug 6" (route doesn't exist, but topically similar chunks scored 0.48–0.60) → correctly refused, no invented number, `sources: []`. "Prime Minister of India" (pure general knowledge) → **zero** chunks above threshold (best 0.1994), LLM never called, canned refusal returned.

**Scope tests:** All (cross-document synthesis works, test 2/6). Document (scoped to one PDF — sources only from it, test 5). Folder (`Operations` — only the 3 daily reports, `Safety`/`Project` excluded, test 6). Wrong scope (`Safety` folder asked about trains, answer lives in `Operations`, test 7) — `chunks_retrieved: 0`, zero leakage.

**Validation/failure**, all still hold structurally (unchanged code paths): empty/whitespace question → 422; >2000 chars → 422; nonexistent document/folder id → 404; bad `scope.type` → 422; missing `scope.id` → 422; Ollama stopped → 503, backend and other endpoints unaffected (the 503 path is untouched — `OllamaUnavailableError` is raised identically from `generate_answer_with_sources` as it was from `generate_answer`).

**Frontend:** untouched by this change (the existing `result.sources.length > 0` conditional in `AskPanel.tsx` already handles zero sources safely). `npm run lint` and `npm run build` both pass cleanly after the change (no frontend files were modified; re-run purely as a regression check since the API response shape is unchanged).

## 14. Manual test observation — the issue that triggered this investigation (RESOLVED, kept for history)

Manual UI test of Test 1 ("trains Ahmedabad→Mumbai Aug 6", scope: all documents): **the answer was correct** (14, correctly attributed in prose to `August_06_Report.pdf` p.1), but **the displayed source list also included several loosely-related sources** — `August_07_Report.pdf`, `August_08_Report.pdf`, `Project_Overview.txt`, and `August_06_Report.pdf` p.2. **Answer quality was never the concern; retrieval/source precision was.**

Actual measured similarity scores for this exact question (re-verified against the live DB), all 8 chunks in the corpus:

```
0.6321  August_06_Report.pdf  page=1   ← the actually-needed chunk
0.6095  August_08_Report.pdf  page=1
0.5892  August_07_Report.pdf  page=1
0.5434  Project_Overview.txt  page=None
0.5226  August_06_Report.pdf  page=2
0.3028  August_07_Report.pdf  page=2
0.2578  August_08_Report.pdf  page=2
0.1895  Safety_Report.docx    page=None
```

With `TOP_K=8` and `THRESHOLD=0.2`, **7 of 8 total chunks in the whole corpus** passed and became sources for this one narrow question (only `Safety_Report.docx` at 0.1895 was excluded).

## 15. Investigation and resolution

**Step 1 — threshold-only sweep (proved threshold tuning cannot fix this alone).** With `TOP_K` held at 8, thresholds 0.20 through 0.65 were swept against Test 1, Test 2, and the maintenance question, reading real similarity scores directly from `retrieval_service.retrieve_relevant_chunks` (Ollama never called for this step). Findings:
- To keep all 3 chunks Test 2 needs, threshold must be `≤ 0.5648` (the lowest-ranked required chunk, `August_07_Report.pdf` p.1, scored against the Aug 6–8 question).
- At any threshold `≤ 0.5648`, Test 1 still admits `August_08_Report.pdf` p.1 (0.6095) and `August_07_Report.pdf` p.1 (0.5892) — both score *higher* than Test 2's own lowest required chunk, so they can't be excluded without also breaking Test 2. The viable ranges for "Test 1 precision" (`>0.6095`) and "Test 2 completeness" (`≤0.5648`) don't overlap — **proven, not assumed, that no single threshold satisfies both.**
- Separately, the maintenance question's correct chunk (`August_06_Report.pdf` p.2) scores only 0.4373 — any threshold high enough to help Test 1/2 precision (≥0.55) would silently drop it, breaking Test 3/4.
- **Conclusion: retrieval-side threshold tuning was not viable.** `RAG_TOP_K` and `RAG_SIMILARITY_THRESHOLD` were left at 8 / 0.2, unchanged.

**Step 2 — decision: LLM-side evidence selection (Option 1), not retrieval math.** Retrieval stays broad; the LLM is additionally asked which of the broadly-retrieved candidate chunks its answer actually relies on, and only those become displayed sources. Implementation: §9, §11, §12.

**Step 3 — implementation pitfall found and fixed.** The first version of the rewritten system prompt used the real train-count domain in its few-shot examples (mirroring the actual corpus). This reliably (5/5) broke Test 1 — the model refused to answer a clearly-answerable question, apparently confusing the example's numbers with the real context. Fixed by making the examples use an unrelated generic domain ("widgets"), matching the original prompt's own convention — full detail in §12.

**Step 4 — full re-verification.** All of §13's re-run tests, the two 5x reliability runs, and the adversarial backend-validation unit tests passed. See §13 for exact results.

**This issue is resolved as of this update.** Do not re-open it by changing `RAG_TOP_K` or `RAG_SIMILARITY_THRESHOLD` to chase source precision — that path was investigated and proven not to work (Step 1 above). Any further precision work belongs in the source-selection layer (`rag_service._build_context` / `_parse_and_validate_llm_output` / `SYSTEM_PROMPT`), not retrieval.

## 16. Synthetic test data

`test-data/NHSRCL-Demo/` — entirely fictional (the TXT file says so explicitly), created for this project only.

```
test-data/NHSRCL-Demo/
├── Operations/{August_06,07,08}_Report.pdf   (2 pages each)
├── Safety/Safety_Report.docx
└── Project/Project_Overview.txt
```

Ground truth (re-extracted directly while writing this document):
- **Aug 06, 2026** p.1: Ahmedabad→Mumbai **14**, Ahmedabad→Delhi **9**, Mumbai→Ahmedabad **14**. p.2: track inspection km 45–78, no defects, next inspection Aug 20; Vadodara signal equipment OK.
- **Aug 07, 2026** p.1: Ahmedabad→Mumbai **12**, Ahmedabad→Delhi **10**, Train 22119 delayed 18 min near Surat. p.2: 8,412 passengers, 76% occupancy.
- **Aug 08, 2026** p.1: Ahmedabad→Mumbai **16**, Ahmedabad→Delhi **9**, Mumbai→Ahmedabad **15**. p.2: heavy rain near Vadodara, 60 km/h restriction 14:00–17:00 IST.
- **Safety_Report.docx**: period Aug 01–08 2026; zero major incidents; 6 track + 4 signal inspections; Safety Officer A. Mehta; 12 staff certified Aug 5; next review Sep 1.
- **Project_Overview.txt**: Ahmedabad–Mumbai corridor, ~508 km, 12 stations, construction started 2017, initial segment 2027, design speed 320 km/h, operating 280 km/h.

Sum check (Test 2): 14 + 12 + 16 = **42**.

## 17. Database schema

Two Alembic migrations, applied in order: `7c6c775d2fd0` (create `folders`+`documents`) → `48b55eb229fa` (add `document_chunks` + `documents.processing_status`/`processing_error`). Current head: `48b55eb229fa`.

**`folders`**: `id` PK · `name` String(255) NOT NULL · `parent_id` FK→`folders.id` ON DELETE CASCADE, indexed, nullable (NULL=root) · `path` String(2048) NOT NULL **UNIQUE** (e.g. `"NHSRCL-Demo/Operations"`) · `created_at`. Self-referential `parent`/`children` with `passive_deletes=True` — Postgres's cascade does the work, not SQLAlchemy.

**`documents`**: `id` PK · `folder_id` FK→`folders.id` ON DELETE CASCADE, indexed, nullable (NULL=top-level) · `name`/`original_filename` String(255) · `file_path` String(1024) (UUID-named, relative to storage root) · `file_type` String(10) (`pdf`/`docx`/`txt`) · `file_size` BigInteger · `processing_status` String(20) NOT NULL default `pending` · `processing_error` Text nullable · `created_at`/`updated_at`.

**`document_chunks`**: `id` PK · `document_id` FK→`documents.id` ON DELETE CASCADE, indexed, NOT NULL · `page_number` Integer nullable (NULL for DOCX/TXT, never fabricated) · `chunk_index` Integer NOT NULL (0-based per document) · `content` Text NOT NULL · `embedding` `pgvector.sqlalchemy.Vector(384)` NOT NULL (`EMBEDDING_DIMENSIONS` constant lives in this model, imported by `embedding_service.py`) · `created_at`.

Cascade verified end-to-end: Folder delete → Documents cascade → DocumentChunks cascade (all Postgres `ON DELETE CASCADE`); physical files are cleaned up separately by application code (`storage_service.delete_physical_file`) before the DB delete, since disk files aren't Postgres-tracked. No index on `document_chunks.embedding` (§8).

## 18. Project tree (key files)

```
NHSRCL DocIntel/
├── docs/CLAUDE_CONTEXT.md          # this file
├── backend/
│   ├── alembic/versions/{7c6c775d2fd0,48b55eb229fa}_*.py
│   ├── app/
│   │   ├── api/{health,documents,folders,query}.py
│   │   ├── models/{folder,document,document_chunk}.py
│   │   ├── services/
│   │   │   ├── storage_service.py             # file I/O, UUID naming, path safety (P2)
│   │   │   ├── document_service.py             # folder/doc CRUD, tree, collect_documents_under_folder (P2)
│   │   │   ├── extraction_service.py           # PDF/DOCX/TXT → text (P3)
│   │   │   ├── chunking_service.py             # clean_text, chunk_pages (P3)
│   │   │   ├── embedding_service.py             # SentenceTransformer singleton (P3, reused P4)
│   │   │   ├── document_processing_service.py  # extract→chunk→embed→store orchestration (P3)
│   │   │   ├── retrieval_service.py             # scope resolution + pgvector search (P4, unchanged by §14-15)
│   │   │   ├── rag_service.py                   # RAG orchestration, SYSTEM_PROMPT, SOURCE_N context, LLM output validation, dedup (P4)
│   │   │   └── ollama_service.py                # health check + generate_answer + generate_answer_with_sources (structured JSON) (P1+P4)
│   │   ├── config.py / db.py / schemas.py / main.py
│   ├── alembic.ini / requirements.txt
├── frontend/
│   ├── app/{layout,page}.tsx
│   ├── components/{Header,HealthStatus,WelcomePanel}.tsx
│   ├── components/document/
│   │   ├── DocumentExplorer.tsx   # tree+selection state, derives query scope, sidebar+main layout
│   │   ├── FolderTree.tsx          # recursive tree UI
│   │   ├── UploadControls.tsx      # Upload Files/Folder + result summary
│   │   ├── DocumentDetail.tsx      # file/folder detail panels (incl. disabled Generate Summary)
│   │   └── AskPanel.tsx            # P4: scope-aware question box, answer, sources
│   ├── lib/{api,tree,format,processingStatus}.ts
│   └── package.json
├── storage/documents/              # local-only, gitignored, UUID-named files
├── test-data/NHSRCL-Demo/          # synthetic fictional dataset, §16
├── docker-compose.yml / .env.example / README.md
```

## 19. Current API contract

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/health` | — | `{api,database,pgvector,ollama}` each ok/unavailable | Never errors |
| POST | `/api/documents/upload` | multipart `files[]`+`paths[]` | `{results[],created,replaced,failed}` + per-file `processing_status` | 400 length mismatch; per-file errors inline |
| GET | `/api/documents/tree` | — | `{folders[],documents[]}` nested, incl. `processing_status` | — |
| DELETE | `/api/documents/{id}` | — | 204 | 404 |
| DELETE | `/api/folders/{id}` | — | 204, recursive | 404 |
| POST | `/api/query` | `{question,scope}` | `{answer,sources[],chunks_retrieved}` | 422 bad input, 404 scope id, 503 Ollama down, 500 unexpected |

## 20. Frontend (current)

Single-page app: static `Header` (branding + inert "Documents"/"Ask"/"Summaries" placeholders — no routing exists) + `DocumentExplorer`, which owns nearly all client state and renders a sidebar (`FolderTree` + `UploadControls`) plus a main column. The main column always shows `AskPanel` at top, then `DocumentFileDetail`/`DocumentFolderDetail`/`WelcomePanel` (with `HealthStatus`) depending on selection.

**Scope derivation** (`DocumentExplorer.tsx`): the current `selection` (from `FolderTree`) is translated into a `QueryScope` + human `scopeLabel`, passed to `AskPanel`. `AskPanel` gets `key={scope.type+id}` so switching selection **remounts** it (clearing prior answer state) instead of using an effect — chosen to satisfy `react-hooks/set-state-in-effect` cleanly, matching React's own recommended pattern.

`AskPanel`: text input + submit, disabled in-flight. Shows "Searching documents…" then (via a client-side `setTimeout`, not real server progress) "Generating answer…" after ~900ms until the single HTTP response resolves. On success: answer text + a 2-column grid of source cards (📄 + filename + `Page N` if present). On failure: red error box with the backend's message.

Processing status shown two places: small icon per file in `FolderTree` (`processingStatus.ts`: ○/⟳/✓/⚠, `processing` spins) and a full status line in `DocumentFileDetail`. "Generate Summary" buttons are `disabled` with a tooltip — do not wire them up without being asked (Phase 5).

## 21. Architectural decisions (why, briefly)

Postgres+pgvector (one DB to run, sufficient at this scale) · local FS storage with UUID filenames + Postgres logical hierarchy (structurally eliminates path traversal, avoids filename collisions) · Alembic (standard, minimal) · synchronous processing everywhere (simpler than a queue; explicitly avoids Celery/Redis/Kafka) · `all-MiniLM-L6-v2` (small, fast, local, no demonstrated need for anything bigger) · `llama3.2` via Ollama HTTP only, never CLI · no HNSW index (premature at this scale) · no LangChain/LlamaIndex (the actual pipeline is a few hundred lines and doesn't benefit from a framework) · no reranking/hybrid search (not needed yet; explicitly not the fix for §15) · backend-generated citations only (the LLM demonstrably can't be trusted to report sources accurately — §11) · no streaming/WebSockets/history (single-turn tool, added complexity not requested) · no authentication (local single-user demo).

## 22. Things intentionally NOT built

Do not casually introduce: authentication/users, cloud deployment/public hosting, Redis, Celery, Kafka, LangChain, LlamaIndex, any external/paid LLM or embedding API, a second vector database, OCR/scanned-PDF support, Excel/CSV/PPTX ingestion, chat history/persistence, response streaming, WebSockets, hybrid/keyword search, or reranking. If a task seems to need one of these, ask first.

## 23. Known issues / quirks (dev-environment notes, not architectural failures)

Backend on port 8010, Postgres host port 5433 (§4) · Windows stale/phantom TCP listener behavior observed on this dev machine, not a DocIntel bug · `uvicorn --reload` once respawned under the global interpreter, serving stale code (workaround in README) · Phase 3/4 processing and querying are fully synchronous within their HTTP request, by design · Ollama + `llama3.2` must be running locally for `/api/query`; everything else works without it · **the retrieval/source-precision issue in §14–15 is RESOLVED** (LLM-side source selection, retrieval config unchanged) · few-shot prompt examples must never reuse the real document domain's content (§12, discovered while resolving §14–15).

## 24. Current state

```
PHASE 1 — COMPLETE
PHASE 2 — COMPLETE
PHASE 3 — COMPLETE
PHASE 4 — COMPLETE (all required test/scope/hallucination/failure tests pass, including source-precision fix)
PHASE 4 RETRIEVAL / SOURCE-PRECISION — RESOLVED (§14–15): LLM evidence selection over backend-issued SOURCE_N labels, retrieval config unchanged
PHASE 5 — NOT STARTED
```

## 25. Next immediate task

None assigned as of this update — §14–15 is resolved and re-verified (§13). Phase 5 (summarization, §26) has not been started and should not be started without explicit instruction (§28 rule 11).

## 26. Future: Phase 5 (not started, not designed in detail)

Intended to implement **"Generate Summary"** for a document, a folder, and a nested folder — the disabled buttons in `DocumentDetail.tsx` are the intended hook-in point. Should reuse `extraction_service`/`chunking_service` for text, `ollama_service.generate_answer` (or a close variant) for the LLM call, and likely `document_service.collect_documents_under_folder` for folder-level summaries. Do not implement now — the retrieval issue (§15) should be resolved first.

## 27. Future phases (broad, not over-specified)

Phase 5: summarization (§26). Later, undesigned: UI polish, broader testing, documentation, demo/report prep for the internship deliverable. No concrete plans exist yet for these — don't invent scope.

## 28. Instructions for future Claude

1. Inspect the actual current code before modifying anything — this document is a snapshot and will drift.
2. Treat existing functionality as intentional unless you can demonstrate an actual problem (§21 has the reasoning).
3. Don't rewrite working architecture unnecessarily — small, targeted changes over rewrites.
4. Preserve the free/local requirement absolutely.
5. Don't add infrastructure (Redis/Celery/Kafka/second vector DB/etc.) without being explicitly asked.
6. Reuse existing services — especially `collect_documents_under_folder`, `embedding_service.embed_texts`, `ollama_service.generate_answer` — rather than parallel implementations.
7. Reuse the existing embedding model and LLM unless explicitly told to change them.
8. Preserve API compatibility where practical; if a response shape must change, update `frontend/lib/api.ts` types together with it.
9. Test after modifications — the synthetic dataset and §13's regression set exist so changes can be verified, not assumed.
10. Don't claim functionality is implemented/fixed/verified without actually running it.
11. Don't start a future phase without explicit instruction.
12. Update this document after major completed phases or after resolving the open retrieval issue, using the same "inspect the repo first" discipline.
13. Treat this document as orientation; treat the repository as ultimate truth when they disagree.
14. §14–15 is resolved (LLM-side source selection); don't re-open it by reducing `RAG_TOP_K`/raising `RAG_SIMILARITY_THRESHOLD` to chase precision — that path was investigated and proven not to work (§15 Step 1).
15. **Never solve retrieval precision by blindly reducing `RAG_TOP_K` (or otherwise starving retrieval) if it breaks multi-document questions like the "42 trains" test.** Investigate first; change minimally. (This is now a permanent rule, not just historical context — it's exactly what the §14–15 investigation proved.)
16. **Never let a few-shot example in `rag_service.SYSTEM_PROMPT` reuse content from the real document domain** (route names, dates, counts that resemble the actual corpus). This caused `llama3.2:3B` to confuse example data with real context and refuse answerable questions — discovered and fixed during §14–15 (§12). Any future prompt edit must keep examples in an unrelated generic domain.

## 29. Changelog

- **Phase 1:** Foundation — FastAPI + Next.js + Postgres/pgvector + Docker Compose, `/api/health`, env-driven config. Complete.
- **Phase 2:** Files/folders/storage — upload (single/multiple/folder/nested), UUID physical storage + Postgres logical hierarchy, tree UI, deletion, duplicate replacement, path-traversal protection. Complete.
- **Phase 3:** Extraction/chunking/embeddings — PyMuPDF/python-docx/TXT, whitespace-only cleaning, ~1200/~200 chunking, local `all-MiniLM-L6-v2` (384-dim) in pgvector, synchronous pipeline with status tracking. Complete.
- **Phase 4:** RAG Q&A — `POST /api/query`, `all`/`folder`/`document` scope, pgvector cosine retrieval, grounded `llama3.2` via Ollama HTTP, backend-computed deduplicated citations, `AskPanel` UI. Implemented; all specified regression tests pass.
- **Phase 4 source-precision fix (§14–15):** Investigated whether `RAG_TOP_K`/`RAG_SIMILARITY_THRESHOLD` tuning could narrow displayed sources for narrow questions without breaking multi-document retrieval — a threshold sweep (0.20–0.65) proved it could not (no threshold satisfies both Test 1 precision and Test 2 completeness; any threshold high enough to help precision also breaks the maintenance test). Resolved instead via LLM-side evidence selection: retrieval stays unchanged (`TOP_K=8`, `THRESHOLD=0.2`), but each retrieved chunk is labeled with a backend-generated, request-scoped `SOURCE_N` id, and Ollama (via native structured JSON output) returns `{"answer", "supporting_source_ids"}` identifying which labels its answer actually relies on. The LLM can only select from ids it was given — never invent one or supply metadata directly; backend validation (`rag_service._parse_and_validate_llm_output`) discards any unknown id and falls back safely on malformed output. Fixed one prompt pitfall along the way: few-shot examples must not reuse the real document domain's content (§12). All Phase 4 regression tests re-verified, including two 5x reliability runs and adversarial backend-validation unit tests. Frontend unchanged (already handled zero sources). **Phase 4 is now complete.**
- **Phase 5:** Not started — placeholder for summarization (§26).
- **Later phases:** Not started, not designed — placeholder for UI polish, testing, documentation, demo prep (§27).

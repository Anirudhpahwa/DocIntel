# DocIntel — Engineering Handoff / Context Document

**You are continuing development of DocIntel. Read this file completely before making changes.** It was written by inspecting the actual repository (source, migrations, config, README) at the end of Phase 7 — not from memory of a prior conversation. Treat this file as orientation; treat the repository as the ultimate source of truth. If they disagree, the code wins, and this file should be corrected.

---

## 1. Project overview

**DocIntel** is an NHSRCL summer internship project: a locally hosted, completely free document intelligence tool. It's explicitly a demo/internship project, not production infrastructure — simplicity and correctness are prioritized over scale or performance.

Intended workflow: upload individual files, multiple files, or entire (nested) folders → browse the resulting hierarchy → select a file or folder as "scope" (or leave nothing selected to search everything) → ask a normal English question → get an answer grounded only in the selected documents, with citations → generate a natural-language summary for a selected file or folder (Phase 5, complete).

The user should never need to know about embeddings, vectors, SQL, RAG, or document IDs. They upload files and ask questions; the backend does the rest.

## 2. Hard constraints

- Completely free. No paid APIs — no OpenAI, Anthropic, Gemini, or paid embedding APIs.
- Fully local execution. No cloud storage/database, no public-hosting requirement.
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2`, local, 384 dimensions.
- LLM: Ollama, model `llama3.2`, via Ollama's local HTTP API (never the CLI as a subprocess).
- Don't introduce new technology without a demonstrated need (§32 lists what's deliberately excluded).

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

**Why 8010, not 8000:** ports 8000 and later 8002 were both found unreliably held by phantom/stale TCP listeners tied to other local Docker networking on the dev machine (`netstat` showed LISTENING sockets with no live owning process). Separately, `uvicorn --reload`'s file-watcher was observed once respawning its worker under the *global* Python interpreter instead of the project's venv, silently serving stale code. 8010 is the current working value. Don't revert this without verifying the underlying problem is actually gone; if `--reload` seems to serve stale code, drop it and run `python -m uvicorn app.main:app --port 8010` directly. These are dev-machine workarounds, not architecture — don't over-interpret them, but don't casually revert them either. A later, more precise diagnosis (Phase 6 boot-up session) found the same interpreter mismatch occurs even without `--reload`: on this machine, the venv's `python.exe` correctly launches, but the actual `uvicorn` worker process it spawns is reported by Windows (`Get-CimInstance Win32_Process`) as running under the global interpreter's image (`C:\Python312\python.exe`) rather than the venv's copy — a known Windows/`multiprocessing`-plus-venv resolution quirk, not necessarily stale code. Confirmed via the full parent-process chain that the spawned worker still correctly inherits the venv's `sys.path` and runs current code/dependencies. Treat a `C:\Python312\python.exe` image on the port-8010 process as normal, not automatically as evidence of staleness — verify via `/api/health` or `/openapi.json` instead of assuming a kill+restart is needed.

## 5. Architecture

```
                         User (browser)
                              │
                  Next.js frontend (localhost:3000)
                   DocumentExplorer / FolderTree /
             UploadControls / DocumentDetail / AskPanel / SummaryPanel
                              │  HTTP (fetch), JSON + multipart
                FastAPI backend (localhost:8010)
              app/api/{health,documents,folders,query,summarize}.py
        ┌─────────────────────┼───────────────────────┐
        ▼                     ▼                        ▼
  PostgreSQL + pgvector  Local filesystem         Ollama (localhost:11434)
  (localhost:5433)        (storage/documents/)     model: llama3.2
        │
        └── folders, documents, document_chunks (+ embeddings)
```

Backend layering: `app/api/*.py` (thin routers) → `app/services/*.py` (all logic) → `app/models/*.py` / Postgres.

**Upload/index flow:** browser → `POST /api/documents/upload` → `storage_service` (UUID-named file to disk) + `document_service` (upsert Folder/Document) → `document_processing_service.process_document()` synchronously runs `extraction_service` → `chunking_service` → `embedding_service` → writes `DocumentChunk` rows → `processing_status` becomes `indexed`/`failed`.

**Query/answer flow:** browser → `POST /api/query` → `rag_service.answer_question()` → `embedding_service.embed_texts([question])` → `retrieval_service` (scope resolve + pgvector search) → `rag_service._build_context()` → `ollama_service.generate_answer_with_sources()` → `rag_service._parse_and_validate_llm_output()` → `rag_service._dedupe_sources()` → JSON `{answer, sources, chunks_retrieved}`.

**Summarize flow (Phase 5):** browser → `POST /api/summarize` → `summary_service.generate_summary()` → `retrieval_service.resolve_scope_document_ids()` (reused unchanged from Phase 4) → load indexed `DocumentChunk` rows for the resolved documents → `summary_service._build_context()` → `ollama_service.generate_answer()` (single-pass) or `summary_service._generate_map_reduce()` (large scopes) → JSON `{summary, documents_included, chunks_used}`. No new extraction/chunking/embedding pipeline, no new scope-resolution logic, no citations.

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

## 16. Phase 5 — Summarization (COMPLETE)

`POST /api/summarize` generates a natural-language summary of a selected document or folder (recursively including nested subfolders), built entirely from already-indexed Phase 3 chunks — no new extraction/chunking/embedding pipeline, no new scope-resolution logic, no database changes.

```
scope (document or folder) → resolve to a document-id set
    (retrieval_service.resolve_scope_document_ids, reused unchanged from Phase 4)
  → load indexed DocumentChunk rows for those documents
  → build "DOCUMENT N / Name / SOURCE_CHUNK_N / Page / text" context
    (summary_service._build_context), chunks ordered by chunk_index
    (reading order, not similarity rank — there's no question to rank against)
  → Ollama llama3.2 via ollama_service.generate_answer (plain text,
    no structured JSON — unlike Phase 4 Q&A)
  → summary text
```

**Request/response:**
```json
{"scope": {"type": "document", "id": 15}}
// or: {"scope": {"type": "folder", "id": 3}}
```
```json
{"summary": "…", "documents_included": 3, "chunks_used": 6}
```

**Scope schema reused, not duplicated:** `SummarizeRequest.scope` is `schemas.QueryScope` (the exact Phase 4 type: `{type: Literal["all","folder","document"], id: int|None}`, same Pydantic validator requiring `id` for `"folder"`/`"document"`). `"all"` is structurally valid at the Pydantic layer but is explicitly rejected by `summary_service.generate_summary` with `InvalidSummaryScopeError` → `422` — summarization always targets one specific selection, never the whole corpus (no "summarize everything" UI exists).

**Scope resolution reused, not duplicated:** `summary_service.generate_summary` calls `retrieval_service.resolve_scope_document_ids(db, scope_type, scope_id)` — the exact same helper Phase 4's RAG retrieval uses (which itself reuses `document_service.collect_documents_under_folder` for folder scope, including all nested subfolders). Raises `retrieval_service.ScopeNotFoundError` → `404` for an unknown id — same exception class as Phase 4, imported the same way in `app/api/summarize.py`.

Both scopes additionally filter to `processing_status == "indexed"`. An empty folder, a document still `pending`/`processing`/`failed`, or a folder containing only such documents all short-circuit to `summary_service.NO_INDEXED_CONTENT_MESSAGE` (returned as a normal `200` response with `documents_included: 0, chunks_used: 0`) **without ever calling Ollama** — mirrors `rag_service.NO_CONTEXT_MESSAGE`'s role in Phase 4.

**No citations.** Summarization intentionally does not use Phase 4's `SOURCE_N` citation-selection mechanism (§11) — different task, no question to ground an answer against, and forcing it in wasn't worth the complexity for a feature meant to give an overview. `ollama_service.generate_answer` (the plain-text primitive, unused by the Phase 4 query path since §14–15 but explicitly kept for this kind of reuse) is used directly.

**No database changes.** No new tables, no new migrations. Summaries are generated fresh on every request and are never persisted — they exist only in the HTTP response and, client-side, in `SummaryPanel`'s component state for the current session. No caching: every "Generate Summary" click regenerates from scratch.

## 17. Phase 5 context-size strategy

Chosen only after measuring the actual dataset, not assumed: the entire `test-data/NHSRCL-Demo` corpus (5 documents, 8 chunks) is **~2,700 characters total** (measured directly from the DB: `August_06/07/08_Report.pdf` 621/484/479 chars, `Project_Overview.txt` 560, `Safety_Report.docx` 590) — comfortably inside one prompt. So the default path is deliberately the simplest one: build one context block from every chunk in scope, send one summarization prompt, done (`summary_service._summarize_text`).

Two independent, evidence-based triggers fall back to a two-stage map → combine strategy (`summary_service._generate_map_reduce`) instead of one oversized/overloaded prompt — both in `Settings` (`app/config.py`), env-overridable like the RAG settings:

- **`SUMMARY_MAX_CONTEXT_CHARS = 12000`** — a hard character budget on the built context. ~4.4x the real corpus's total size, so this never fires for the current dataset but protects against a genuinely large future upload.
- **`SUMMARY_SINGLE_PASS_MAX_DOCUMENTS = 3`** — found empirically, not guessed. Testing `llama3.2:3B` against this project's own corpus: a 3-document single-pass folder summary (`Operations`) was reliable across repeated runs; a 5-document single-pass summary (`NHSRCL-Demo`, nested) occasionally merged/mislabeled a single document's own numbers even though total content was still tiny (~2,700 chars, nowhere near the char budget) — observed failure: `Safety_Report.docx` literally states "6 track inspections and 4 signal inspections," but a 5-document single-pass summary came back with "**10** track inspections and 4 signal system inspections" (the correct total of both figures, 10, got relabeled onto the wrong figure). This is a distinct failure mode from Phase 4's threshold problem — a document-count effect, not a character-count effect — so it needed its own, independent trigger.

When either trigger fires: each document is summarized individually first (verified reliable in isolation — this is exactly what fixed the 6-vs-10 error, confirmed by testing), then the resulting short per-document summaries are combined with a second, distinct prompt (`SUMMARY_COMBINE_SYSTEM_PROMPT`). If even one document's own content exceeds the char budget on its own (unreachable with the current test corpus), its chunks are deterministically truncated in `chunk_index` order — kept until the budget fills, tail dropped — and the resulting mini-summary gets a short "(Note: ... truncated ...)" suffix so truncation is never silent. Exactly two stages; not a general recursive/hierarchical framework.

**`SUMMARY_NUM_CTX = 8192`** is passed as Ollama's `num_ctx` option on summarization calls only, via `ollama_service.generate_answer`'s new optional `extra_options` parameter (backward-compatible addition — `_call_generate` merges it into the default `{"temperature": ...}` options dict; no existing caller passes it, so Phase 4's RAG generation is provably unaffected). Set explicitly rather than relying on Ollama's undocumented default context window, since summarization prompts can legitimately be longer than a single RAG question.

## 18. Phase 5 summarization prompts

`summary_service.SUMMARY_SYSTEM_PROMPT` and `SUMMARY_COMBINE_SYSTEM_PROMPT` are dedicated prompts, **not a reuse of `rag_service.SYSTEM_PROMPT`** — summarizing has no question to ground an answer against and no citation selection, a genuinely different task with different failure modes. Both instruct the model to: treat supplied content as the only source of truth; never invent facts/numbers/dates/names; preserve important figures exactly as given; synthesize across documents rather than writing disconnected per-document summaries (stating each date/document's own figure side by side when the same metric repeats); and say so plainly if content is too sparse to summarize meaningfully.

**Failure mode found and fixed during implementation (numeric hallucination in aggregation):** an early prompt version allowed the model to compute a combined total across documents/dates. Testing showed `llama3.2:3B` sometimes computed this incorrectly and without being asked to show its work — observed: a 5-document summary stated "a total of 39 trains" when the actual documented daily counts (14, 12, 16) sum to 42. This is a distinct failure mode from Phase 4's arithmetic issue (§12): there, the model needed to be taught *how* to sum reliably (list-then-add, worked example); here, summarization doesn't need a computed total at all, so the fix was to forbid the computation entirely rather than trying to make it reliable. Both prompts now explicitly forbid computing any combined total unless the source material already states that exact total itself, with a worked example (domain-neutral "5 units Monday, 7 Tuesday, 3 Wednesday" — per the §12 lesson, deliberately not resembling the real train-report corpus) showing the required "list side by side" pattern instead of "list is a computed sum is worse than no sum." Re-tested 3x after this fix against the hardest case (5-document nested folder): zero fabricated totals.

**Failure mode found and fixed during implementation (single-document detail-merging in dense multi-document synthesis):** see §17 — the "6 track + 4 signal → 10 track + 4 signal" error. A second prompt rule ("before writing each number down, re-check it against its exact source sentence... do not merge two figures into one") reduced but did not eliminate this error in single-pass mode; the reliable fix was architectural (§17's `SUMMARY_SINGLE_PASS_MAX_DOCUMENTS` trigger), not further prompt tuning — routing that specific case through map → combine, not prompt wording, is what actually eliminated it across repeated runs.

## 19. Phase 5 test results (actually run against current code)

All 8 required tests, run directly through `summary_service.generate_summary` (real DB, real Ollama, nothing mocked) and cross-checked over the real HTTP endpoint:

| # | Test | Scope | Result |
|---|---|---|---|
| 1 | Single document | `document` (`August_06_Report.pdf`) | Correct: mentions p.1 route counts (14/9/14) and p.2 maintenance (track inspection km 45–78, next inspection Aug 20, Vadodara signal OK) |
| 2 | Folder | `folder` (`Operations`) | Correct: synthesizes all 3 daily reports into one narrative (not 3 disconnected summaries), single-pass (3 documents ≤ budget) |
| 3 | Nested folder | `folder` (`NHSRCL-Demo`) | Correct: reaches all 5 documents across 3 subfolders via map→combine (5 > `SUMMARY_SINGLE_PASS_MAX_DOCUMENTS`); no documents outside scope (none exist outside this root anyway — verified via Test 4 for real exclusion) |
| 4 | Scope isolation | `folder` (`Safety`) | Correct: only `Safety_Report.docx` facts (Safety Officer A. Mehta, 6 track + 4 signal inspections, 12 staff certified Aug 5, next review Sep 1) — zero Operations/train facts leaked |
| 5 | Numeric preservation | Folder/nested-folder runs above | 14/12/16 (and 9/9/10, 14/14/15) reproduced correctly whenever stated; zero fabricated totals across repeated runs after the §18 fix (previously observed once: "39" instead of 42) |
| 6 | Empty scope | Empty test folder (created and deleted for this test); nonexistent document/folder id; `scope.type: "all"` | Empty folder → `200` with `NO_INDEXED_CONTENT_MESSAGE`, `documents_included: 0`, Ollama never called (verified: near-instant response, no generation delay). Nonexistent id → `404` (`ScopeNotFoundError`). `"all"` → `422` (`InvalidSummaryScopeError`) |
| 7 | Ollama unavailable | `document` (`August_06_Report.pdf`), Ollama process killed | `503` `"AI model is currently unavailable."` via real HTTP; `/api/health` correctly reported `ollama: unavailable` while `api`/`database`/`pgvector` stayed `ok`; unrelated endpoints (`/api/documents/tree`) kept working; backend never crashed |
| 8 | Phase 4 regression | All of §13's tests | 7/7 scope/hallucination tests pass unchanged; both 5x reliability runs (Test 1, Test 2) unchanged; Phase 5 introduced zero regressions |

**Map→combine path specifically verified** (§17): forced (via direct function call, not a code change) against the 5-document nested-folder case, 2 repeated runs, both correctly preserved "6 track inspections and 4 signal inspections" — confirming the architectural fix, not just a lucky single run.

**A real, unrelated dev-environment issue was found and fixed during Test 7's HTTP verification:** a stale server process from an earlier session was already bound to port 8010, running under the *global* Python interpreter (`C:\Python312\python.exe`, not the project's `.venv`) — exactly the failure mode `docs/CLAUDE_CONTEXT.md` §4 already warned about, serving old code with no `/api/summarize` route at all. Diagnosed via `wmic process where "ProcessId=<pid>" get CommandLine`, killed, server restarted correctly under `.venv`. Not a code bug; recorded here because it's a recurrence of a documented dev-machine quirk, not a new one. (This particular occurrence was a genuine stale process — later occurrences of the same "global interpreter" image were found to be a different, benign phenomenon; see §4 and §33.)

**Frontend:** `npm run lint` and `npm run build` both pass cleanly after the change. `SummaryPanel.tsx` is a new component; `DocumentDetail.tsx`'s two disabled placeholder buttons were replaced with working `<SummaryPanel key={id} scope={...}/>` instances (keyed by document/folder id so switching selection resets stale summary state — the same pattern `AskPanel` already used for scope changes).

## 20. Synthetic test data

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

## 21. Database schema

Two Alembic migrations, applied in order: `7c6c775d2fd0` (create `folders`+`documents`) → `48b55eb229fa` (add `document_chunks` + `documents.processing_status`/`processing_error`). Current head: `48b55eb229fa`.

**`folders`**: `id` PK · `name` String(255) NOT NULL · `parent_id` FK→`folders.id` ON DELETE CASCADE, indexed, nullable (NULL=root) · `path` String(2048) NOT NULL **UNIQUE** (e.g. `"NHSRCL-Demo/Operations"`) · `created_at`. Self-referential `parent`/`children` with `passive_deletes=True` — Postgres's cascade does the work, not SQLAlchemy.

**`documents`**: `id` PK · `folder_id` FK→`folders.id` ON DELETE CASCADE, indexed, nullable (NULL=top-level) · `name`/`original_filename` String(255) · `file_path` String(1024) (UUID-named, relative to storage root) · `file_type` String(10) (`pdf`/`docx`/`txt`) · `file_size` BigInteger · `processing_status` String(20) NOT NULL default `pending` · `processing_error` Text nullable · `created_at`/`updated_at`.

**`document_chunks`**: `id` PK · `document_id` FK→`documents.id` ON DELETE CASCADE, indexed, NOT NULL · `page_number` Integer nullable (NULL for DOCX/TXT, never fabricated) · `chunk_index` Integer NOT NULL (0-based per document) · `content` Text NOT NULL · `embedding` `pgvector.sqlalchemy.Vector(384)` NOT NULL (`EMBEDDING_DIMENSIONS` constant lives in this model, imported by `embedding_service.py`) · `created_at`.

Cascade verified end-to-end: Folder delete → Documents cascade → DocumentChunks cascade (all Postgres `ON DELETE CASCADE`); physical files are cleaned up separately by application code (`storage_service.delete_physical_file`) before the DB delete, since disk files aren't Postgres-tracked. No index on `document_chunks.embedding` (§8).

## 22. Project tree (key files)

```
NHSRCL DocIntel/
├── docs/CLAUDE_CONTEXT.md          # this file
├── backend/
│   ├── alembic/versions/{7c6c775d2fd0,48b55eb229fa}_*.py
│   ├── app/
│   │   ├── api/{health,documents,folders,query,summarize}.py  # documents.py gained GET /{id}/content (P7)
│   │   ├── models/{folder,document,document_chunk}.py
│   │   ├── services/
│   │   │   ├── storage_service.py             # file I/O, UUID naming, path safety (P2)
│   │   │   ├── document_service.py             # folder/doc CRUD, tree, collect_documents_under_folder (P2)
│   │   │   ├── extraction_service.py           # PDF/DOCX/TXT → text (P3)
│   │   │   ├── chunking_service.py             # clean_text, chunk_pages (P3)
│   │   │   ├── embedding_service.py             # SentenceTransformer singleton (P3, reused P4)
│   │   │   ├── document_processing_service.py  # extract→chunk→embed→store orchestration (P3)
│   │   │   ├── retrieval_service.py             # scope resolution + pgvector search (P4, unchanged by §14-15, reused unchanged by P5)
│   │   │   ├── rag_service.py                   # RAG orchestration, SYSTEM_PROMPT, SOURCE_N context, LLM output validation, dedup (P4)
│   │   │   ├── summary_service.py               # summarization orchestration, SUMMARY_SYSTEM_PROMPT, map->combine (P5)
│   │   │   └── ollama_service.py                # health check + generate_answer(+extra_options) + generate_answer_with_sources (P1+P4+P5)
│   │   ├── config.py / db.py / schemas.py / main.py
│   ├── alembic.ini / requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx               # root layout: renders Header once, wraps {children} (P6)
│   │   ├── page.tsx                 # "/" Dashboard: renders DashboardOverview, no document sidebar (P6, content P6D)
│   │   ├── documents/page.tsx       # "/documents": renders DocumentExplorer (P6, redesigned P6A)
│   │   ├── ask/page.tsx             # "/ask": AskSidebar + AskPanel (P6, redesigned P6B)
│   │   └── summaries/page.tsx       # "/summaries": SummariesSidebar + SummaryPanel (P6, redesigned P6C)
│   ├── components/{Header,HealthStatus}.tsx   # Header: client component, routed nav + active-link styling (P6). HealthStatus restyled P6D, same fetchHealth()/15s poll
│   ├── components/dashboard/        # Dashboard-only pieces (P6D), all fed by useDocumentTree()
│   │   ├── DashboardOverview.tsx    # orchestrator; replaces the deleted WelcomePanel.tsx
│   │   ├── OverviewCards.tsx        # Documents/Folders/Indexed/Processing+Failed counts
│   │   ├── QuickActions.tsx         # Upload Files/Folder (via UploadControls "cards" variant) + Ask a Question/Browse Documents links
│   │   ├── RecentDocuments.tsx      # up to 5 real documents, sorted by real updated_at
│   │   └── FolderOverview.tsx       # tree.folders (true top-level only) with countContents doc counts
│   ├── components/document/
│   │   ├── DocumentExplorer.tsx    # "/documents" main content; folder-card/grid browser (rewritten P6A), swaps in DocumentPreview on file select (P7)
│   │   ├── Breadcrumbs.tsx         # folder-path trail for DocumentExplorer (P6A)
│   │   ├── FolderCard.tsx          # folder-grid card: icon/name/recursive counts/Open/delete (P6A)
│   │   ├── FileRow.tsx             # compact file-list row: icon/name/type/size/status/delete (P6A)
│   │   ├── DocumentPreview.tsx     # full in-page PDF/DOCX/TXT preview, replaces the old DocumentFileDetail side panel (P7)
│   │   ├── DocumentSidebar.tsx     # original shared tree sidebar (P6) -- UNUSED as of P6B/P6C, each workspace has its own dedicated sidebar now; left in place, not deleted
│   │   ├── FolderTree.tsx          # recursive tree UI; delete handlers optional; still used by AskSidebar/SummariesSidebar
│   │   ├── AskSidebar.tsx          # /ask's own sidebar: FolderTree + a prominent "All Documents" row (P6B)
│   │   ├── SummariesSidebar.tsx    # /summaries' own sidebar: FolderTree, deliberately NO "All Documents" row -- no `all` scope exists for summarization (P6C)
│   │   ├── UploadControls.tsx      # Upload Files/Folder + result summary; variant: "sidebar" | "toolbar" (P6A) | "cards" (P6D) -- one upload implementation, three button shells
│   │   ├── DocumentDetail.tsx      # DocumentFolderDetail: compact info bar used inline above a folder's contents (P6A). DocumentFileDetail: unused as of P7 (replaced by DocumentPreview), left in place
│   │   ├── AskPanel.tsx            # P4, rewritten P6B: persistent question card, empty state + example questions, formatted answer via answerFormatting.ts, mapped ApiError copy
│   │   ├── SourceCard.tsx          # one backend-returned source as a compact card (P6B)
│   │   └── SummaryPanel.tsx        # P5, rewritten P6C: selection-info card + Generate/Regenerate + result via answerFormatting.ts
│   ├── lib/api.ts                   # fetch wrappers + types; ApiError class + API_BASE_URL export (P6B/P6D); document-content endpoints (P7)
│   ├── lib/tree.ts                  # countContents, findFolderById, findDocumentById (P2/P6); flattenDocuments (P6D)
│   ├── lib/answerFormatting.ts      # parseAnswerBlocks() -- paragraph/list block parser, shared by Ask/Summaries/preview text (P6B, reused P6C/P7)
│   ├── lib/{format,processingStatus}.ts
│   ├── lib/useDocumentTree.ts       # shared tree-fetch/selection/scope-derivation hook (P6), unchanged since
│   └── package.json
├── storage/documents/              # local-only, gitignored, UUID-named files
├── test-data/NHSRCL-Demo/          # synthetic fictional dataset, §20
├── docker-compose.yml / .env.example / README.md
```

## 23. Current API contract

| Method | Path | Request | Response | Errors |
|---|---|---|---|---|
| GET | `/api/health` | — | `{api,database,pgvector,ollama}` each ok/unavailable | Never errors |
| POST | `/api/documents/upload` | multipart `files[]`+`paths[]` | `{results[],created,replaced,failed}` + per-file `processing_status` | 400 length mismatch; per-file errors inline |
| GET | `/api/documents/tree` | — | `{folders[],documents[]}` nested, incl. `processing_status` | — |
| GET | `/api/documents/{id}/content` | — | PDF: raw file, `Content-Type: application/pdf`, `Content-Disposition: inline`. DOCX/TXT: `{file_type, content}` JSON (extracted text via `extraction_service`, unchanged) | 404 missing document/file, 415 unsupported type (unreachable via current upload validation), 422 extraction failure, 500 path-resolution failure (§31) |
| DELETE | `/api/documents/{id}` | — | 204 | 404 |
| DELETE | `/api/folders/{id}` | — | 204, recursive | 404 |
| POST | `/api/query` | `{question,scope}` | `{answer,sources[],chunks_retrieved}` | 422 bad input, 404 scope id, 503 Ollama down, 500 unexpected |
| POST | `/api/summarize` | `{scope}` (`QueryScope` reused; `"all"` rejected) | `{summary,documents_included,chunks_used}` | 422 bad/`"all"` scope, 404 scope id, 503 Ollama down, 500 unexpected |

## 24. Frontend (current)

**A real multi-route app.** Four routes: `/` (Dashboard), `/documents`, `/ask`, `/summaries` — routing structure from Phase 6, but every page's *content* has since been individually redesigned (Documents §27, Ask §28, Summaries §29, Dashboard §30) plus document preview added to Documents (§31). `Header` lives in the root layout (`app/layout.tsx`), never duplicated per page; a client component (`usePathname` + `next/link`) highlighting whichever nav item matches the current route — unchanged since Phase 6.

**Shared tree/selection state** (`lib/useDocumentTree.ts`, Phase 6, unchanged since): `useDocumentTree()` returns `{tree, loading, error, isEmpty, selection, setSelection, selectedFolder, selectedDocument, queryScope, scopeLabel, loadTree, handleDeleteFolder, handleDeleteDocument}`. **All four pages** — `/documents`, `/ask`, `/summaries`, and now `/` (Dashboard, since Phase 6D) — call this same hook. The fetch-tree/selection logic is written exactly once; this is the single most-reused piece of frontend state in the app.

**No shared sidebar component anymore.** Phase 6's single `DocumentSidebar.tsx` (reused by all three workspaces) was replaced, one workspace at a time, by a purpose-built sidebar per page — because the three pages' scope semantics actually differ (Ask has an `"all"` scope, Summaries doesn't, Documents doesn't use a sidebar/tree UI at all anymore):
- **`/documents`** (`DocumentExplorer.tsx`, §27): no sidebar. A folder-card grid + breadcrumb, its own client-side navigation state (`folderPathIds`, `search`), and — since Phase 7 — a full-width `DocumentPreview` that replaces the grid entirely while a file is open.
- **`/ask`** (`AskSidebar.tsx`, §28): `FolderTree` + a prominent "All Documents" row.
- **`/summaries`** (`SummariesSidebar.tsx`, §29): `FolderTree`, deliberately with no "All Documents" row (summarization has no `all` scope).

`DocumentSidebar.tsx` and `FolderTree.tsx` are the only original Phase 6 sidebar pieces still in the tree: `DocumentSidebar.tsx` is now **unused** (kept, not deleted); `FolderTree.tsx` is still the tree-rendering primitive both `AskSidebar` and `SummariesSidebar` build on.

**`AskPanel`** (rewritten Phase 6B, §28): persistent "Ask about {scope}" question card; a real empty state with 3 clickable example questions until the first query; a single stable loading message; answer rendered via `lib/answerFormatting.ts`'s paragraph/list blocks; sources as `SourceCard`s; fixed error copy per HTTP status via the `ApiError` class (`lib/api.ts`).

**`SummaryPanel.tsx`** (rewritten Phase 6C, §29): a selection-info card (real file type/status or real recursive document count) with Generate/Regenerate, result via the same `answerFormatting.ts` blocks. `key`ed by scope so switching selection always drops a stale summary — same pattern as `AskPanel`. No longer embedded inside `DocumentDetail.tsx`'s `DocumentFileDetail`/`DocumentFolderDetail` (that embedding was removed in Phase 6A when the Documents page dropped its old detail-panel layout) — summarization now lives exclusively on `/summaries`.

**`DocumentPreview.tsx`** (new, Phase 7, §31): full in-page PDF/DOCX/TXT preview, opened by clicking a file on `/documents`. One `fetch()` per file type (including PDF, so error handling is uniform); PDF renders via the browser's own native viewer (`Blob` → `URL.createObjectURL()` → `<iframe>`); DOCX/TXT render via `answerFormatting.ts`.

**`DashboardOverview.tsx`** (new, Phase 6D, §30, replaces the deleted `WelcomePanel.tsx`): real overview cards, System Status (`HealthStatus.tsx`, restyled only — same `fetchHealth()`/15s poll), Quick Actions, Recent Documents, Folder Overview — every number derived from `useDocumentTree()`'s tree, no fabricated statistics.

Processing status shown in: `FolderTree` rows (`processingStatus.ts`: ○/⟳/✓/⚠, `processing` spins), `DocumentPreview`'s metadata bar, and the Dashboard's overview cards.

## 25. Architectural decisions (why, briefly)

Postgres+pgvector (one DB to run, sufficient at this scale) · local FS storage with UUID filenames + Postgres logical hierarchy (structurally eliminates path traversal, avoids filename collisions) · Alembic (standard, minimal) · synchronous processing everywhere (simpler than a queue; explicitly avoids Celery/Redis/Kafka) · `all-MiniLM-L6-v2` (small, fast, local, no demonstrated need for anything bigger) · `llama3.2` via Ollama HTTP only, never CLI · no HNSW index (premature at this scale) · no LangChain/LlamaIndex (the actual pipeline is a few hundred lines and doesn't benefit from a framework) · no reranking/hybrid search (not needed yet; explicitly not the fix for §15) · backend-generated citations only (the LLM demonstrably can't be trusted to report sources accurately — §11) · no streaming/WebSockets/history (single-turn tool, added complexity not requested) · no authentication (local single-user demo) · summarization reuses Phase 4's scope-resolution and Ollama service rather than parallel implementations, but gets its own prompt and no citation mechanism — different task, different failure modes (§16, §18) · summarization has no persistence/caching by design (§16) — regenerated on every click, nothing new in Postgres · routing (§26) is real Next.js App Router pages, not hash-based sections — chosen because the app is a workspace with distinct tasks (browse/ask/summarize), not a long marketing page · one root layout + one shared hook (`useDocumentTree`), not per-route reimplementations — the exact same reuse discipline as the rest of the project · **the one shared sidebar component was later split into per-workspace sidebars** (§24, §27–29) once Ask/Summaries' actual scope semantics diverged (Ask has `"all"`, Summaries doesn't) — a shared component whose behavior has to be conditionally suppressed per caller is itself a smell; three small, honestly-different components beat one component pretending three UIs are the same · `ApiError` (`lib/api.ts`, §28) — one small `Error` subclass carrying the HTTP status, added once and reused by every later frontend error-mapping need (Ask, Summaries, document preview) rather than re-deriving status-code logic per feature · `lib/answerFormatting.ts`'s `parseAnswerBlocks()` (§28) — one paragraph/bullet-list text formatter reused verbatim by Ask's answers, Summaries' results, and Phase 7's DOCX/TXT preview text, since all three are "render backend-returned prose readably" with the identical constraint (presentation only, never alter the text) · document preview (§31) uses the browser's own native PDF viewer via a `Blob` object URL rather than a PDF.js/rendering dependency — zero new packages, and the browser already handles large multi-page PDFs efficiently · every new `fetch()` that reads mutable server state now explicitly sets `cache: "no-store"` (established with `fetchDocumentTree`, re-confirmed necessary the hard way for the Phase 7 preview endpoint — see §31) — the browser's default HTTP cache can silently serve stale bytes for a URL keyed only by a stable id when the underlying content changes (a document re-upload/replace, or a backend outage a cached response would otherwise mask).

## 26. Phase 6 — Application Navigation & UI Structure (COMPLETE)

Turned the previously-inert "Documents"/"Ask"/"Summaries" nav placeholders into real routes: `/` (Dashboard), `/documents`, `/ask`, `/summaries`. **Frontend-only phase — zero backend files touched, zero API contract changes, zero database changes.** See §24 for the component-level detail; this section covers what changed structurally and how it was verified.

**Files created:** `lib/useDocumentTree.ts` (shared hook), `components/document/DocumentSidebar.tsx` (shared sidebar), `app/documents/page.tsx`, `app/ask/page.tsx`, `app/summaries/page.tsx`.

**Files modified:** `app/layout.tsx` (Header hoisted into the root layout so it's never duplicated per page), `components/Header.tsx` (rewritten as a client component using `next/link` + `usePathname` for real navigation and active-link highlighting — no more inert `<span>`s), `app/page.tsx` (Dashboard: now just `WelcomePanel`, no document sidebar — "do not force the document sidebar onto Dashboard if it doesn't make sense there" was explicit in the spec), `components/WelcomePanel.tsx` (updated copy + quick-link cards, §24), `components/document/DocumentExplorer.tsx` (thinned to use the shared hook/sidebar, dropped its inline `AskPanel`), `components/document/FolderTree.tsx` (`onDeleteFolder`/`onDeleteDocument` made optional, backward-compatible — existing `/documents` usage passes them unchanged; `/ask`/`/summaries` omit them and simply don't get delete buttons on their read-only tree).

**No new dependencies** — `next/link` and `next/navigation`'s `usePathname` are already part of `next`, no new package was added. No UI framework/component library introduced, per the spec.

**Verification actually run** (real browser, not just `npm run build`'s type-checking, though that ran too and passed): a headless Chrome instance (`puppeteer-core` pointed at the machine's existing Chrome install — no new project dependency, used only as a one-off local verification tool, not added to `package.json`) drove the running dev server end-to-end:
- All 4 routes load, both via direct navigation (`page.goto`) and via clicking the actual nav links.
- Active-nav styling checked at the DOM level (`getComputedStyle` on every `<a>`, plus `aria-current="page"`) — confirmed exactly one link active per page, in both navigation modes. (A screenshot taken mid-navigation once showed two links looking highlighted; re-verified with proper waits and direct style inspection — that was a transient Next.js **dev-mode** route-compile artifact, visible together with the dev "Rendering…" badge in that one screenshot, not a real bug. Confirmed absent once the page settled, and `npm run build` showed all 4 routes prerender as fully static, so this can't occur at all in production.)
- `/documents`: tree renders (folders/documents from the real DB), upload buttons present, matches pre-Phase-6 behavior.
- `/ask`: submitted a real question ("How many trains ran from Ahmedabad to Mumbai from August 6 to August 8?") with no selection (scope "all") — got a real Ollama-generated answer with source cards, i.e. the full Phase 4 pipeline fired correctly through the new page.
- `/summaries`: selected a folder in the sidebar, clicked "Generate Summary" — got a real Ollama-generated multi-document summary, i.e. the full Phase 5 pipeline fired correctly through the new page.
- Browser back/forward tested explicitly as its own sequence (`/` → `/documents` → `/ask` → `/summaries`, then back×3, forward×3) — landed on the exact expected URL at every step.
- Zero browser console errors across the entire run.

**An observation, not a Phase 6 bug:** the live database currently has more documents than the pristine `test-data/NHSRCL-Demo` corpus described in §20 (extra folders like `NHSRCL_Demo_Data`/`NHSRCL` with what look like duplicate re-uploads of the same daily reports, evidently uploaded at some point outside of a documented test run). The Ask test above therefore returned 44 rather than the canonical 42 — this reflects the current *data*, not a Phase 6 or Phase 4 regression; the RAG pipeline itself is untouched and answered correctly given what's actually indexed. Not investigated or cleaned up here, since Phase 6 was explicitly frontend-only and touching data/backend wasn't in scope.

**A pre-existing dev-environment quirk recurred a third time during verification** (§4, §33): the backend on port 8010 was again found running under the *global* Python interpreter rather than the project's `.venv`. Unlike the Phase 5 occurrence (a genuine stale process, §19), a full parent-process-chain diagnosis this time (`Get-CimInstance Win32_Process`, done during the subsequent boot-up session) showed this is a benign Windows `multiprocessing`/venv resolution artifact, not staleness: the venv's `python.exe` launches correctly and its spawned `uvicorn` worker still inherits the venv's `sys.path` correctly, even though Windows reports the worker's image as the global interpreter. It was serving current code because it *was* current code, not by luck. See §4 for the general note.

## 27. Phase 6A — Documents page redesign (COMPLETE)

Replaced the old sidebar-tree + single-detail-card `/documents` layout with a folder-card/grid browser. **Frontend-only — zero backend/API/database changes.**

New components (`components/document/`): `Breadcrumbs.tsx` (client-side folder-path trail); `FolderCard.tsx` (icon, name, recursive doc/folder counts via the existing `countContents`, Open, hover-to-delete, `cursor-pointer` on every clickable part); `FileRow.tsx` (compact file-list row: icon, name, type/size/status, hover-to-delete).

`DocumentExplorer.tsx` rewritten to own purely local UI navigation state — `folderPathIds: number[]` and `search: string` — no tree-fetch/selection duplication, still built on `useDocumentTree()`. `resolveFolderPath()` re-walks `tree.folders` from the id chain on every render rather than caching folder objects, so a stale/deleted folder in the path self-heals to its nearest still-existing ancestor with no extra effect needed. A "← Back" control always goes exactly one level up (`goToBreadcrumb(folderPath.length - 1)`), never straight to root. Client-side search filters only the *currently displayed* level, not the whole tree.

`UploadControls.tsx` gained a `variant` prop (`"sidebar"` original | `"toolbar"` new, for the Documents page header) — identical upload logic/inputs, a different button shell; extended twice more later (`"cards"`, Phase 6D §30).

`DocumentDetail.tsx`'s `DocumentFolderDetail` became a compact horizontal info bar (name/path/counts/delete) instead of a full standalone card, shown inline above a folder's contents. `DocumentFileDetail` gained optional `onDelete`/`onClose` props at this point, but was itself **fully superseded in Phase 7** (§31) by `DocumentPreview.tsx` and is now unused (left in place, not deleted).

Verified against the real DB/browser: folder-grid navigation to any depth, search (folder-name and file-name), a real upload+delete round-trip, back-arrow-to-immediate-parent (never root), pointer cursor on every folder-card element. `npm run lint`/`npm run build` pass.

## 28. Phase 6B — Ask page redesign (COMPLETE)

Turned `/ask` into a dedicated two-column Q&A workspace. **Zero RAG backend changes** — `rag_service.py`, `retrieval_service.py`, `/api/query`'s contract are all untouched.

New: `AskSidebar.tsx` — reuses `FolderTree`/`useDocumentTree()` unchanged, adds a prominent "All Documents" row above the tree (`selection === null`). Deliberately a **separate** component from `DocumentSidebar.tsx`, not a modified one — see §24/§25 for why (Summaries' sidebar must never gain an "all" option it can't honor).

`lib/answerFormatting.ts` (new) — `parseAnswerBlocks(text)`, a pure function splitting an LLM answer into paragraph/bullet-list/numbered-list blocks for `<ul>/<ol>` rendering. Presentation only: never adds/removes/reorders words; a line's leading `"- "`/`"1. "` marker is stripped only when replaced by an equivalent semantic HTML list marker. Reused unchanged by Summaries (§29) and document-preview text (§31).

`components/document/SourceCard.tsx` (new) — one backend-returned source as a compact card; its file-type badge is parsed from the already-returned `document_name` string, not separately invented.

`lib/api.ts` gained `ApiError` (an `Error` subclass carrying the HTTP status) so `askQuestion()` — and later `generateSummary()` (§29) and the Phase 7 preview fetch (§31) — can map 404/422/503/other to fixed, user-facing copy instead of showing the backend's raw `detail` string. Existing callers that only read `.message` are unaffected (`ApiError instanceof Error`).

`AskPanel.tsx` rewritten: persistent "Ask about {scope}" question card; a real empty state (heading + 3 clickable example questions — hardcoded in the frontend only, never sent to the backend or any prompt) shown until the first query; a single stable loading message (replacing the old two-stage 900ms-delayed text flip); explicit "No supporting documents were found." when `sources` is empty; fixed error copy per status code via `ApiError`.

Verified against the real DB/Ollama: All Documents / folder / document / nested-folder scopes, scope isolation (a wrong-folder question correctly refused, zero leakage), hallucination refusal, scope-switch clears the previous answer (`key={scope.type+id}` remount, unchanged since Phase 4/6), empty-question disables Ask, and the 503 path — which required stopping **both** Ollama's server process and its Windows tray-app supervisor, since the tray app silently respawns the server if only the server is killed.

**Noted, not fixed** (explicitly out of scope for a frontend-only task): querying "All Documents" against the live DB's extra/duplicate data (§33) sometimes returns the LLM's raw `SOURCE_N` labels inline in the answer prose and a non-canonical sum — pre-existing backend/prompt behavior, confirmed unrelated to this phase since no backend file was touched; scoping to the pristine `NHSRCL-Demo/Operations` folder alone gives the canonical, clean 42.

## 29. Phase 6C — Summaries page redesign (COMPLETE)

Turned `/summaries` into a dedicated summarization workspace. **Zero Phase 5 backend changes** — `summary_service.py`, `/api/summarize`'s contract untouched.

New: `SummariesSidebar.tsx` — like `AskSidebar` but **deliberately has no "All Documents" row**: summarization has no `all` scope on the backend (`SummaryScope` is `"document"|"folder"` only; `generate_summary` rejects `"all"` with a 422, §16). A third sidebar variant, not a shared/modified one, for the same reason as §28.

`SummaryPanel.tsx` rewritten from a small button+result appendage into the full right-workspace: a "Summarize {name}" header, a selection-info card (icon, real file type/status or real recursive document count via `countContents` — never invented) with Generate/Regenerate, and the result rendered through `lib/answerFormatting.ts` (reused from §28) instead of raw `whitespace-pre-wrap` paragraphs.

Verified against the real DB/Ollama: single document, folder (3-document synthesis), nested folder (2 levels deep), regenerate, scope-switch clears the prior summary and resets the button to "Generate Summary", the existing empty-content path (created a real empty folder via the upload API — uploaded one file then deleted just the document, leaving the folder — selected it, got the backend's canned message in 64ms confirming Ollama was never called, then deleted the test folder), and the 503 path (same stop-both-Ollama-processes method as §28).

## 30. Phase 6D — Dashboard redesign (COMPLETE)

Turned `/` from a static welcome blurb into a real workspace overview. **Zero backend changes** — every number is derived from the existing `GET /api/documents/tree` and `GET /api/health` responses; no storage size, chunk counts, trends, percentages, or fabricated timestamps anywhere.

`WelcomePanel.tsx` **deleted**, replaced by `components/dashboard/DashboardOverview.tsx` plus four new presentational components (`OverviewCards.tsx`, `QuickActions.tsx`, `RecentDocuments.tsx`, `FolderOverview.tsx`) under a new `components/dashboard/` directory. Reuses `useDocumentTree()` unchanged (no second tree fetch) purely to derive numbers.

`lib/tree.ts` gained `flattenDocuments(tree)` — a pure function returning every document at any depth with its immediate parent folder's name; used for the status-count breakdown (indexed/processing/failed) and the "Recent Documents" list (sorted by the API's real `updated_at`, an ISO 8601 string that sorts correctly as a plain string comparison — no invented "2 hours ago" text is shown).

`UploadControls.tsx` gained a third variant, `"cards"` — identical upload logic, rendered as two Quick-Action-styled buttons instead of the toolbar/sidebar shells.

`HealthStatus.tsx` restyled only (icon + label + description + "● Operational"/"⚠ Unavailable" rows, a real link straight to `GET /api/health`'s JSON) — the `fetchHealth()` call and 15s poll are completely unchanged, still the only health-check implementation. `lib/api.ts`'s `API_BASE_URL` constant was exported (previously module-private) so that link could target the real backend without a second hardcoded copy of the fallback URL logic.

**Deliberate deviation from the original design reference:** Folder Overview shows the database's *actual* top-level folders (`tree.folders` directly — currently `NHSRCL-Demo` and `NHSRCL_Demo_Data`, 2 folders) rather than a deeper level of folders. The written spec explicitly said "top-level folders," and the tree's real top level currently has only 2 entries — showing more would mean fabricating structure not actually present at that depth.

Verified against the real DB: displayed counts (21 documents / 20 folders / 21 indexed / 0 processing / 0 failed at verification time) independently cross-checked against a separate script walking the same tree response outside the app — exact match. Both upload Quick Action cards tested end-to-end (uploaded a real file, count went 21→22, deleted it, back to 21). The empty-workspace state exists in code (reuses the identical `isEmpty` flag already proven live in Documents/Ask/Summaries) but was **not exercised live** — doing so would have required deleting the real demo dataset.

## 31. Phase 7 — Document preview (COMPLETE)

Clicking a document on `/documents` now opens a full in-page preview instead of just a metadata card. **One new minimal backend endpoint, zero new dependencies, zero changes to any other backend service.**

**Backend:** `GET /api/documents/{id}/content` (`app/api/documents.py`) — looks the document up by id (404 if missing), resolves its stored `file_path` through `storage_service.resolve_storage_path()`'s existing containment check (never a caller-supplied filesystem path), then branches on `file_type`:
- **PDF** → the raw stored file streamed via `FileResponse` with `Content-Disposition: inline` (so the browser's own PDF viewer renders it — deliberately not a custom PDF.js/rendering dependency).
- **DOCX/TXT** → `extraction_service.extract_document()` **unchanged**, the exact function Phase 3's indexing pipeline already uses, returned as `DocumentContentResponse` JSON (`schemas.py`).
- Anything else → 415 (unreachable via the current upload path, which only ever allows pdf/docx/txt — a defensive branch, not something believed to occur in practice).

Chose **one** endpoint over two (`/content` vs. also adding `/file`) — the response shape differs by file type, but the frontend already knows `file_type` from the tree, so there's no ambiguity for the caller and no need for a second route.

**Frontend:** `DocumentPreview.tsx` (new) — metadata bar (filename/type/size/status/uploaded/updated — only fields that already exist reliably; Delete + close, same delete flow as before) over a scrollable content area. A single `fetch()` (not a bare `<iframe src=...>`) loads content for **every** file type including PDF, so a failed load (missing document, deleted file, backend down) shows the same clean in-app error card regardless of type — cross-origin restrictions mean the app can't otherwise tell an iframe's own HTTP error apart from a successful load. On success: PDF bytes become a `Blob` → `URL.createObjectURL()` fed to an `<iframe>` (revoked on close/document-change to avoid leaking memory); DOCX/TXT text is rendered through `lib/answerFormatting.ts` (reused from §28/§29) — presentation only, text never altered.

`DocumentExplorer.tsx`: selecting a document now swaps the **entire main content area** for `DocumentPreview` (a narrow side panel isn't wide enough to make a PDF/DOCX page actually readable) instead of the old `DocumentFileDetail` side panel; a single "← Back to Documents" replaces the search/breadcrumb row while previewing. `folderPathIds`/`search` are completely untouched by opening/closing a preview, so closing it returns to the exact same folder/search context — never back to the Documents root or the Dashboard. `DocumentPreview` is keyed by `document.id` so switching documents is a full, clean remount.

`lib/api.ts` gained `documentContentUrl()`/`fetchDocumentContentRaw()` (throws the existing `ApiError`, §28) with `cache: "no-store"` (same as `fetchDocumentTree()`) — **found and fixed during testing**: without it, a re-uploaded/replaced document (same id/URL, different bytes) could show a stale cached preview, and it also silently defeated an early attempt to test the "backend unavailable" error path (the browser served a cached PDF instead of hitting the dead network — see §25).

**Verified against the real backend/DB:** a real PDF, DOCX, and TXT from the demo dataset all render/read correctly. No 194-page test document existed in this DB instance, so one was generated with `pymupdf` (already a project dependency, `backend/.venv`) and uploaded through the real upload API — loaded and rendered in ~1.5s via Chrome's native PDF.js, page stayed fully responsive throughout, then the test file/folder were deleted afterward. Closing a preview verified to land back on the exact folder it was opened from, breadcrumb and file list intact. Missing-document and backend-unavailable paths both verified to show clean errors without crashing the page (backend-unavailable specifically required killing the actual server process mid-session, not just simulating one, once `cache: "no-store"` was added — see above). `/ask`, `/summaries`, `/`, and the rest of `/documents` all confirmed unaffected.

**Dev note:** hit the documented `uvicorn --reload` quirk (§4) again mid-phase — the reloader logged a "Reloading..." line for one changed file but the new route didn't actually register in `/openapi.json` until the process was killed and restarted without `--reload`. Consistent with the existing guidance: verify via `/openapi.json`, don't assume a logged reload line means the change is live.

## 32. Things intentionally NOT built

Do not casually introduce: authentication/users, cloud deployment/public hosting, Redis, Celery, Kafka, LangChain, LlamaIndex, any external/paid LLM or embedding API, a second vector database, OCR/scanned-PDF support, Excel/CSV/PPTX ingestion, chat history/persistence, response streaming, WebSockets, hybrid/keyword search, or reranking. If a task seems to need one of these, ask first.

## 33. Known issues / quirks (dev-environment notes, not architectural failures)

Backend on port 8010, Postgres host port 5433 (§4) · Windows stale/phantom TCP listener behavior observed on this dev machine, not a DocIntel bug · `uvicorn --reload` once respawned under the global interpreter, serving stale code (workaround in README) · the port-8010 process has repeatedly been observed running under the *global* Python interpreter (not `.venv`) rather than a distinct process each time (§4, §19, §26) — in one case (Phase 5) this was a genuine stale leftover process blocking a new one from starting (confirmed by a missing route); in later cases it was traced to a benign Windows `multiprocessing`/venv artifact where the spawned `uvicorn` worker's OS-reported image differs from the launching interpreter while still correctly inheriting its `sys.path`. **Don't assume either cause — check `/openapi.json` for the expected routes and `/api/health` before deciding a kill+restart is needed.** · Phase 3/4/5 processing, querying, and summarization are fully synchronous within their HTTP request, by design · Ollama + `llama3.2` must be running locally for `/api/query` and `/api/summarize`; everything else works without it · **the retrieval/source-precision issue in §14–15 is RESOLVED** (LLM-side source selection, retrieval config unchanged) · few-shot prompt examples must never reuse the real document domain's content, for RAG (§12) or summarization (§18) — discovered independently in both · **the live DB has extra/duplicate documents beyond the pristine `test-data/NHSRCL-Demo` corpus** (§26) — don't be surprised if a "42 trains" style regression check returns a different number than §13/§20's ground truth; that's the current data, not a code regression, and wasn't touched by Phase 6 (out of scope — frontend-only phase).

## 34. Current state

```
PHASE 1 — COMPLETE
PHASE 2 — COMPLETE
PHASE 3 — COMPLETE
PHASE 4 — COMPLETE (all required test/scope/hallucination/failure tests pass, including source-precision fix)
PHASE 4 RETRIEVAL / SOURCE-PRECISION — RESOLVED (§14–15): LLM evidence selection over backend-issued SOURCE_N labels, retrieval config unchanged
PHASE 5 — COMPLETE (§16–19): document/folder/nested-folder summarization, all 8 required tests pass, zero Phase 4 regressions
PHASE 6 — COMPLETE (§26): real routes (/, /documents, /ask, /summaries), routed nav with active-link styling, zero backend/API/DB changes, verified in a real browser
PHASE 6A — COMPLETE (§27): Documents page redesign (folder-card/grid browser), frontend-only
PHASE 6B — COMPLETE (§28): Ask page redesign (dedicated sidebar, formatted answer/sources), zero RAG backend changes
PHASE 6C — COMPLETE (§29): Summaries page redesign (dedicated sidebar, selection card), zero Phase 5 backend changes
PHASE 6D — COMPLETE (§30): Dashboard redesign (real overview cards/quick actions/recent docs/folder overview), zero backend changes
PHASE 7 — COMPLETE (§31): document preview (PDF/DOCX/TXT) on the Documents page, one new minimal backend endpoint, zero new dependencies
```

## 35. Next immediate task

None assigned as of this update — Phase 7 is complete and verified (§31), and with it, every page-by-page redesign task planned since Phase 6 (§27–31) is done. No further scope has been defined; don't invent one without explicit instruction (§37 rule 11).

## 36. Future phases (broad, not over-specified)

Phases 5 through 7 (§16–19, §26–31) are complete. Later, undesigned: broader testing, documentation, demo/report prep for the internship deliverable, and whatever comes after document preview (§31) — nothing has been scoped past it. No concrete plans exist yet for these — don't invent scope.

## 37. Instructions for future Claude

1. Inspect the actual current code before modifying anything — this document is a snapshot and will drift.
2. Treat existing functionality as intentional unless you can demonstrate an actual problem (§25 has the reasoning).
3. Don't rewrite working architecture unnecessarily — small, targeted changes over rewrites.
4. Preserve the free/local requirement absolutely.
5. Don't add infrastructure (Redis/Celery/Kafka/second vector DB/etc.) without being explicitly asked.
6. Reuse existing services — especially `collect_documents_under_folder`, `retrieval_service.resolve_scope_document_ids`, `embedding_service.embed_texts`, `ollama_service.generate_answer` — rather than parallel implementations.
7. Reuse the existing embedding model and LLM unless explicitly told to change them.
8. Preserve API compatibility where practical; if a response shape must change, update `frontend/lib/api.ts` types together with it.
9. Test after modifications — the synthetic dataset and §13's/§19's regression sets exist so changes can be verified, not assumed.
10. Don't claim functionality is implemented/fixed/verified without actually running it.
11. Don't start a future phase without explicit instruction.
12. Update this document after major completed phases or after resolving an open issue, using the same "inspect the repo first" discipline.
13. Treat this document as orientation; treat the repository as ultimate truth when they disagree.
14. §14–15 is resolved (LLM-side source selection); don't re-open it by reducing `RAG_TOP_K`/raising `RAG_SIMILARITY_THRESHOLD` to chase precision — that path was investigated and proven not to work (§15 Step 1).
15. **Never solve retrieval precision by blindly reducing `RAG_TOP_K` (or otherwise starving retrieval) if it breaks multi-document questions like the "42 trains" test.** Investigate first; change minimally. (This is now a permanent rule, not just historical context — it's exactly what the §14–15 investigation proved.)
16. **Never let a few-shot example in a system prompt reuse content from the real document domain** (route names, dates, counts that resemble the actual corpus) — for RAG (`rag_service.SYSTEM_PROMPT`, §12) or for summarization (`summary_service.SUMMARY_SYSTEM_PROMPT`/`SUMMARY_COMBINE_SYSTEM_PROMPT`, §18). This caused `llama3.2:3B` to confuse example data with real context in both features, independently, when first tried. Any future prompt (RAG, summarization, or otherwise) must keep examples in an unrelated generic domain.
17. **Summarization (§16–18) has two independent, evidence-based safeguards — don't remove or "simplify" either without re-testing against the 5-document nested-folder case:** `SUMMARY_MAX_CONTEXT_CHARS` (character budget) and `SUMMARY_SINGLE_PASS_MAX_DOCUMENTS` (document-count budget, currently 3). They guard against two *different* failure modes (oversized prompts vs. single-pass detail-merging across many documents) — a large-but-few-documents case and a small-but-many-documents case are both real, independently observed problems, not the same problem twice.
18. **Never compute a combined numeric total in a summarization prompt** unless the source material already states that exact total — `summary_service`'s prompts forbid this after observing `llama3.2:3B` compute an incorrect total (39 instead of 42) when allowed to. Listing individual figures side by side (per date/document) is the correct pattern; if extending or rewriting these prompts, preserve this rule and its worked example.
19. Before assuming a code change isn't taking effect (a new route 404s, old behavior persists), check whether an actually-old process is holding the port (compare `/openapi.json`'s routes against what you expect) — don't assume a `C:\Python312\python.exe` image on that port means stale code by itself; that specific detail has turned out to be a normal, benign artifact of how Windows reports a venv-spawned `uvicorn` worker in most (not all) of the times it's been observed (§4, §19, §26, §33). This recurred a further time in Phase 7 (§31) as a genuine stale-reload case, not the benign artifact — always verify via `/openapi.json`, don't assume either cause.
20. **Tree-fetch/selection state lives in exactly one place: `lib/useDocumentTree.ts`.** Any new workspace page that needs to browse/select a document or folder should call this hook (§24) — this remains true — but **do not assume there's one shared sidebar component to reuse alongside it.** Phase 6's single `DocumentSidebar.tsx` was deliberately split into per-workspace sidebars once Ask/Summaries' scope semantics actually diverged (§24, §25, §27–29) — `AskSidebar.tsx` has an "All Documents" row, `SummariesSidebar.tsx` doesn't, `/documents` uses no sidebar at all anymore. If a new page needs tree browsing, decide honestly whether its scope semantics match an *existing* sidebar exactly before reusing one; if they don't, a new small sidebar component is the established pattern here, not a hack.
21. The live database has more documents in it than the pristine `test-data/NHSRCL-Demo` corpus (§20, §26/§33) — a regression check that expects exactly 42/§13's/§19's numbers may see different numbers for reasons that have nothing to do with your changes. Check what's actually in the DB before concluding a real regression exists.
22. **Reuse `lib/api.ts`'s `ApiError` class for any new endpoint's error handling on the frontend**, rather than inventing a new error-mapping approach — it already carries the HTTP status so a caller can map 404/422/503/other to fixed, user-facing copy (§28). Every error-mapping feature added since Phase 6B (Ask, Summaries, document preview) uses this same class.
23. **Reuse `lib/answerFormatting.ts`'s `parseAnswerBlocks()` for rendering any backend-returned prose** (paragraphs + bullet/numbered lists) rather than writing a second text formatter — it's shared verbatim by Ask's answers, Summaries' results, and document-preview DOCX/TXT text (§28, §29, §31). It is presentation-only by design: it must never add, remove, or reword the underlying text.
24. **Any new `fetch()` call that reads content which can change without changing its URL (a document's file, its processing status, anything keyed by a stable id) must set `cache: "no-store"`**, matching `fetchDocumentTree()` and the Phase 7 preview endpoint (§25, §31). This was found the hard way once already: a missing `cache: "no-store"` silently served a stale cached document preview and also masked a deliberate backend-down test.
25. If a task's provided visual mockup and its own written instructions disagree, **the written instructions win** — this has come up repeatedly (§27–31): Documents' sidebar was intentionally dropped from the redesign despite an earlier mockup implying one; Summaries' sidebar intentionally has no "All Documents" row despite Ask's mockup-derived pattern; Dashboard's Folder Overview shows the tree's *actual* top-level folders even when a reference image showed a different, deeper set. Don't silently follow a mockup's specifics over an explicit textual constraint, and note the deviation and why when it happens.

## 38. Changelog

- **Phase 1:** Foundation — FastAPI + Next.js + Postgres/pgvector + Docker Compose, `/api/health`, env-driven config. Complete.
- **Phase 2:** Files/folders/storage — upload (single/multiple/folder/nested), UUID physical storage + Postgres logical hierarchy, tree UI, deletion, duplicate replacement, path-traversal protection. Complete.
- **Phase 3:** Extraction/chunking/embeddings — PyMuPDF/python-docx/TXT, whitespace-only cleaning, ~1200/~200 chunking, local `all-MiniLM-L6-v2` (384-dim) in pgvector, synchronous pipeline with status tracking. Complete.
- **Phase 4:** RAG Q&A — `POST /api/query`, `all`/`folder`/`document` scope, pgvector cosine retrieval, grounded `llama3.2` via Ollama HTTP, backend-computed deduplicated citations, `AskPanel` UI. Implemented; all specified regression tests pass.
- **Phase 4 source-precision fix (§14–15):** Investigated whether `RAG_TOP_K`/`RAG_SIMILARITY_THRESHOLD` tuning could narrow displayed sources for narrow questions without breaking multi-document retrieval — a threshold sweep (0.20–0.65) proved it could not (no threshold satisfies both Test 1 precision and Test 2 completeness; any threshold high enough to help precision also breaks the maintenance test). Resolved instead via LLM-side evidence selection: retrieval stays unchanged (`TOP_K=8`, `THRESHOLD=0.2`), but each retrieved chunk is labeled with a backend-generated, request-scoped `SOURCE_N` id, and Ollama (via native structured JSON output) returns `{"answer", "supporting_source_ids"}` identifying which labels its answer actually relies on. The LLM can only select from ids it was given — never invent one or supply metadata directly; backend validation (`rag_service._parse_and_validate_llm_output`) discards any unknown id and falls back safely on malformed output. Fixed one prompt pitfall along the way: few-shot examples must not reuse the real document domain's content (§12). All Phase 4 regression tests re-verified, including two 5x reliability runs and adversarial backend-validation unit tests. Frontend unchanged (already handled zero sources). **Phase 4 is now complete.**
- **Phase 5 (§16–19):** Summarization — `POST /api/summarize`, `document`/`folder` scope (`folder` recursive into nested subfolders), reusing Phase 4's `retrieval_service.resolve_scope_document_ids` and Phase 1/4's `ollama_service` rather than new scope/LLM-client logic. Builds a reading-order context from already-indexed chunks (no new extraction/chunking/embedding), summarizes in a single pass by default, falling back to a two-stage map→combine strategy when either an empirically-derived document-count threshold (3) or a character budget (12,000, ~4.4x the real corpus's actual size) is exceeded — both thresholds grounded in real measurements against `test-data/NHSRCL-Demo`, not guessed. Two real numeric-fidelity bugs were found and fixed during implementation, both in `llama3.2:3B`'s handling of numbers during synthesis (distinct from Phase 4's arithmetic issue): (1) inventing an incorrect combined total across documents/dates (39 instead of 42) — fixed by forbidding computed totals in the prompt entirely, with a worked example; (2) merging/mislabeling a single document's own adjacent figures once several other documents' content was also being synthesized in one pass (a source's "6 track + 4 signal" becoming "10 track + 4 signal") — fixed architecturally via the document-count map→combine trigger, not further prompt tuning. No new database tables/migrations; summaries are never persisted or cached. No citations — a deliberate scope decision, not an oversight. Frontend: new `SummaryPanel.tsx` wired into both `DocumentFileDetail`/`DocumentFolderDetail`, replacing the disabled placeholder buttons. All 8 required tests pass (single document, folder, nested folder, scope isolation, numeric preservation, empty scope, Ollama unavailable, Phase 4 regression); `npm run lint`/`npm run build` pass; backend imports/compiles cleanly. **Phase 5 is now complete.**
- **Phase 6 (§26):** Application navigation & UI structure — turned the inert Header nav placeholders into four real Next.js App Router routes (`/`, `/documents`, `/ask`, `/summaries`), each independently loadable, with `Header` hoisted into the root layout (never duplicated per page) and rewritten as a client component using `next/link`/`usePathname` for real navigation and DOM-verified active-link highlighting. Extracted the tree-fetch/selection state that used to live inline in `DocumentExplorer.tsx` into a shared hook (`lib/useDocumentTree.ts`) and extracted its sidebar markup into a shared component (`components/document/DocumentSidebar.tsx`), so `/documents` (full management), `/ask` (Q&A, read-only tree), and `/summaries` (summarization, read-only tree) all reuse the identical fetch/selection logic and tree UI instead of three copies of it — `FolderTree`'s delete-handler props were made optional (backward compatible) to support the read-only usages. `AskPanel`/`SummaryPanel`/`/api/query`/`/api/summarize` were not modified at all; Ask defaults to `{type: "all"}` scope exactly as before, Summaries shows a "select a document or folder" placeholder since summarization has no "all" scope. Dashboard (`/`) dropped the document sidebar per spec and now shows an updated `WelcomePanel` (accurate copy — the old "coming soon" language for Ask/Summaries was stale since both now exist — plus quick-link cards to the three workspaces) and `HealthStatus`. **Zero backend files touched, zero API contract changes, zero database changes** — this was a frontend-only phase, verified by the fact that no file under `backend/` appears in this change. Verified with a real headless-Chrome session (`puppeteer-core` against the existing local Chrome install, used only as a one-off verification tool, not a project dependency): all 4 routes load via both direct navigation and clicking; exactly one nav link active per page at the DOM/`aria-current` level in every case; `/documents` tree/upload UI unchanged; `/ask` answered a real question through the full Phase 4 pipeline; `/summaries` generated a real multi-document summary through the full Phase 5 pipeline; browser back/forward landed on the exact expected URL at every step of an 8-navigation sequence; zero console errors. `npm run lint`/`npm run build` pass (all 4 routes prerender as static). **Phase 6 is now complete.**
- **Phase 6A (§27):** Documents page redesign — replaced the sidebar-tree + single-detail-card layout with a folder-card/grid browser (`FolderCard.tsx`, `FileRow.tsx`, `Breadcrumbs.tsx`, all new), purely local client-side navigation state (`folderPathIds`, `search`) re-resolved against the live tree every render so it self-heals after a delete, a "← Back" control that always goes exactly one level up, and client-side search over the currently-displayed level only. `UploadControls.tsx` gained a `"toolbar"` variant. Frontend-only, zero backend/API/database changes. `npm run lint`/`npm run build` pass. **Phase 6A is now complete.**
- **Phase 6B (§28):** Ask page redesign — a dedicated `AskSidebar.tsx` (FolderTree + a new "All Documents" row, intentionally a separate component from the shared `DocumentSidebar.tsx`), a rewritten `AskPanel.tsx` (empty state with example questions, single loading message, formatted answer via a new `lib/answerFormatting.ts`, `SourceCard.tsx` for citations, fixed error copy via a new `ApiError` class in `lib/api.ts`). Zero RAG backend changes — `rag_service.py`/`retrieval_service.py`/`/api/query` untouched. All Phase 4 scope/hallucination/scope-isolation behavior re-verified live against real Ollama. **Phase 6B is now complete.**
- **Phase 6C (§29):** Summaries page redesign — a dedicated `SummariesSidebar.tsx` (deliberately no "All Documents" row, since summarization has no `all` scope), `SummaryPanel.tsx` rewritten into a full workspace (selection-info card + Generate/Regenerate + result via the same `answerFormatting.ts` from Phase 6B). Zero Phase 5 backend changes. Verified including the existing empty-content path and the 503 Ollama-down path. **Phase 6C is now complete.**
- **Phase 6D (§30):** Dashboard redesign — `WelcomePanel.tsx` deleted, replaced by `DashboardOverview.tsx` plus `OverviewCards.tsx`/`QuickActions.tsx`/`RecentDocuments.tsx`/`FolderOverview.tsx` (new `components/dashboard/` directory), all numbers derived from the real tree/health responses (a new `flattenDocuments()` in `lib/tree.ts` computes status counts and the recent-documents list) — no fabricated statistics anywhere. `UploadControls.tsx` gained a `"cards"` variant; `HealthStatus.tsx` restyled only, same underlying poll. Zero backend changes. Displayed counts independently cross-checked against the real tree response. **Phase 6D is now complete.**
- **Phase 7 (§31):** Document preview — clicking a document on `/documents` now opens a full in-page preview (`DocumentPreview.tsx`, new) instead of a metadata card, backed by one new minimal endpoint, `GET /api/documents/{id}/content`, reusing `extraction_service.extract_document()` unchanged for DOCX/TXT and streaming the raw file (browser-native PDF rendering, no new dependency) for PDF. Zero other backend service touched; zero new dependencies. Verified with a real PDF/DOCX/TXT, a genuinely generated 194-page PDF (no such fixture existed in this DB instance), missing-document and backend-unavailable error paths, and full folder-context preservation on close. Found and fixed a real bug during testing: the preview fetch needed `cache: "no-store"` (now also documented as a standing rule, §37 rule 24) to avoid ever serving a stale cached document. **Phase 7 is now complete.**
- **Later phases:** Not started, not designed. Every planned page-by-page redesign (§27–31) is complete as of this update.

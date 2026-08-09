# DocIntel — Intelligent Document Query & Summarization System

DocIntel is a locally hosted, completely free document intelligence system
being built for NHSRCL. Once complete, it will let users upload files and
folders, browse the resulting document hierarchy, and ask plain-English
questions that are answered from the uploaded documents with citations, plus
generate file- and folder-level summaries — all without any paid API.

## Scope so far

**Phase 1 — Foundation:** FastAPI + PostgreSQL/pgvector + Next.js wired
together, with `GET /api/health` reporting API/database/pgvector/Ollama
status.

**Phase 2 — File & folder management:** upload single files, multiple
files, or entire folders (including nested folders); the backend
reconstructs the logical folder hierarchy, stores files on the local
filesystem, and records metadata in PostgreSQL; the frontend has a real
document explorer (expand/collapse tree, select a file or folder, see its
details, delete it).

**Phase 3 — Document processing, chunking & local embeddings:** every
uploaded PDF/DOCX/TXT is automatically extracted, cleaned, split into
overlapping chunks, embedded locally with Sentence Transformers, and stored
in PostgreSQL via pgvector — no external AI API involved. The document tree
shows each file's processing status (indexed / processing / failed).

**Phase 4 — RAG question answering:** users ask a plain-English
question — optionally scoped to a selected document or folder — and get a
grounded answer plus cited sources. The question is embedded with the same
local model used for chunks, relevant chunks are retrieved from pgvector by
cosine similarity (kept deliberately broad, for multi-document questions),
and a locally running Ollama (`llama3.2`) generates the answer strictly
from that retrieved context, additionally identifying — via backend-issued,
request-scoped `SOURCE_N` labels it can only select from, never invent —
which of the retrieved chunks actually support its answer, so the source
list shown to the user can be narrower than what was retrieved without
narrowing retrieval itself.

**Phase 5 — Summarization:** users select a document or a folder
(including nested subfolders) and click "Generate Summary" to get a
natural-language summary grounded only in that selection's already-indexed
chunks — no new extraction/chunking pipeline, no re-reading files from disk.
A folder's documents are synthesized into one coherent summary (not several
disconnected per-file summaries), reusing the same `llama3.2` model via a
dedicated summarization prompt (distinct from the RAG Q&A prompt). No
citations are attached to summaries — this is a different task from Phase 4
Q&A, and forcing the `SOURCE_N` citation-selection mechanism in here wasn't
worth the complexity for a feature that's meant to give an overview, not
answer a specific question.

**Phase 6 — Application navigation & UI structure (current):** the
top navigation (Dashboard / Documents / Ask / Summaries) is now real
Next.js routing — `/`, `/documents`, `/ask`, `/summaries` — instead of
inert placeholder text, with the active page visually distinct in the
header. Dashboard is a plain overview + system status page; Documents,
Ask, and Summaries are dedicated workspaces that each reuse the same
document-tree/selection logic and UI components (`AskPanel`,
`SummaryPanel`, the folder tree) rather than three separate
implementations. Frontend-only: no backend, API, or database changes.

## Tech stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Frontend   | Next.js, TypeScript, Tailwind CSS         |
| Backend    | Python, FastAPI, SQLAlchemy, Alembic      |
| Database   | PostgreSQL + pgvector                     |
| Storage    | Local filesystem (`storage/documents/`)   |
| Document processing | PyMuPDF (PDF), python-docx (DOCX)|
| Embeddings | Sentence Transformers, `all-MiniLM-L6-v2`, local, 384-dim |
| AI runtime | Ollama (local LLM), `llama3.2` — RAG question answering over retrieved chunks |
| Infra      | Docker Compose (PostgreSQL only)          |

## Project structure

```
docintel/
├── backend/
│   ├── alembic/                # Schema migrations
│   │   └── versions/
│   ├── app/
│   │   ├── api/                  # FastAPI routers: health, documents, folders, query, summarize
│   │   ├── services/
│   │   │   ├── storage_service.py           # physical file I/O (Phase 2)
│   │   │   ├── document_service.py          # folders/documents CRUD, tree (Phase 2)
│   │   │   ├── extraction_service.py        # PDF/DOCX/TXT -> text (Phase 3)
│   │   │   ├── chunking_service.py          # clean + chunk text (Phase 3)
│   │   │   ├── embedding_service.py         # Sentence Transformers (Phase 3 + 4)
│   │   │   ├── document_processing_service.py  # orchestrates the above (Phase 3)
│   │   │   ├── retrieval_service.py         # scope resolution + pgvector search (Phase 4, reused by Phase 5)
│   │   │   ├── rag_service.py               # RAG orchestration + system prompt (Phase 4)
│   │   │   ├── summary_service.py           # summarization orchestration + prompts (Phase 5)
│   │   │   └── ollama_service.py            # health check + answer generation (Phase 1/4/5)
│   │   ├── models/               # SQLAlchemy: Folder, Document, DocumentChunk
│   │   ├── config.py             # Environment-based settings
│   │   ├── db.py                 # SQLAlchemy engine/session + declarative Base
│   │   ├── schemas.py            # Pydantic request/response models
│   │   └── main.py               # App entry point
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env                       # local only, not committed
├── frontend/
│   ├── app/                       # Next.js App Router pages: /, /documents, /ask, /summaries
│   ├── components/
│   │   ├── document/                # DocumentExplorer, DocumentSidebar, FolderTree, DocumentDetail, UploadControls, AskPanel, SummaryPanel
│   │   ├── Header.tsx, HealthStatus.tsx, WelcomePanel.tsx
│   ├── lib/                        # api.ts, format.ts, tree.ts, processingStatus.ts, useDocumentTree.ts
│   └── package.json
├── storage/                      # Uploaded files (local-only, gitignored)
│   └── documents/
├── test-data/
│   └── NHSRCL-Demo/               # Synthetic fictional test dataset (see below)
├── docker-compose.yml             # PostgreSQL + pgvector
├── .env.example
└── README.md
```

## Prerequisites

- Docker Desktop
- Python 3.11+
- Node.js 20+
- [Ollama](https://ollama.com) installed locally, with the `llama3.2` model
  pulled (`ollama pull llama3.2`) — required for question answering
  (Phase 4). The rest of the app (upload, browsing, indexing) still works
  fine without it; `/api/query` just returns a clean 503 until it's running.
- ~500MB free disk for the one-time Sentence Transformers model download,
  plus ~2GB for the `llama3.2` model

## 1. Start PostgreSQL (with pgvector)

From the repository root:

```bash
cp .env.example .env   # first time only
docker compose up -d
```

This starts a `pgvector/pgvector:pg16` container, publishes it on
`localhost:5433` (configurable via `POSTGRES_PORT` in `.env`, default
chosen to avoid clashing with a default local Postgres on 5432), and
persists data in a named Docker volume.

## 2. Start the FastAPI backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp ../.env.example .env       # or create backend/.env — see below
alembic upgrade head           # creates/updates all tables
uvicorn app.main:app --reload --port 8010
```

The backend reads configuration from `backend/.env` (see
[.env.example](.env.example) at the repo root for the variable names:
`DATABASE_URL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `CORS_ORIGINS`,
`STORAGE_ROOT`, `MAX_UPLOAD_SIZE_MB`). Uploaded files are stored under
`<repo_root>/storage/documents/` by default. On startup the backend also
ensures that directory exists.

> **Port 8010, not 8000:** this project's default dev port is 8010 (not
> FastAPI's usual 8000) because 8000 — and, when tried, 8002 — were
> unreliably squatted by other local projects' Docker networking on the
> reference dev machine, the exact same reason Postgres runs on 5433
> instead of 5432 (see above). Adjust freely if 8010 is also taken on your
> machine; just keep `NEXT_PUBLIC_API_URL` (frontend) in sync.
>
> If `--reload` ever seems to silently keep serving old code after an
> edit, it's a sign uvicorn's file-watcher respawned its worker under a
> different Python interpreter than the one you launched with (seen on
> the reference machine). Drop `--reload` and run
> `python -m uvicorn app.main:app --port 8010` directly, restarting by
> hand after changes, to rule it out.

### Schema migrations

Schema changes are managed with Alembic (`backend/alembic/`). To apply the
latest schema: `alembic upgrade head`. When models change in a future
phase: `alembic revision --autogenerate -m "..."` then `alembic upgrade head`.

## 3. Start the Next.js frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local`
(defaults to `http://localhost:8010`). Visit `http://localhost:3000`.

## 4. Configure Ollama

Install [Ollama](https://ollama.com), then pull the model this project uses:

```bash
ollama pull llama3.2
```

Ollama runs locally as its own process (not containerized) and is expected
at `OLLAMA_BASE_URL` (default `http://localhost:11434`), using the model
named in `OLLAMA_MODEL` (default `llama3.2`) — never hardcoded elsewhere in
the code. If it isn't running, the health endpoint reports
`ollama: unavailable` and `POST /api/query` returns a clean
`503 "AI model is currently unavailable."` — everything else (upload,
browsing, indexing, deleting) keeps working regardless.

## 5. Verify the health endpoint

```bash
curl http://localhost:8010/api/health
```

Expected response once everything is running:

```json
{
  "api": "ok",
  "database": "ok",
  "pgvector": "ok",
  "ollama": "ok"
}
```

If Ollama isn't running, `ollama` will read `"unavailable"` instead — the
API, database, and pgvector checks are independent of it. The frontend
dashboard shows the same information under **System Status**, visible
whenever nothing is selected in the document tree.

## Documents & folders (Phase 2)

### Supported file types

`.pdf`, `.docx`, `.txt` only — anything else is rejected per-file with a
clear error.

### API

| Method | Path                     | Purpose |
|--------|--------------------------|---------|
| GET    | `/api/health`            | API/database/pgvector/Ollama status |
| POST   | `/api/documents/upload`  | Upload one or more files (single, multiple, or a whole folder); processes each synchronously (see below) |
| GET    | `/api/documents/tree`    | Full folder/document hierarchy, including each document's processing status |
| DELETE | `/api/documents/{id}`    | Delete one document (DB row + physical file + its chunks) |
| DELETE | `/api/folders/{id}`      | Delete a folder and everything inside it, recursively (subfolders, documents, chunks) |

`POST /api/documents/upload` expects multipart form data with two parallel
fields: `files` (the file blobs) and `paths` (one string per file, in the
same order) giving that file's logical path relative to the upload root —
e.g. `January.pdf` for a flat upload, or `NHSRCL/Reports/2026/January.pdf`
for a folder upload. Missing intermediate folders are created
automatically. The response reports each file's outcome individually
(`created` / `replaced` / `error`, plus `processing_status` /
`processing_error`) — one bad file never fails the whole batch.

### Duplicate uploads

Uploading the same logical path again (same folder + filename) **replaces**
the existing document: its physical file is swapped, its metadata updated
in place, and it is fully reprocessed (old chunks/embeddings deleted, new
ones generated) — keeping the same document ID throughout.

### Storage layout

Physical files live under `storage/documents/` using a server-generated
UUID filename (e.g. `3f9a1c2e....pdf`) — never the user-supplied name or
path. The logical folder hierarchy the user actually sees lives entirely in
PostgreSQL (`folders.path`, `documents.name`/`folder_id`). This sidesteps
path-traversal risk entirely for storage I/O and avoids on-disk filename
collisions between same-named files in different folders.

## Document processing & local embeddings (Phase 3)

Every successfully uploaded file is processed **synchronously**, as part of
the same upload request (no background job queue — this is a small local
demo, so simplicity wins):

```
Stored file -> extract text -> clean -> chunk (~1200 chars, ~200 overlap)
            -> embed locally (Sentence Transformers) -> store in pgvector
            -> document marked "indexed" (or "failed" with a reason)
```

- **Extraction** (`extraction_service.py`): PDF via PyMuPDF, page-by-page
  (empty pages skipped, page numbers preserved). DOCX via python-docx —
  python-docx has no reliable page boundaries, so DOCX/TXT chunks always
  have `page_number: null` rather than a fabricated number.
- **Cleaning** (`chunking_service.clean_text`): whitespace normalization
  only — numbers, dates, names, and punctuation are never touched, since
  later phases need those intact (e.g. "how many trains ran ... from 6 Aug
  to 30 Aug?").
- **Chunking** (`chunking_service.chunk_pages`): packs paragraphs into
  ~1200-character blocks without splitting words, then carries ~200
  characters of trailing context from each block into the next
  (overlap). `chunk_index` is sequential per document; `page_number`
  (PDFs only) is preserved per chunk.
- **Embeddings** (`embedding_service.py`): [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2),
  384 dimensions, loaded once per process and reused for every chunk.
  **Runs entirely on-device — no API key, no external embedding service.**
  The model downloads once (~90MB) from Hugging Face on first use and is
  cached under `~/.cache/huggingface/`; every embedding call after that
  runs locally against the cached weights.

### `document_chunks` table

```
id | document_id (FK, ON DELETE CASCADE) | page_number (nullable)
   | chunk_index | content | embedding VECTOR(384) | created_at
```

No HNSW/vector index was added — at this project's scale (a handful of
demo documents, low hundreds of chunks), pgvector's exact brute-force scan
is already fast, and adding an index "just in case" would be premature
optimization for a two-day local demo. This can be revisited if Phase 4's
real usage shows it's actually needed.

### Processing status

Each document has `processing_status` (`pending` / `processing` /
`indexed` / `failed`) and an optional `processing_error`, both visible in
`GET /api/documents/tree` and shown in the frontend (a small icon next to
each file in the tree, and a full status line in the detail panel). A
processing failure (e.g. a corrupt PDF) never crashes the API or blocks the
upload — the file is still stored, just marked `failed` with a diagnostic
message.

### Synthetic test dataset

`test-data/NHSRCL-Demo/` contains a small set of **entirely fictional**
NHSRCL-style documents (daily operations PDFs with train counts per route,
a DOCX safety report, a TXT project overview) used to exercise and verify
the processing (Phase 3) and retrieval/Q&A (Phase 4) pipelines end-to-end.
None of it is real NHSRCL data.

## Question answering (Phase 4)

### API

```
POST /api/query
{ "question": "What were the major causes of delay?",
  "scope": { "type": "all" } }                              // or:
  "scope": { "type": "folder", "id": 12 }                    // folder + all nested subfolders
  "scope": { "type": "document", "id": 47 }                  // one document only
```

Response:

```json
{
  "answer": "…grounded answer…",
  "sources": [{ "document_id": 15, "document_name": "August_06_Report.pdf", "page_number": 1 }],
  "chunks_retrieved": 6
}
```

`question` must be non-empty (after trimming) and at most
`RAG_MAX_QUESTION_LENGTH` characters (default 2000) — both enforced by a
Pydantic validator, returning `422` with a clear message. An unknown
`document`/`folder` id in `scope` returns `404`. An unreachable Ollama
returns `503` with `"AI model is currently unavailable."` — never a raw
stack trace.

### Pipeline

```
question -> embed (embedding_service, same 384-dim MiniLM model as chunks)
         -> resolve scope to a document-id set (retrieval_service)
         -> pgvector cosine-similarity search, top RAG_TOP_K, indexed docs only
         -> drop chunks below RAG_SIMILARITY_THRESHOLD
         -> build "SOURCE_N / Document / Page / text" context (rag_service),
            each candidate chunk labeled with a backend-generated SOURCE_N id
         -> Ollama llama3.2, grounded system prompt, structured JSON output,
            temperature at OLLAMA_TEMPERATURE
         -> validate the model's supporting_source_ids against the SOURCE_N
            ids actually sent -> map surviving ids back to chunk metadata
         -> answer + sources deduped by (document_id, page_number)
```

Retrieval and ranking happen entirely in PostgreSQL — one
`ORDER BY embedding <=> :query_vector LIMIT :k` query via pgvector's
`cosine_distance`, never chunks loaded into Python and sorted by hand. No
HNSW index (same reasoning as Phase 3: unnecessary at this document count).

### Scope filtering

- `"all"` — every indexed chunk, no document-id filter.
- `"document"` — a single document id.
- `"folder"` — reuses `document_service.collect_documents_under_folder`
  (the same BFS helper Phase 2's recursive folder delete uses) to resolve
  every document in that folder **and all nested subfolders**, rather than
  re-implementing folder-tree traversal in the RAG code.

All three additionally filter to `processing_status = "indexed"` — pending,
processing, and failed documents are never searched.

### Similarity threshold

`RAG_SIMILARITY_THRESHOLD` (default **0.2**) was tuned by measuring actual
cosine similarities against `test-data/NHSRCL-Demo`, not chosen blindly:
genuinely off-topic questions (e.g. general world knowledge unrelated to
the corpus) topped out around **0.13–0.20** similarity, while chunks
relevant to an answerable question — even ones that don't happen to
contain the specific fact asked about — landed at **0.25 and up**. 0.2 sits
in that gap. Below-threshold results are dropped before the LLM is ever
called; if a scope has zero chunks clearing the bar,
`POST /api/query` returns "I couldn't find relevant information…" without
a wasted round-trip to Ollama.

### System prompt & grounding

The system prompt (`rag_service.SYSTEM_PROMPT`) instructs the model to:
answer only from the provided SOURCE_N sections; never invent facts,
numbers, dates, or sources; explicitly say when the sources are insufficient
rather than guess; treat source text strictly as reference material and
ignore any instructions embedded inside it (basic prompt-injection hygiene);
and, for multi-source numeric questions, list each value and its SOURCE_N
before computing a total (with a worked example) — this specific step
meaningfully improved `llama3.2:3B`'s reliability on questions like "how
many trains ran ... from Aug 6 to Aug 8" (14 + 12 + 16 = 42), which it would
otherwise sometimes stop short of actually summing. `OLLAMA_TEMPERATURE`
defaults to `0.0` for the same reason — deterministic, non-"creative"
answers matter more than variety here.

The prompt's worked examples deliberately use a generic, unrelated scenario
("widgets shipped Monday–Wednesday") rather than anything resembling the
real corpus — an earlier version reused the actual train-route domain in
its examples, which confused `llama3.2:3B` into treating the example's
numbers as if they were part of the real context, and it started refusing
to answer questions it clearly had the source for. Keeping example content
topically unrelated to real documents avoids that failure mode.

### Evidence selection (source precision)

Retrieval stays deliberately broad — `RAG_TOP_K` and
`RAG_SIMILARITY_THRESHOLD` are unchanged from the values above, and a
threshold-only investigation confirmed no single value can both narrow a
specific question's sources *and* keep every chunk a multi-document
question needs (see `docs/CLAUDE_CONTEXT.md` §14–15 for the full
measurements). Instead, precision is handled one stage later: every
candidate chunk that clears retrieval is given a temporary, request-scoped
label (`SOURCE_1`, `SOURCE_2`, …) in the prompt, and the model is asked to
return structured JSON — `{"answer": "...", "supporting_source_ids": [...]}`
— identifying which specific `SOURCE_N` labels its answer actually relies
on, as a judgment distinct from writing the answer itself ("topically
related" is explicitly not the same as "directly supports this answer" in
the system prompt). This uses Ollama's native structured-output support
(the `/api/generate` `format` field as a JSON schema, supported since
Ollama 0.5+) rather than a parsing library — the schema constrains
generation itself, so the response is reliably valid JSON.

Retrieval is never narrowed to achieve this — a narrow question still
retrieves and sends every topically-similar chunk to the model, it's the
*display* of sources that becomes precise, not the search.

### Citations

The LLM is treated as untrusted input for anything citation-shaped. It may
only *select* from the `SOURCE_N` labels the backend handed it in that
request — it can never invent a label, and it can never supply a document
name, page number, or id directly (the JSON schema only accepts a list of
strings for `supporting_source_ids`, so an attempt to smuggle structured
metadata there fails Pydantic validation, not silent coercion). Backend
validation (`rag_service._parse_and_validate_llm_output`) checks every
returned id against the ids actually sent for that request; any unknown id
is discarded and logged, while the rest of the (valid) selection is kept —
chosen over rejecting the whole selection because it doesn't throw away an
otherwise-correct answer's citations over one bad id. Malformed JSON or a
missing/empty `answer` field falls back to a safe canned message with zero
sources rather than crashing the request or leaking a raw parse error.

Once validated, sources are built entirely from database metadata in
`rag_service.py` — **never** parsed out of the LLM's own text — from the
*selected* chunks only, deduplicated by `(document_id, page_number)` (so
several chunks from the same PDF page collapse to one source card; DOCX/TXT,
which always have `page_number = null`, collapse to one card per document).
`chunks_retrieved` in the API response still reflects the retrieval stage
(how many chunks cleared the similarity threshold and were sent to the
model) — it is not redefined to mean "sources selected"; the (usually
smaller) selected-and-deduped set is what appears in `sources`.

### Configuration

All new settings live in `Settings` (`app/config.py`), not hardcoded:
`RAG_TOP_K` (default 8), `RAG_SIMILARITY_THRESHOLD` (0.2),
`RAG_MAX_QUESTION_LENGTH` (2000), `OLLAMA_TIMEOUT_SECONDS` (60),
`OLLAMA_TEMPERATURE` (0.0).

## Summarization (Phase 5)

### API

```
POST /api/summarize
{ "scope": { "type": "document", "id": 15 } }   // or:
  "scope": { "type": "folder", "id": 3 }        // folder + all nested subfolders
```

`scope` reuses Phase 4's `QueryScope` schema as-is (same `{type, id}` shape,
same Pydantic validation requiring `id` for these types) rather than
introducing a parallel scope schema — `"all"` is structurally accepted by
that shared schema but is explicitly rejected by the summarization service
with a `422`, since summarization always targets one specific selection,
never the whole corpus.

Response:

```json
{
  "summary": "…generated summary…",
  "documents_included": 3,
  "chunks_used": 6
}
```

No `SOURCE_N` identifiers, chunk ids, or other internal metadata are
exposed — just the summary text and two small counts. Errors: `422` invalid
scope (`"all"`, or missing `id` for `"document"`/`"folder"`), `404` unknown
document/folder id, `503` Ollama unavailable, `500` unexpected.

### Pipeline

```
scope (document or folder) -> resolve to a document-id set
    (retrieval_service.resolve_scope_document_ids, reused unchanged from
    Phase 4 -- folder scope includes all nested subfolders, "indexed"-only)
  -> load already-indexed DocumentChunk rows for those documents
    (no new extraction/chunking/embedding pipeline -- Phase 3 already
    produced these)
  -> build a reading-order context: "DOCUMENT N / Name / SOURCE_CHUNK_N /
    Page / text" per document, chunks ordered by chunk_index (not
    similarity rank -- there's no question to rank against)
  -> Ollama llama3.2 via ollama_service.generate_answer (the existing
    plain-text primitive -- no structured JSON needed, unlike Phase 4 Q&A)
  -> summary text
```

Router (`app/api/summarize.py`) stays thin; all logic is in
`summary_service.py`, mirroring `query.py` / `rag_service.py`'s
relationship. No new database tables or migrations — summaries are
generated fresh on every request and exist only in the HTTP response and,
client-side, in `SummaryPanel`'s component state for the current session
(never persisted, never cached, matching the Phase 5 spec).

### Document vs. folder scope

- `"document"` — every chunk belonging to that one document.
- `"folder"` — reuses `document_service.collect_documents_under_folder`
  (via the same `retrieval_service.resolve_scope_document_ids` helper
  Phase 4 uses) to resolve every document in the folder **and all nested
  subfolders**, then loads every chunk belonging to any of them. No
  separate folder-traversal logic exists for summarization.

Both scopes additionally filter to `processing_status = "indexed"` — a
document still processing, failed, or a folder containing only such
documents summarizes to a clear "nothing indexed yet" message
(`summary_service.NO_INDEXED_CONTENT_MESSAGE`) without ever calling Ollama.
An empty folder (no documents at all) short-circuits the same way.

### Context-size strategy

Chosen only after measuring the actual dataset, not assumed: the entire
`test-data/NHSRCL-Demo` corpus (5 documents, 8 chunks) is **~2,700
characters total** — comfortably inside a single prompt. So the default
path is the simplest one: build one context block from all the scope's
chunks, send one summarization prompt, done.

Two independent, evidence-based triggers fall back to a two-stage
map → combine strategy instead of one oversized/overloaded prompt:

1. **`SUMMARY_MAX_CONTEXT_CHARS`** (default 12,000 characters) — a hard
   size budget. Real corpus is ~2,700 chars, so this leaves generous
   headroom while still protecting against a genuinely large future upload.
2. **`SUMMARY_SINGLE_PASS_MAX_DOCUMENTS`** (default 3) — found empirically,
   not guessed: testing `llama3.2:3B` on this project's own corpus, a
   3-document single-pass folder summary (`Operations`) was reliable across
   repeated runs, but a 5-document single-pass summary (`NHSRCL-Demo`,
   nested) occasionally merged/mislabeled a single document's own numbers —
   e.g. a source stating "6 track inspections and 4 signal inspections"
   came back as "10 track inspections and 4 signal inspections" once the
   model also had four other documents' worth of dense figures to
   synthesize into one summary in a single pass. Routing anything above 3
   documents through map → combine instead — summarizing each document
   individually first (verified reliable in isolation) and combining those
   short, already-correct summaries afterward — eliminated the error across
   repeated runs.

When either trigger fires, `summary_service._generate_map_reduce`
summarizes each document individually (with `SUMMARY_SYSTEM_PROMPT`, the
same prompt as the single-pass path), then combines the resulting short
summaries with a second, distinct prompt (`SUMMARY_COMBINE_SYSTEM_PROMPT`).
If even one document's own content exceeds the character budget on its own
(not reachable with the current test corpus), its chunks are
deterministically truncated in `chunk_index` order — kept until the budget
fills, tail dropped — and the resulting mini-summary is flagged with a
short "(Note: ... truncated ...)" suffix so truncation is never silent.
This is exactly two stages, not a general recursive/hierarchical framework —
chosen because it's the simplest approach that still lets the model
reconcile facts across every document.

`SUMMARY_NUM_CTX` (default 8192) is passed as Ollama's `num_ctx` option on
summarization calls only (never on Phase 4's RAG calls, which are
untouched) — set explicitly rather than relying on Ollama's undocumented
default context window, since summarization prompts can legitimately be
longer than a single RAG question.

### Summarization prompt

`summary_service.SUMMARY_SYSTEM_PROMPT` and `SUMMARY_COMBINE_SYSTEM_PROMPT`
are dedicated prompts, not a reuse of `rag_service.SYSTEM_PROMPT` —
summarizing has no question to ground an answer against and no citation
selection, so it's a genuinely different task with different failure modes
to guard against. Both instruct the model to: treat the supplied content as
its only source of truth; never invent facts, numbers, dates, or names;
preserve important figures exactly as given; synthesize across documents
rather than writing disconnected per-document summaries; and say so plainly
if the content is too sparse to summarize meaningfully, rather than
inventing filler.

**A specific failure mode was found and fixed during testing:** early
prompt versions allowed the model to compute a combined total across
documents/dates (e.g. summing daily counts into a multi-day total). Testing
showed `llama3.2:3B` sometimes computed this arithmetic incorrectly
(observed: 14 + 12 + 16 miscalculated as 39 in one run) — a real numeric
hallucination distinct from Phase 4's issue, since here nothing prompted
double-checking the arithmetic. Both prompts now explicitly forbid
computing any combined total (an accompanying worked example makes the
required pattern concrete — list each date/document's own figure side by
side, e.g. "5 on Monday, 7 on Tuesday, 3 on Wednesday", never "15 total"),
and only state a total if the source material already states that exact
total itself. Per the lesson learned in Phase 4 (§ system prompt above),
this worked example deliberately uses a generic, unrelated domain rather
than anything resembling the real train-report corpus.

### What was deliberately left out

No citations/`SOURCE_N` selection (different task from Q&A, not worth the
added complexity here — see rules above), no caching (every click
regenerates), no persistence to Postgres (no new tables/migrations — a
summary lives only in the response and the frontend's component state for
that session), no background workers/queues (synchronous, same as every
other pipeline in this project).

## Notes

- No paid API is used anywhere in this project. Embeddings, question
  answering, and summarization all run 100% locally (Sentence Transformers
  + Ollama) after their one-time model downloads.

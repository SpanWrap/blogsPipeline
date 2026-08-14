# Architecture

## Overview

This repository hosts a **standalone Blog Content Pipeline** that researches topics, generates source-backed blog posts, requires human approval, and publishes approved content to the Spanwrap website via HTTP API only.

The existing Next.js marketing app remains untouched. The pipeline is a TypeScript Node.js system with a CLI, optional HTTP API routes, file-based storage, and pluggable providers.

## Design principles

1. **Make it work** — smallest complete end-to-end path.
2. **Separation of concerns** — stages, providers, storage, and publishing are isolated.
3. **Never auto-publish** — explicit human approve → publish state machine.
4. **Replaceable providers** — research, LLM, and publisher are interfaces.
5. **No secrets in logs or frontend** — API keys stay server-side via env vars.

## Project structure

```
src/
  config/           # Environment & pipeline defaults
  models/           # Domain types & Zod schemas
  providers/
    research/       # Web search, direct URL, mock
    llm/            # OpenAI-compatible + mock
    publishing/     # Spanwrap HTTP publisher + mock
  services/         # Storage, extraction, logging
  utils/            # Retry, slug, URL, idempotency
  pipeline/
    orchestrator.ts
    state.ts
    stages/         # research → publish stages
  cli/              # blog-pipeline CLI
  app/api/pipeline/ # Optional REST API (Next.js)
prompts/            # Versioned prompt templates
docs/               # Architecture & ops docs
tests/              # Unit + integration + e2e
.data/              # Local JSON run store (gitignored)
```

## Pipeline architecture

```
Content Brief
    → Research (discover URLs + rank)
    → Extraction (fetch + article extract)
    → Normalization (clean text, dedupe)
    → Analysis (source-backed claims)
    → Outline (human-editable)
    → Generation (full article)
    → Quality (content / sources / SEO flags)
    → Human Review (approve | reject)
    → Publish (SpanwrapPublisher)
```

Stages are independently executable via CLI (`blog-pipeline research <id>`) or REST (`POST /api/pipeline/:id/research`).

## Major components

| Component | Responsibility |
|-----------|----------------|
| **Orchestrator** | State machine, stage sequencing, observability records |
| **Research providers** | Discover sources without hard-coding one search vendor |
| **Extraction service** | Fetch pages, strip chrome, keep structure |
| **LLM provider** | Structured + text generation with swappable backends |
| **Quality stage** | Flag issues; never silently rewrite article body |
| **Storage** | Persist every artifact per pipeline run |
| **Publisher** | Map internal blog → Spanwrap payload; idempotent POST |

## Data flow

1. CLI/API creates a **PipelineRun** with status `CREATED` and a content brief.
2. Research stage writes ranked **sources** (id, url, title, content, relevance).
3. Analysis stage writes **claims** each referencing `sourceIds` only (no invented citations).
4. Outline is stored separately from the article and may be edited.
5. Generation consumes brief + outline + research + claims.
6. Quality returns structured `{ passed, score, issues[] }` without mutating content.
7. Review transitions to `APPROVED` or stays `REVIEW_REQUIRED` / moves to failure states.
8. Publish uses `idempotencyKey` so retries do not create duplicate Spanwrap posts.

## State machine

```
CREATED → RESEARCHING → RESEARCH_COMPLETE → OUTLINE_READY
  → GENERATING → DRAFT_READY → QUALITY_CHECK → REVIEW_REQUIRED
  → APPROVED → PUBLISHED

Failure: FAILED | CANCELLED | PUBLISH_FAILED (retryable from APPROVED)
```

## Storage

**JSON file store** under `.data/runs/<id>.json` for v1.

Rationale: no external DB to operate, easy inspection during human review, sufficient for single-operator local runs. Each file holds brief, sources, analysis, outline, article, quality, stage timings, publish result, and status.

## External services

| Service | Purpose | Config |
|---------|---------|--------|
| LLM (OpenAI-compatible) | Analysis, outline, generation | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` |
| Web search (Serper / Tavily / mock) | Source discovery | `SERPER_API_KEY` or `TAVILY_API_KEY` |
| Target websites | Content fetch (robots.txt respected) | — |
| Spanwrap Blog API | Final publish | `SPANWRAP_API_URL`, `SPANWRAP_API_KEY` |

When keys are absent, **mock providers** enable offline development and CI.

## Technology choices

| Choice | Why |
|--------|-----|
| **TypeScript** | Matches repo; strict types for pipeline artifacts |
| **Zod** | Runtime validation of briefs, outlines, articles, quality |
| **Commander** | Simple CLI without a heavy framework |
| **Cheerio** | Reliable server-side HTML → article text |
| **robots-parser** | Honor robots.txt before fetch |
| **Vitest** | Fast unit/integration tests with mocks |
| **File storage** | Zero-ops v1 persistence |
| **Pluggable providers** | Swap search/LLM/publish without rewriting stages |
| **Next.js API routes (optional)** | Same repo process model when an HTTP surface helps |

## Extensibility (not implemented)

```
ContentPipeline
├── BlogPipeline   ← implemented
├── PodcastPipeline
└── SocialPipeline
```

Shared building blocks (research, extraction, LLM, quality, publishing interfaces) stay generic; blog-specific outline/generation/SEO stay in blog stages.

## Security boundary

- Secrets only via environment variables.
- No credentials in pipeline run JSON.
- Scraped HTML is never executed.
- Content sanitized before publish payload assembly.
- Spanwrap field mapping isolated inside `SpanwrapPublisher`.

# Architecture

## Overview

This package is the **standalone Blog Content Pipeline**. It researches topics, generates source-backed blog posts, requires human approval, and publishes approved content to the Spanwrap website via HTTP only.

It has **no dependency on the Spanwrap website codebase or build**. The only coupling is an optional HTTP `POST` to the configured Spanwrap Blog API when publishing.

## Design principles

1. **Make it work** — smallest complete end-to-end path.
2. **Separation of concerns** — stages, providers, storage, and publishing are isolated.
3. **Never auto-publish** — explicit human approve → publish state machine.
4. **Replaceable providers** — research, LLM, and publisher are interfaces.
5. **No secrets in logs** — API keys stay server-side via env vars.

## Project structure

```
pipeline/
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
    prompts/          # Versioned prompt templates
  docs/
  tests/
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
    → Publish (SpanwrapPublisher → HTTP POST)
```

Stages are independently executable via CLI.

## State machine

```
CREATED → RESEARCHING → RESEARCH_COMPLETE → OUTLINE_READY
  → GENERATING → DRAFT_READY → QUALITY_CHECK → REVIEW_REQUIRED
  → APPROVED → PUBLISHED

Failure: FAILED | CANCELLED | PUBLISH_FAILED (retryable from APPROVED)
```

## Storage

JSON file store under `.data/runs/<id>.json`.

## External services

| Service | Purpose | Config |
|---------|---------|--------|
| LLM (OpenAI-compatible) | Analysis, outline, generation | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` |
| Web search (Serper / Tavily / mock) | Source discovery | `SERPER_API_KEY` or `TAVILY_API_KEY` |
| Target websites | Content fetch (robots.txt respected) | — |
| Spanwrap Blog API | Final publish (HTTP only) | `SPANWRAP_API_URL`, `SPANWRAP_API_KEY` |

When keys are absent, mock providers enable offline development and CI.

## Technology choices

| Choice | Why |
|--------|-----|
| **TypeScript / Node** | Typed artifacts; no Next.js coupling |
| **Zod** | Runtime validation |
| **Commander** | Simple CLI |
| **Cheerio** | HTML → article text |
| **robots-parser** | Honor robots.txt |
| **Vitest** | Tests with mocks |
| **File storage** | Zero-ops v1 persistence |
| **Pluggable providers** | Swap search/LLM/publish without rewriting stages |

## Security boundary

- Secrets only via environment variables.
- Scraped HTML is never executed.
- Content sanitized before publish payload assembly.
- Spanwrap field mapping isolated inside `SpanwrapPublisher`.

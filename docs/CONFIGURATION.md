# Configuration

Environment variables (see `.env.example`):

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPELINE_DATA_DIR` | `.data` | JSON run storage root |
| `REQUEST_TIMEOUT_MS` | `30000` | HTTP timeout for fetch/LLM/publish |
| `MAX_SOURCES` | `8` | Max research sources retained |
| `MAX_FETCH_CONCURRENCY` | `2` | Parallel page fetches |
| `PIPELINE_USER_AGENT` | SpanwrapBlogPipeline/... | User-Agent for research fetches |
| `RESPECT_ROBOTS_TXT` | `true` | Honor robots.txt |
| `ALLOW_PRIVATE_URLS` | unset | Set `1` only in tests for localhost |

## Research

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEARCH_PROVIDER` | `auto` | `auto` \| `serper` \| `tavily` \| `mock` |
| `SERPER_API_KEY` | — | Serper.dev API key |
| `TAVILY_API_KEY` | — | Tavily API key |

`auto` picks Serper if key present, else Tavily, else mock.

## LLM

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `auto` | `auto` \| `openai` \| `mock` |
| `LLM_API_KEY` / `OPENAI_API_KEY` | — | API key |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `gpt-4o-mini` | Model name |

`auto` uses OpenAI-compatible when a key exists, else mock.

## Spanwrap publishing

| Variable | Default | Description |
|----------|---------|-------------|
| `SPANWRAP_API_URL` | `http://localhost:4000` | Base URL |
| `SPANWRAP_API_KEY` | — | Bearer token (required for real publish) |
| `SPANWRAP_BLOGS_PATH` | `/api/blogs` | Create-blog path |
| `PUBLISHER` | auto | Set `mock` to force mock publisher |

Without `SPANWRAP_API_KEY`, the mock publisher is used (CI/local).

## Retries

| Variable | Default |
|----------|---------|
| `RETRY_MAX_ATTEMPTS` | `3` |
| `RETRY_BASE_DELAY_MS` | `500` |

Transient: timeouts, 429, 5xx. Permanent: 401/403/404/invalid input (no endless retries).

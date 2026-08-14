# Configuration

Environment variables (see `.env.example`):

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_BACKEND` | `file` | `file` or `mongodb` |
| `PIPELINE_DATA_DIR` | `.data` | JSON run storage root (file backend) |
| `MONGODB_URI` | — | Required when `STORAGE_BACKEND=mongodb` |
| `MONGODB_DB` | `spanwrap_pipeline` | Mongo database name |
| `MONGODB_COLLECTION` | `pipeline_runs` | Mongo collection |
| `UI_HOST` | `127.0.0.1` | Review UI bind host |
| `UI_PORT` | `8787` | Review UI port |
| `TRENDS_SOURCES` | `hackernews,reddit` | Comma list: `hackernews`, `reddit`, `devto`, `mock` |
| `TRENDS_REDDIT_SUBREDDITS` | technology,programming,… | Subreddits for Reddit hot feed |
| `TRENDS_LIMIT` | `12` | Max ranked recommendations kept |
| `TRENDS_CACHE_TTL_MINUTES` | `60` | Soft expiry metadata on recommendations |
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
| `LLM_PROVIDER` | `auto` | `auto` \| `groq` \| `openai` \| `mock` |
| `GROQ_API_KEY` | — | Groq API key (preferred) |
| `LLM_API_KEY` / `OPENAI_API_KEY` | — | Alternatives accepted by the same client |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL (Groq default) |
| `LLM_MODEL` | `llama-3.3-70b-versatile` | Chat model id |

Default stack is **Groq**. Set `GROQ_API_KEY` from https://console.groq.com/keys.

`auto` uses Groq/OpenAI-compatible client when any of the keys above is set; otherwise mock.

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

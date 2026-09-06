# Configuration

Environment variables (see `.env.example`):

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_BACKEND` | `file` | `file`, `mongodb`, or `s3`. On Vercel, `file` is coerced to `mongodb`. |
| `PIPELINE_DATA_DIR` | `.data` | Local JSON root when `STORAGE_BACKEND=file` |
| `MONGODB_URI` | — | Required when `STORAGE_BACKEND=mongodb` |
| `MONGODB_DB` | `spanwrap_pipeline` | Mongo database name |
| `MONGODB_COLLECTION` | `pipeline_runs` | Mongo collection |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Required when `STORAGE_BACKEND=s3` |
| `AWS_S3_BUCKET` | — | S3 bucket name |
| `AWS_REGION` | `eu-north-1` | S3 region |
| `AWS_S3_PREFIX` | `pipeline` | Key prefix inside the bucket |
| `AUTH_SECRET` | — | Required with S3 (and Vercel); HMAC / Auth.js secret |
| `UI_HOST` | `127.0.0.1` | Review UI bind host |
| `UI_PORT` | `8787` | Review UI port |
| `TRENDS_SOURCES` | `hackernews,reddit` | Comma list: `hackernews`, `reddit`, `devto`, `github`, `x`, `arxiv`, `huggingface`, `lobsters`, `news`, `mock` |
| `TRENDS_REDDIT_SUBREDDITS` | technology,programming,… | Subreddits for Reddit topic discovery (`/top`) |
| `TRENDS_DIGEST_REDDIT_SUBREDDITS` | artificial,MachineLearning,… | Subreddits for the digest (`/r/{sub}/top/`) |
| `TRENDS_GITHUB_TOPICS` | ai,machine-learning,… | Keywords/topics for GitHub Search |
| `TRENDS_GITHUB_SOURCE` | `trending` | `trending` (`github.com/trending` stars today), `search` (new repos `created:>`), or `both` |
| `TRENDS_GITHUB_DAYS` | `7` | Date window for Search (`created:>` / `pushed:>`) |
| `TRENDS_GITHUB_LANGUAGE` | — | Optional Search `language:` filter |
| `TRENDS_DIGEST_LIMIT` | `8` | Max digest items per source |
| `GITHUB_TOKEN` | — | Optional; 5000 req/hr vs 60 unauthenticated. Search is also 30 req/min |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | — | OAuth script app for `oauth.reddit.com/r/{sub}/top` |
| `X_BEARER_TOKEN` / `TWITTER_BEARER_TOKEN` | — | Twitter API v2 bearer for daily X posts |
| `TRENDS_LIMIT` | `12` | Max ranked topic recommendations kept |
| `TRENDS_CACHE_TTL_MINUTES` | `60` | In-memory digest cache TTL |
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
| `LLM_PROVIDER` | `auto` | `auto` \| `groq` \| `openai` \| `gemini` \| `anthropic` \| `mock` |
| `GROQ_API_KEY` | — | Groq API key (preferred free default) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | — | Keys for other providers |
| `LLM_API_KEY` | — | Alias accepted by the Groq/OpenAI-compatible client |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL (Groq default) |
| `LLM_MODEL` | `openai/gpt-oss-20b` | Chat model (`llama-3.3-70b-versatile` was retired 2026-08-16) |

Default stack is **Groq**. Set `GROQ_API_KEY` from https://console.groq.com/keys, or pick a provider and paste a key in the review UI **LLM** panel.

`auto` uses Groq/OpenAI-compatible client when any of the keys above is set; otherwise mock. Retired Groq model IDs are remapped to `openai/gpt-oss-20b`.

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

## Review UI authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_USERNAME` | — | Optional. Creates the first account on boot if no users exist |
| `AUTH_PASSWORD` | — | Password for `AUTH_USERNAME` (min 8 characters) |
| `AUTH_SECRET` | generated locally | HMAC secret for session cookies. **Required on Vercel** |
| `AUTH_SESSION_DAYS` | `7` | Signed-cookie lifetime |

The review UI is login-gated. Users are stored in `.data/users.json` (file backend) or Mongo `auth_users`. Activity is in `.data/activity-log.json` or Mongo `activity_logs`. The CLI is not gated.

Locally, if `AUTH_SECRET` is unset, a secret is written to `.data/auth-secret`. On Vercel set `AUTH_SECRET` to a long random string so sessions survive cold starts.

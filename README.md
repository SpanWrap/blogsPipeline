# Spanwrap Blog Pipeline

Standalone research → generation → human review → publish pipeline.

This project has **zero dependency on the Spanwrap website codebase**. It only communicates by sending an HTTP `POST` to the configured Spanwrap Blog API when an approved post is published.

## Pipeline flow

```
Trend Discovery (HN, Reddit, GitHub, X, arXiv, HF, tech press)
  → Topic selection (keyword scoring, monetization potential)
  → Research (Serper/Tavily + source extraction)
  → Research analysis (DeepSeek/Groq/OpenAI/Gemini/Claude)
  → SEO keyword research & outline
  → Blog generation (with affiliate link injection)
  → Image generation (Gemini — hero, section, social cards)
  → Quality checks (plagiarism, SEO score, readability, fact-check)
  → Human review / edit / approve
  → Multi-platform publish (Spanwrap, Medium, Dev.to, Hashnode, WordPress, Substack)
  → Social promotion (X, LinkedIn, Reddit)
  → Analytics & feedback loop
```

## Setup

```bash
cd pipeline
npm install
cp .env.example .env
```

With no API keys configured, mock research, mock LLM, and mock publisher are used automatically (local + CI).

**AI API keys:** set `GROQ_API_KEY` in `.env`, or pick Groq / OpenAI / Gemini / Claude in the review UI and paste a key. Default Groq model is `openai/gpt-oss-20b` (`llama-3.3-70b-versatile` was retired). Also set `SERPER_API_KEY` / `TAVILY_API_KEY` if you want live web research.

## Review UI

```bash
npm run ui
# open http://127.0.0.1:8787
```

The UI requires a signed-in account. On first launch, create an admin username and password (or set `AUTH_USERNAME` / `AUTH_PASSWORD` in `.env`). Add teammates under **Settings → People**. Sign-ins and edits are recorded in **Settings → Activity log**.

The CLI does not use this login.

## Deploy on Vercel

Yes — this app is a Node HTTP server. Vercel detects root `server.ts` and runs it (Fluid). You do **not** need Next.js.

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Other**. Root directory: repo root (where `server.ts` is).
3. In **Settings → Environment Variables** (Production + Preview), paste values from [`.env.vercel.example`](.env.vercel.example). Required:
   - `MONGODB_URI` — Atlas connection string (serverless disk is ephemeral; file storage will not persist)
   - `GROQ_API_KEY` — or another LLM key
   - `AUTH_SECRET` — `openssl rand -hex 32`
   - `AUTH_USERNAME` / `AUTH_PASSWORD` — first admin (or create the account on first visit)
   - `SPANWRAP_API_URL` / `SPANWRAP_API_KEY` — live site, not localhost
4. MongoDB Atlas → **Network Access** → allow `0.0.0.0/0` (Vercel has no fixed IPs).
5. Deploy. The review UI is the deployment URL (`https://….vercel.app`).

Hobby plans cap function time (~60s). Research + generate can exceed that; **Pro** (Fluid, up to 300s via `maxDuration`) is recommended.

`STORAGE_BACKEND` is forced to MongoDB on Vercel even if you leave it as `file` locally.

## Markdown templates (intern format)

Interns can hand you a `.md` file defining structure and optional placeholders. Research writing is generated to fit that template.

Example: `examples/templates/intern-blog-v1.md`

Supported placeholders:

| Placeholder | Filled with |
|-------------|-------------|
| `{{title}}` | Article title |
| `{{subtitle}}` | Subtitle |
| `{{excerpt}}` | Short summary |
| `{{body}}` | Research-based body |
| `{{sources}}` | Markdown list of sources |
| `{{slug}}` `{{seoTitle}}` `{{seoDescription}}` `{{tags}}` `{{keywords}}` | SEO fields |

If the file has **no** placeholders, generation mirrors the template’s heading order and style as Markdown content.

### CLI

```bash
npm run pipeline -- templates upload ./path/to/template.md --name "Founder blog v1"
npm run pipeline -- templates list
npm run pipeline -- create --topic "..." --template <templateId>
npm run pipeline -- set-template <runId> <templateId>
```

### UI

Use **Markdown templates** panel to upload a `.md` file or paste content, then pick the template when creating a run.

## Hot topics (review UI)

Open the review UI to browse trending AI/ML stories, then start a run:

```bash
npm run ui
# http://127.0.0.1:8787
```

On load, **Hot topics** fetches (in parallel):

- GitHub trending today (stars today). Set `GITHUB_TOKEN` for higher rate limits.
- Reddit `/top` via OAuth when `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` are set.
- X posts when `X_BEARER_TOKEN` is set (official API, no scraping).
- Hacker News (Algolia API, AI/LLM query).
- Dev.to tagged `ai`.
- arXiv latest `cs.AI` / `cs.LG` / `cs.CL` papers.
- Hugging Face daily papers.
- Lobsters `ai` / `ml` tags.
- Tech press RSS: TechCrunch AI, The Verge AI, MIT Technology Review, Ars Technica, IEEE Spectrum.

Click **Write this** on a card to create a pipeline run (picks the template in **New run**). **Refresh** bypasses the in-memory cache (`TRENDS_CACHE_TTL_MINUTES`).

Does **not** scrape private Instagram/X/TikTok walls. Config is in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Storage

Default is local JSON files (`.data/runs`). For MongoDB:

```bash
# .env
STORAGE_BACKEND=mongodb
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=spanwrap_pipeline
```

CLI and UI share the same storage backend.

## Run (CLI)

```bash
# Create a run
npm run pipeline -- create --topic "AI agents in customer support" \
  --audience "startup founders" \
  --keywords "AI agents,customer support,automation"

# Auto-run through quality (stops for human review)
npm run pipeline -- run <id>

# Inspect
npm run pipeline -- show <id>
npm run pipeline -- show <id> --json

# Approve and publish to Spanwrap
npm run pipeline -- approve <id>
npm run pipeline -- publish <id>
```

Stage-by-stage:

```bash
npm run pipeline -- research <id>
npm run pipeline -- outline <id>
npm run pipeline -- generate <id>
npm run pipeline -- quality-check <id>
```

## LLM Providers

Supported: **Groq** (default), **OpenAI**, **Gemini**, **Claude**, **DeepSeek**, or mock. Set in `.env` or switch in the review UI.

| Provider | Env var | Base URL |
|----------|---------|----------|
| Groq | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| DeepSeek | `DEEPSEEK_API_KEY` | `https://api.deepseek.com/v1` |
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| Gemini | `GEMINI_API_KEY` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Claude | `ANTHROPIC_API_KEY` | `https://api.anthropic.com/v1` |

## Image Generation

Uses **Gemini** to generate hero images, section illustrations, and social media cards. Set `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Falls back to mock if unset. Images saved to `.data/images/<runId>/`.

## Multi-Platform Publishing

| Platform | Env vars needed | Mode |
|----------|----------------|------|
| Spanwrap | `SPANWRAP_API_KEY` | Live HTTP POST |
| Medium | `MEDIUM_TOKEN` | Draft via API |
| Dev.to | `DEVTO_API_KEY` | Draft via API |
| Hashnode | `HASHNODE_TOKEN`, `HASHNODE_PUBLICATION_ID` | GraphQL publish |
| WordPress | `WORDPRESS_URL`, `WORDPRESS_USER`, `WORDPRESS_APP_PASSWORD` | Draft via REST |
| Substack | (none) | HTML export to `.data/substack-drafts/` |

## Social Promotion

After publish, optionally auto-share to X/Twitter, LinkedIn, and Reddit. Set `AUTO_PROMOTE_AFTER_PUBLISH=true` and configure API credentials. See `.env.example`.

## SEO & Monetization

- **SEO scoring**: keyword density, title/description length, heading structure, readability
- **Affiliate links**: auto-injected from `.data/affiliate-links.json` or built-in defaults
- **Analytics**: per-post tracking in `.data/analytics/`, feedback loop into trend scoring

## Environment

Full list in `.env.example`. Key variables:

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | groq, openai, gemini, anthropic, deepseek, mock |
| `GROQ_API_KEY` / `DEEPSEEK_API_KEY` / etc. | LLM API key |
| `GEMINI_API_KEY` | Image generation + Gemini LLM |
| `SERPER_API_KEY` or `TAVILY_API_KEY` | Web research |
| `SPANWRAP_API_KEY` | Spanwrap publish |
| `MEDIUM_TOKEN` / `DEVTO_API_KEY` / etc. | Platform publishing |
| `BLOG_BASE_URL` | Base URL for social share links |
| `AUTO_PROMOTE_AFTER_PUBLISH` | Enable auto social sharing |

Full list: [docs/CONFIGURATION.md](docs/CONFIGURATION.md)

## Publishing contract

Only after `APPROVED` (or retry from `PUBLISH_FAILED`):

```
POST {SPANWRAP_API_URL}{SPANWRAP_BLOGS_PATH}
Authorization: Bearer {SPANWRAP_API_KEY}
Idempotency-Key: {pipelineRun.idempotencyKey}
```

See [docs/SPANWRAP_API.md](docs/SPANWRAP_API.md).

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/PIPELINE.md](docs/PIPELINE.md)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- [docs/SPANWRAP_API.md](docs/SPANWRAP_API.md)

## Test

```bash
npm test
npm run typecheck
```

## Storage

Runs are stored as JSON under `.data/runs/<id>.json`.

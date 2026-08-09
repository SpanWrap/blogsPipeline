# Spanwrap Blog Pipeline

Standalone research → generation → human review → publish pipeline.

This project has **zero dependency on the Spanwrap website codebase**. It only communicates by sending an HTTP `POST` to the configured Spanwrap Blog API when an approved post is published.

## Pipeline flow

```
Topic / Content Brief
  → Research
  → Source extraction & normalization
  → Research analysis
  → Outline
  → Blog generation
  → Quality checks
  → Human review / approve
  → POST to Spanwrap Blog API
```

## Setup

```bash
cd pipeline
npm install
cp .env.example .env
```

With no API keys configured, mock research, mock LLM, and mock publisher are used automatically (local + CI).

## Run

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

## Environment

| Variable | Purpose |
|----------|---------|
| `LLM_API_KEY` / `OPENAI_API_KEY` | OpenAI-compatible chat API |
| `LLM_BASE_URL` | Default `https://api.openai.com/v1` |
| `LLM_MODEL` | Default `gpt-4o-mini` |
| `SERPER_API_KEY` or `TAVILY_API_KEY` | Web research |
| `SPANWRAP_API_URL` | Spanwrap site base URL |
| `SPANWRAP_API_KEY` | Bearer token for publish |
| `SPANWRAP_BLOGS_PATH` | Default `/api/blogs` |
| `PIPELINE_DATA_DIR` | Default `.data` |

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

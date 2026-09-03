# Spanwrap Blog Pipeline — Project Context for Opus 4.6

## What this project is

`spanwrap-blog-pipeline` is a standalone TypeScript/Node.js application that automates long-form tech blog production:

1. Discover trends/topics
2. Research sources
3. Analyze findings
4. Build outline
5. Generate draft
6. Run quality checks
7. Human review/edit/approve
8. Publish to one or many platforms
9. Optional social promotion + analytics tracking
10. Optional weekly autopilot scheduler (discover → draft → auto-publish)

It is intentionally decoupled from the main Spanwrap web app. It publishes to Spanwrap via HTTP API and can also publish/export to Medium, Dev.to, Hashnode, WordPress, and Substack.

## Primary purpose

- Produce monetizable, SEO-oriented tech content faster
- Keep human-in-the-loop control before publishing
- Support multi-channel distribution from one reviewed draft
- Remain runnable locally with mocks (no API keys required)

## Tech stack

- Runtime: Node.js 20+
- Language: TypeScript (ESM)
- Server: native Node HTTP server (`server.ts`)
- UI: vanilla HTML/CSS/JS (no React/Next)
- CLI: `commander`
- Validation: `zod`
- Storage:
  - Local JSON files under `.data/` (default local)
  - MongoDB (required on Vercel/deploy)
- Tests: Vitest

## Project shape

- Entry server: `server.ts`
- UI/API server: `src/ui-server/index.ts`
- Browser app: `src/ui-server/public/*`
- Orchestrator: `src/pipeline/orchestrator.ts`
- Pipeline stages: `src/pipeline/stages/*`
- Services: `src/services/*` (including `autopilot.ts`, `scheduler.ts`, `topic-selector.ts`)
- Providers:
  - LLM: `src/providers/llm/*`
  - Research: `src/providers/research/*`
  - Publishing: `src/providers/publishing/*`
  - Images: `src/providers/images/*`
- Config/env: `src/config/*`, `.env.example`
- Tests: `tests/*.test.ts`

## Pipeline behavior and statuses

Common run statuses:

- `CREATED`
- `RESEARCHING` / `RESEARCH_COMPLETE`
- `OUTLINE_READY`
- `GENERATING` / `DRAFT_READY`
- `QUALITY_CHECK` / `REVIEW_REQUIRED`
- `APPROVED`
- `PUBLISHED` / `PUBLISH_FAILED`
- `FAILED` / `CANCELLED`

The `runUntilReview` flow is the core convenience action: research -> analysis -> outline -> generate -> quality, then stops for manual review.

## LLM and model support

Supported providers:

- Groq (default)
- OpenAI
- Gemini
- Anthropic/Claude
- DeepSeek
- Mock

Notes:

- OpenAI-compatible adapter is used for multiple providers.
- Project includes prompt-budgeting utilities to reduce token usage.
- There is support for DeepSeek; `deepseek-chat` is generally preferred for drafting speed over reasoning-heavy models for this workflow.

## Human review UX

Review UI runs at `http://127.0.0.1:8787` locally.

Reviewers can:

- Inspect sources, analysis, outline, draft, quality
- Edit article content
- Save review updates and target publish destinations
- Approve/reject before publish

Recent UX work has focused on clearer live progress and avoiding misleading stage messages.

## Autopilot (Weekly Automation)

The project includes an integrated weekly autopilot scheduler (`src/services/scheduler.ts` and `src/services/autopilot.ts`).

- **Trigger**: Runs every Monday at 08:00 UTC (configurable) when `AUTOPILOT_ENABLED=true`.
- **Topic Selection**: Fetches trending topics and uses the LLM to pick the top topics, deduplicating against the last 30 days of published posts.
- **Platform Tailoring**: Assigns each topic to a specific publishing platform (Spanwrap, Medium, Dev.to, Hashnode, WordPress, Substack) and tailors the angle, tone, and audience to fit the platform.
- **Auto-publishing**: Can operate entirely headless (auto-approving and publishing if `AUTOPILOT_SKIP_REVIEW=true` and quality score is high) or can leave drafts in `REVIEW_REQUIRED` for human editing.
- **UI/CLI**: Managed via the Autopilot panel in the UI Settings or via the `npm run pipeline -- autopilot` CLI commands.

## Publishing targets

- Spanwrap (HTTP publish)
- Medium (API draft)
- Dev.to (API draft)
- Hashnode (GraphQL)
- WordPress (REST)
- Substack (HTML export file)

## Environment highlights

See `.env.example` for full settings. High-signal variables:

- Storage: `STORAGE_BACKEND`, `MONGODB_URI`
- LLM: `LLM_PROVIDER`, provider API keys, `LLM_MODEL`, `LLM_REQUEST_TIMEOUT_MS`
- Research: `SERPER_API_KEY`, `TAVILY_API_KEY`
- Images: `IMAGE_PROVIDER`, `GEMINI_API_KEY`
- Publish: `SPANWRAP_API_URL`, `SPANWRAP_API_KEY`, plus per-platform credentials
- Social: `AUTO_PROMOTE_AFTER_PUBLISH`, `BLOG_BASE_URL`, social API keys

## Local commands

- Install: `npm install`
- Start UI/server: `npm run ui` (or `npm run dev`)
- Typecheck: `npm run typecheck`
- Test: `npm test`
- CLI entry: `npm run pipeline -- <command>`
- Autopilot CLI: `npm run pipeline -- autopilot <run|status|history|enable|disable>`

## Current engineering constraints and expectations

- Keep human approval gate before publishing.
- Favor deterministic/fail-safe behavior over optimistic hidden retries.
- Preserve stage artifacts unless explicitly re-generated.
- Avoid concurrent run corruption; per-run locking is expected in orchestrator paths.
- Keep mock mode functional for offline/local development and tests.

## What Opus 4.6 should assume when helping on this repo

1. This is not a Next.js app; treat it as a Node + vanilla UI app.
2. The orchestrator is the source of truth for pipeline state transitions.
3. Schema correctness (`zod`) and state safety matter as much as feature velocity.
4. Changes should preserve local-first operation (works without paid APIs).
5. Multi-platform publishing and review UX are first-class concerns, not add-ons.


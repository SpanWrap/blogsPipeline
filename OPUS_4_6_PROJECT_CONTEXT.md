# Spanwrap Blog Pipeline — Project Context

## What this project is

`spanwrap-blog-pipeline` is a **Next.js (App Router)** TypeScript application that automates long-form tech blog production:

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

## Tech stack

- Runtime: Node.js 20+
- Framework: Next.js 16 App Router (React 19)
- Language: TypeScript (ESM)
- UI: React client components (`src/components/pipeline/*`) + `app/globals.css`
- API: Route Handlers → `src/api/router.ts` (`app/api/[[...path]]/route.ts`)
- CLI: `commander` (`npm run pipeline`)
- Validation: `zod`
- Storage: Local JSON under `.data/` (default) or MongoDB (required on Vercel)
- Tests: Vitest

## Project shape

- App Router: `app/` (pages + API catch-all)
- Domain: `src/pipeline`, `src/services`, `src/providers`, `src/models`, `src/config`
- API: `src/api/router.ts`, `src/api/session.ts`
- UI: `src/components/PipelineApp.tsx` + `src/components/pipeline/*`
- CLI: `src/cli/index.ts`
- Config: `.env.example`, `vercel.json` (cron)

## Local commands

- Install: `npm install`
- Dev UI: `npm run dev` → http://localhost:3000
- Typecheck: `npm run typecheck`
- Test: `npm test`
- CLI: `npm run pipeline -- <command>`

## Notes for agents

1. This **is** a Next.js app — read `node_modules/next/dist/docs/` when using Next APIs (proxy vs middleware, route handlers, etc.).
2. Orchestrator remains source of truth for pipeline state.
3. Keep human approval gate before publishing.
4. Preserve mock mode for offline/local development.
5. Do not reintroduce the deleted vanilla `server.ts` / `src/ui-server` / SPA `public/app.js` stack.

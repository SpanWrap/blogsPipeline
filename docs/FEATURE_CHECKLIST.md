# Feature checklist — quality & human-time reductions

Verified implementation map (2026-08-20). Restart UI and hard-refresh `?v=17`.
Live draft streaming panel removed — **Run to review** writes a full draft, then opens Quality for Quick Edit.

| # | Feature | Status | Where |
|---|---|---|---|
| 1 | Section-level regenerate | DONE | `services/section-regenerate.ts`, API `regenerate-section`, Article tab buttons |
| 1b | Selection Quick Edit | DONE | Quality editor selection → Regenerate chip + instruction; API `regenerate-selection` |
| 1b | Selection Quick Edit regenerate | DONE | Select text in Quality editor → Regenerate chip → instruction; API `regenerate-selection` |
...
Live draft streaming panel removed (black-screen / detach bug). **Run to review** generates the full draft, then opens the Quality editor for Quick Edit.
| 2 | Source-grounded fact cards | DONE | `services/fact-cards.ts`, GET run enrichment, **Facts** tab |
| 3 | Style lock / voice presets | DONE | `services/style-presets.ts`, create form Style lock, `/api/style-presets` |
| 4 | SEO pack | DONE | `services/seo-research.ts` + `enrichment.ts`, **SEO pack** tab, `apply-seo` |
| 5 | Readability pass | DONE | `services/readability-pass.ts`, button + API `readability-pass` |
| 6 | Competitor angle brief | DONE | `services/competitor-brief.ts`, **Facts** tab |
| 7 | Auto-Accept guardrails | DONE | `AUTO_ACCEPT_ENABLED` / `AUTO_ACCEPT_MIN_SCORE`, quality auto-APPROVED, stream auto-accept in UI |
| 8 | Batch Run to review | DONE | `/api/runs/batch`, Batch box on home |
| 9 | Diff review | DONE | `services/diff-review.ts`, **Diff** tab + `diff` action |
| 10 | One-click distribute | DONE | `distribute()` = approve + publish + repurpose notes |
| 11 | Repurpose pack | DONE | `services/repurpose.ts`, **Repurpose** tab |
| 12 | Template memory | DONE | `services/template-memory.ts` remembers last template + style |
| 13 | Smart resume dashboard | DONE | `services/resume-dashboard.ts`, `/api/dashboard`, Runs sidebar |
| 14 | Affiliate relevance scoring | DONE | `services/affiliate-relevance.ts` (used on generate/accept) |
| 15 | Canonical + cross-post rules | DONE | `services/canonical-rules.ts` (wired into distribute) |
| 16 | Thumbnail A/B | DONE | variants on image stage, Article tab picker, `select-thumbnail` |
| 17 | Update/refresh loop | DONE | API `refresh` + **Refresh post** button on published/approved |

## Env knobs

```bash
AUTO_ACCEPT_ENABLED=false
AUTO_ACCEPT_MIN_SCORE=80
```

## How to smoke-test

1. Restart `npm run ui`
2. Hard refresh
3. Create run with a Style lock → Run to review → Accept draft
4. Open Facts / SEO / Repurpose tabs
5. Try Readability pass, section regenerate, Diff
6. Optional: set `AUTO_ACCEPT_ENABLED=true` for hands-off accept
7. Batch topics → outline
8. Approve → One-click distribute

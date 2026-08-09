# Pipeline flow

## States

```
CREATED
  → RESEARCHING
  → RESEARCH_COMPLETE
  → OUTLINE_READY
  → GENERATING
  → DRAFT_READY
  → QUALITY_CHECK
  → REVIEW_REQUIRED
  → APPROVED
  → PUBLISHED

Failure branches:
  * FAILED
  * CANCELLED
  * PUBLISH_FAILED (retry publish without regenerating)
```

## Stages

### 1. Create (content brief)

Input:

```json
{
  "topic": "AI agents in customer support",
  "targetAudience": "startup founders",
  "tone": "technical but easy to understand",
  "contentType": "educational",
  "keywords": ["AI agents", "customer support", "automation"],
  "referenceUrls": []
}
```

Status: `CREATED`

### 2. Research

- `DirectURLProvider` adds `referenceUrls`
- Primary research provider discovers more URLs (Serper / Tavily / mock)
- Deduplicates by normalized URL
- Fetches pages (unless mock/offline), extracts main content, ranks by relevance
- Auto-runs **analysis** afterward

Analysis extracts source-backed claims only. Unknown source IDs are stripped.

Status: `RESEARCH_COMPLETE`

### 3. Outline

LLM produces title candidates and sections with key points + source IDs.

Status: `OUTLINE_READY`

Editable via CLI `set-outline` or storage edit before generation.

### 4. Generate

LLM writes the article from brief + outline + analysis + sources.

Produces title, slug, excerpt, body, tags, keywords, SEO fields, sources, optional `sourceMap`.

Status: `DRAFT_READY`

### 5. Quality check

Automated checks for content structure, sources, SEO. Returns:

```json
{
  "passed": true,
  "score": 88,
  "issues": [{ "severity": "warning", "type": "...", "message": "..." }]
}
```

Does **not** rewrite the article.

Status: `REVIEW_REQUIRED`

### 6. Human review

- `approve` → `APPROVED`
- `reject` → stays `REVIEW_REQUIRED` with notes
- May edit outline/article and re-run quality

### 7. Publish

Requires `APPROVED` or `PUBLISH_FAILED`.

Calls `Publisher.publish` with idempotency key derived from the run.

- Success → `PUBLISHED`
- Failure → `PUBLISH_FAILED` (article remains approved; safe to retry)

## CLI mapping

| Command | Stage |
|---------|-------|
| `create` | Create brief |
| `research` | Research + analysis |
| `outline` | Outline |
| `generate` | Blog generation |
| `quality-check` | Quality |
| `approve` / `reject` | Review |
| `publish` | Spanwrap publish |
| `run` | research → outline → generate → quality |

## Observability

Each stage records:

- stage name
- status
- start/end timestamps
- durationMs
- provider/model
- retry count
- error (if any)
- stage-specific meta (e.g. `sourcesFound`)

Secrets are never written to logs or stage metadata.

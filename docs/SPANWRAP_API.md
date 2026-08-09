# Spanwrap Blog API contract

This pipeline publishes approved blogs to Spanwrap exclusively over HTTP.

## Endpoint

```
POST {SPANWRAP_API_URL}{SPANWRAP_BLOGS_PATH}
```

Default path: `/api/blogs`

## Authentication

```
Authorization: Bearer {SPANWRAP_API_KEY}
Idempotency-Key: {pipelineRun.idempotencyKey}
Content-Type: application/json
```

## Request body

The `SpanwrapPublisher` maps the internal publishable blog to:

```json
{
  "title": "string",
  "slug": "string",
  "excerpt": "string",
  "content": "string (markdown; HTML stripped)",
  "tags": ["string"],
  "keywords": ["string"],
  "seo_title": "string",
  "seo_description": "string",
  "featured_image": null,
  "published_at": null,
  "sources": [
    {
      "title": "string",
      "url": "https://...",
      "source_name": "string | null"
    }
  ]
}
```

Internal pipeline IDs are **not** included in the payload.

If Spanwrap's schema changes, update **only** `src/providers/publishing/spanwrap.ts`.

## Expected responses

| Status | Meaning | Pipeline behavior |
|--------|---------|-------------------|
| `200` / `201` | Created / ok | `PUBLISHED`; store `id` if present |
| `400` / `422` | Validation | `PUBLISH_FAILED`; no retry loop for same bad body |
| `401` / `403` | Auth | `PUBLISH_FAILED`; fix key |
| `404` | Endpoint missing | `PUBLISH_FAILED` |
| `429` | Rate limit | Retry with backoff, then `PUBLISH_FAILED` |
| `5xx` | Server error | Retry with backoff, then `PUBLISH_FAILED` |
| network / timeout | Transient | Retry with backoff, then `PUBLISH_FAILED` |

## Idempotency

Clients must send a stable `Idempotency-Key` per logical publish.

Spanwrap should:

1. Remember successful creates by key
2. Return the original resource on retry (same key)
3. **Not** create a second post for the same key

The pipeline sets the key at run creation from `pipelineRunId + topic + "publish"`.

## Success body (suggested)

```json
{
  "id": "blog_123",
  "slug": "ai-agents-in-customer-support",
  "status": "published"
}
```

Only `id` is read when present; additional fields are stored as opaque `raw` for debugging.

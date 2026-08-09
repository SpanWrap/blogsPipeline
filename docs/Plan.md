Build a Standalone Blog Content Pipeline

Build a standalone Blog Content Pipeline in this repository.

This repository is completely separate from the Spanwrap website.

Goal

The purpose of this project is to automatically research and generate high-quality blog posts and, after human approval, send the final blog to the Spanwrap website through an API.

The pipeline is:

Topic / Content Brief
        ↓
Research
        ↓
Source Collection
        ↓
Content Extraction
        ↓
Content Cleaning & Normalization
        ↓
Research Analysis
        ↓
Blog Outline
        ↓
Blog Generation
        ↓
Quality / Fact / SEO Checks
        ↓
Human Review
        ↓
Approved Blog
        ↓
Spanwrap Blog API

For now, build only the blog pipeline.

Do NOT build:

* Spanwrap website
* Spanwrap frontend
* Spanwrap database
* Podcast pipeline
* LinkedIn pipeline
* Reddit pipeline
* X pipeline
* Social media publishing
* AI-agent product functionality

⸻

1. First inspect the repository

Before writing code:

1. Inspect the entire repository.
2. Identify the existing language/framework.
3. Identify existing dependencies and conventions.
4. Do not replace the existing stack unnecessarily.
5. Determine whether there is already:
    * an LLM abstraction
    * scraping utilities
    * HTTP client
    * database
    * queue/job system
    * configuration system
    * logging
    * testing framework

If this is an empty repository, choose a sensible production-ready stack.

Prefer a simple architecture over microservices.

After inspection, create:

docs/ARCHITECTURE.md

Document:

* project structure
* pipeline architecture
* major components
* data flow
* external services
* why each major technology was selected

Then implement.

⸻

2. Core requirement

The pipeline must accept a content brief such as:

{
  "topic": "AI agents in customer support",
  "targetAudience": "startup founders",
  "tone": "technical but easy to understand",
  "contentType": "educational",
  "keywords": [
    "AI agents",
    "customer support",
    "automation"
  ],
  "referenceUrls": []
}

The pipeline should then independently perform the research and generate the blog.

⸻

3. Pipeline architecture

Create a modular pipeline:

src/
  pipeline/
    orchestrator
    stages/
      research
      extraction
      normalization
      analysis
      outline
      generation
      quality
      review
      publishing
  providers/
    research/
    llm/
    publishing/
  models/
  services/
  utils/
  config/
  api/
  tests/

Adapt this structure to the actual project stack.

The important requirement is separation of responsibilities.

⸻

4. Research Stage

Build a research system that can discover relevant information for the requested topic.

The research stage should be able to:

* search for relevant sources
* collect source URLs
* retrieve publicly accessible content
* extract useful article content
* preserve source metadata
* rank sources by relevance
* remove duplicate sources

Each source should have structured information such as:

{
  "id": "source_123",
  "url": "https://example.com/article",
  "title": "Example Article",
  "sourceName": "Example",
  "content": "...",
  "publishedAt": null,
  "relevanceScore": 0.91
}

Important:

* Respect robots.txt and website terms.
* Respect rate limits.
* Do not bypass CAPTCHAs.
* Do not bypass authentication.
* Do not implement Cloudflare/anti-bot bypassing.
* Handle blocked/unavailable sources gracefully.
* Never fabricate a source.

Make the research provider replaceable.

For example:

ResearchProvider
├── WebSearchProvider
├── DirectURLProvider
└── Future providers

Do not hard-code the entire pipeline around one search/scraping service.

⸻

5. Content Extraction

For every retrieved source:

1. Fetch the page.
2. Extract the main article content.
3. Remove unnecessary HTML.
4. Remove navigation/footer/ads where possible.
5. Normalize whitespace.
6. Preserve headings and meaningful structure.
7. Preserve the original URL.

The result should be clean text/structured content suitable for downstream processing.

Do NOT send raw HTML unnecessarily to the LLM.

⸻

6. Research Analysis

Before generating the blog, analyze the collected research.

Extract:

* important facts
* statistics
* key arguments
* relevant examples
* competing viewpoints
* important terminology
* useful quotes where legally appropriate
* source relationships
* potential claims requiring verification

Every extracted fact should maintain a reference to its source.

Example:

{
  "claim": "Example factual claim",
  "sourceIds": [
    "source_123",
    "source_456"
  ],
  "confidence": 0.92
}

Do not allow the LLM to invent citations.

⸻

7. Blog Outline

Generate an outline from the research.

The outline should contain:

{
  "titleCandidates": [
    "...",
    "...",
    "..."
  ],
  "sections": [
    {
      "heading": "...",
      "purpose": "...",
      "keyPoints": [
        "...",
        "..."
      ],
      "sourceIds": [
        "source_123"
      ]
    }
  ]
}

The outline must be stored separately from the final article.

The user should be able to review/edit the outline before generation.

⸻

8. Blog Generation

Generate the article using:

* content brief
* approved outline
* research
* source-backed claims

The generated blog should have:

{
  "title": "...",
  "subtitle": "...",
  "slug": "...",
  "excerpt": "...",
  "content": "...",
  "tags": [],
  "keywords": [],
  "seoTitle": "...",
  "seoDescription": "...",
  "sources": []
}

The article should be:

* useful
* readable
* original
* well structured
* factually grounded
* appropriate for the target audience
* free from unnecessary AI filler

Avoid:

* repetitive introductions
* generic conclusions
* fake statistics
* fake citations
* unsupported claims
* keyword stuffing
* excessive headings
* meaningless filler

⸻

9. Source Attribution

Every research-dependent factual claim should be traceable to its source.

Maintain an internal source map.

For example:

Paragraph 5
   ↓
Source 12
Source 18

The final blog should have a clean source/reference section if required by the publishing format.

Do not expose internal pipeline IDs in the published article unless intentionally configured.

⸻

10. Quality Check Stage

Before human approval, run automated checks.

Content checks

Check:

* article is not empty
* reasonable length
* title exists
* introduction exists
* conclusion exists
* headings are valid
* paragraphs aren’t excessively repetitive
* duplicate content
* obvious filler
* unsupported claims where detectable

Source checks

Check:

* cited URLs exist
* URLs are valid
* sources actually relate to claims
* no fabricated citations
* no duplicate sources

SEO checks

Check:

* title
* slug
* meta description
* keywords
* headings
* readability
* keyword usage

Return structured results:

{
  "passed": false,
  "score": 82,
  "issues": [
    {
      "severity": "warning",
      "type": "missing_source",
      "message": "A factual claim needs a source."
    }
  ]
}

Do not silently rewrite important content during quality checks.

Flag issues for human review.

⸻

11. Human Review

The pipeline must NEVER automatically publish generated content without approval.

Use this state machine:

CREATED
   ↓
RESEARCHING
   ↓
RESEARCH_COMPLETE
   ↓
OUTLINE_READY
   ↓
GENERATING
   ↓
DRAFT_READY
   ↓
QUALITY_CHECK
   ↓
REVIEW_REQUIRED
   ↓
APPROVED
   ↓
PUBLISHED

Failure states:

FAILED
CANCELLED

The user should be able to:

* inspect sources
* inspect research
* edit outline
* edit article
* rerun quality checks
* approve article
* reject article
* regenerate specific stages
* publish approved article

⸻

12. Spanwrap Publishing API

Spanwrap is a separate normal website.

This repository should communicate with it only through an HTTP API.

Create a clean publishing abstraction:

Publisher
   ↓
SpanwrapPublisher

Example interface:

interface Publisher {
  publish(blog: PublishableBlog): Promise<PublishResult>;
}

The pipeline should NOT know how Spanwrap stores blogs internally.

It only knows:

POST /api/blogs

or whatever endpoint is configured.

Use environment variables:

SPANWRAP_API_URL=
SPANWRAP_API_KEY=

Do not hard-code the URL.

Do not hard-code credentials.

Do not expose the API key to a frontend.

⸻

13. Spanwrap API Payload

Create an internal publishable representation:

{
  "title": "...",
  "slug": "...",
  "excerpt": "...",
  "content": "...",
  "tags": [],
  "keywords": [],
  "seoTitle": "...",
  "seoDescription": "...",
  "featuredImage": null,
  "publishedAt": null,
  "sources": []
}

The exact payload should be isolated inside the SpanwrapPublisher.

This is important because the Spanwrap API may change later.

Do NOT spread Spanwrap-specific field names throughout the pipeline.

⸻

14. Publishing behavior

Publishing must be explicit.

Only allow:

REVIEW_REQUIRED
        ↓
APPROVED
        ↓
PUBLISH

If publishing fails:

APPROVED
   ↓
PUBLISH_FAILED

The article should remain approved and be retryable.

Do not regenerate the article just because publishing failed.

Handle:

* HTTP 400
* HTTP 401
* HTTP 403
* HTTP 404
* HTTP 429
* HTTP 500
* timeout
* network failure

appropriately.

⸻

15. Idempotency

The publishing system must avoid accidentally creating duplicate blogs.

Use an idempotency mechanism.

For example:

pipelineRunId
blogId
idempotencyKey

If the same publish operation is retried, it should not accidentally create multiple copies on Spanwrap.

⸻

16. Pipeline execution

Implement a pipeline orchestrator.

Example:

runPipeline()
    ↓
createContentBrief()
    ↓
research()
    ↓
extractSources()
    ↓
normalizeResearch()
    ↓
analyzeResearch()
    ↓
generateOutline()
    ↓
humanApproval()
    ↓
generateBlog()
    ↓
qualityCheck()
    ↓
humanApproval()
    ↓
publishToSpanwrap()

Stages should be independently executable.

For example:

POST /pipeline/:id/research
POST /pipeline/:id/outline
POST /pipeline/:id/generate
POST /pipeline/:id/quality-check
POST /pipeline/:id/publish

If the project does not need a web API, expose equivalent CLI commands.

⸻

17. CLI

Provide a CLI so the pipeline can be tested without building a frontend.

Example:

blog-pipeline create --topic "AI agents in customer support"
blog-pipeline research <id>
blog-pipeline outline <id>
blog-pipeline generate <id>
blog-pipeline quality-check <id>
blog-pipeline approve <id>
blog-pipeline publish <id>

Adapt commands to the selected technology.

The CLI should show useful progress and errors.

⸻

18. Storage

For the first version, keep storage simple.

Store:

* content brief
* research sources
* extracted content/reference
* research analysis
* outline
* generated article
* quality results
* pipeline state
* publishing result

If a database is necessary, use a lightweight database initially unless the repository already specifies a database.

Do not introduce a complex distributed architecture.

⸻

19. LLM abstraction

Do not hard-code the entire pipeline to one model.

Create:

LLMProvider

with a common interface for:

* outline generation
* research analysis
* blog generation
* quality analysis

Example:

interface LLMProvider {
  generateStructured<T>(
    prompt: string,
    schema: Schema
  ): Promise<T>;
  generateText(
    prompt: string
  ): Promise<string>;
}

Provider/model should be configurable through environment variables.

Do not expose API keys.

⸻

20. Prompt management

Do not scatter huge prompts throughout application code.

Keep prompts organized:

prompts/
  research/
  analysis/
  outline/
  generation/
  quality/

Prompts should be versionable.

The system should make it possible to improve prompts without changing core pipeline logic.

⸻

21. Observability

For every pipeline run, track:

* pipeline ID
* current stage
* stage status
* start time
* end time
* duration
* provider/model
* retry count
* errors
* final status

Example:

{
  "stage": "research",
  "status": "completed",
  "durationMs": 12450,
  "sourcesFound": 12
}

Never log:

* API keys
* passwords
* authentication tokens
* secrets

⸻

22. Error handling and retries

Implement safe retries for transient errors.

Retry:

* network timeout
* 429
* temporary provider failure
* temporary scraping failure

Do not endlessly retry:

* invalid API key
* invalid URL
* malformed user input
* permanent 404

Use exponential backoff where appropriate.

⸻

23. Testing

Create tests for:

Research

* source discovery
* successful extraction
* failed extraction
* duplicate sources
* empty pages

Analysis

* valid structured response
* malformed LLM response
* missing source references

Outline

* valid outline
* invalid outline

Generation

* valid article
* malformed response

Quality

* duplicate content
* missing sources
* invalid metadata
* valid article

Publishing

Mock the Spanwrap API.

Test:

* successful publish
* authentication failure
* validation failure
* rate limit
* server failure
* timeout
* retry
* idempotent retry

End-to-end

Create one complete test:

Brief
→ Research
→ Outline
→ Generate
→ Quality
→ Approve
→ Mock Spanwrap API
→ Published

External APIs should be mocked during tests.

⸻

24. Security

Implement basic security correctly.

* API keys only on server
* environment-based secrets
* input validation
* URL validation
* request timeouts
* rate limiting where appropriate
* safe HTML/Markdown handling
* sanitize content before publishing
* never execute scraped content as code

Do not trust scraped webpages.

⸻

25. Documentation

Create:

README.md
docs/ARCHITECTURE.md
docs/PIPELINE.md
docs/CONFIGURATION.md
docs/SPANWRAP_API.md

README should explain:

* what the project does
* architecture
* setup
* environment variables
* running locally
* running a pipeline
* testing
* publishing to Spanwrap

PIPELINE.md should contain the complete flow.

SPANWRAP_API.md should document the expected API contract between this repository and Spanwrap.

⸻

26. Future extensibility

Design the core pipeline so the same architecture can later support:

ContentPipeline
├── BlogPipeline
├── PodcastPipeline
└── SocialPipeline

But DO NOT IMPLEMENT THE OTHER PIPELINES NOW.

For example, common reusable components can eventually become:

Research
ContentExtraction
ContentNormalization
LLM
Quality
Publishing

Blog-specific components should remain separate:

BlogOutline
BlogGeneration
BlogSEO
BlogPublisher

⸻

27. Important development philosophy

Follow this order:

1. Make it work
2. Make it reliable
3. Make it fast
4. Add useful features
5. Make it beautiful / improve UX later
6. Build reusable pipelines

Do not over-engineer the first version.

A working end-to-end pipeline is more important than a huge architecture.

⸻

28. Definition of Done

The task is complete only when I can do:

Give the system a topic
        ↓
Research relevant sources
        ↓
Extract and normalize research
        ↓
Generate a source-backed outline
        ↓
Generate a complete blog
        ↓
Run quality checks
        ↓
Review/edit/approve
        ↓
Send the approved blog to Spanwrap API

The final publishing step should be testable using a mocked Spanwrap API if the real API is not yet available.

⸻

29. Final report

After implementation, provide:

1. Architecture summary
2. Folder structure
3. Technologies used
4. Dependencies added
5. Pipeline stages
6. Database/storage design
7. API/CLI commands
8. Environment variables
9. Spanwrap API contract
10. Tests written
11. End-to-end test result
12. Known limitations
13. Next recommended improvements

Before finishing, run:

lint
typecheck
tests
build

Fix all errors introduced by your implementation.

Start now

First inspect the repository and existing code.

Do NOT immediately start writing the entire application.

First understand what exists, identify the appropriate architecture, and then implement the smallest complete end-to-end Blog Pipeline.
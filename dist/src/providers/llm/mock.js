import { BlogOutlineSchema, GeneratedBlogSchema, ResearchAnalysisSchema, } from "../../models";
import { toSlug } from "../../utils/slug";
/**
 * Deterministic offline LLM used for tests and local runs without API keys.
 */
export class MockLLMProvider {
    name = "mock";
    model = "mock-1";
    async generateText(prompt) {
        return `Mock response for: ${prompt.slice(0, 80)}`;
    }
    async generateStructured(prompt, schema) {
        const lower = prompt.toLowerCase();
        // Order matters: outline/generation prompts embed analysis JSON, so match those first.
        const kind = detectMockKind(lower, schema);
        if (kind === "analysis") {
            const sourceIds = extractSourceIds(prompt);
            const data = {
                summary: "Mock analysis summarizing the collected research with source-backed claims only.",
                claims: sourceIds.slice(0, 3).map((id, i) => ({
                    claim: `Mock claim ${i + 1} grounded in research source ${id}.`,
                    sourceIds: [id],
                    confidence: 0.8,
                    category: "fact",
                })),
                keyArguments: ["Operators should ground support automation in clear escalation paths."],
                competingViewpoints: [
                    "Some teams prefer human-only support for complex account work.",
                ],
                terminology: ["AI agent", "escalation", "deflection"],
                sourceRelationships: sourceIds.length
                    ? [{ sourceIds: sourceIds.slice(0, 2), relationship: "cover related product claims" }]
                    : [],
            };
            return schema.parse(data);
        }
        if (kind === "outline") {
            const sourceIds = extractSourceIds(prompt);
            const topic = extractField(prompt, "topic") ?? "AI agents";
            const data = {
                titleCandidates: [
                    `${topic}: a practical guide`,
                    `How ${topic} changes day-to-day work`,
                    `What founders should know about ${topic}`,
                ],
                sections: [
                    {
                        heading: "Why this matters now",
                        purpose: "Frame the problem for the target audience",
                        keyPoints: ["Context", "Costs of inaction"],
                        sourceIds: sourceIds.slice(0, 1),
                    },
                    {
                        heading: "What the research shows",
                        purpose: "Present source-backed findings",
                        keyPoints: ["Key facts", "Trade-offs"],
                        sourceIds: sourceIds.slice(0, 2),
                    },
                    {
                        heading: "How to apply it",
                        purpose: "Give concrete next steps",
                        keyPoints: ["Pilot approach", "Metrics to watch"],
                        sourceIds: sourceIds.slice(0, 2),
                    },
                    {
                        heading: "Conclusion",
                        purpose: "Summarize without empty platitudes",
                        keyPoints: ["Decision checklist"],
                        sourceIds: [],
                    },
                ],
            };
            return schema.parse(data);
        }
        if (kind === "article") {
            const topic = extractField(prompt, "topic") ?? "AI agents in customer support";
            const title = `${topic}: a practical guide for founders`;
            const sources = extractSourcesFromPrompt(prompt);
            const bodySections = [
                "Customer support teams are under constant pressure to answer faster without losing quality. AI agents can help, but only when they are grounded in clear workflows and human escalation.",
                "Startups often treat support automation as pure cost reduction. The more useful framing is reliability: reduced wait times, consistent answers, and cleaner handoffs when a person is required.",
                sources.length
                    ? `Public sources such as ${sources[0]?.title ?? "referenced materials"} discuss how agent systems succeed when scope is limited and tools are observable.`
                    : "Research-backed practice favors narrow automation first, then expansion.",
                "Teams that skip escalation design tend to create silent failure modes. The safer pattern is supervised automation with explicit ownership.",
                "1. Pick one high-volume, low-risk intent and document the success criteria.\n2. Wire monitoring so every automated resolution is inspectable.\n3. Keep an easy path to a human for account, billing, and emotional cases.",
                "AI agents are useful in customer support when they are treated as production systems, not demos. Start small, measure carefully, and keep humans in the critical path.",
            ];
            let content;
            if (prompt.includes("ARTICLE MARKDOWN TEMPLATE") || prompt.includes("```markdown")) {
                // If template has placeholders, body-only content is enough (fill happens later).
                // If structure-only, mirror common section headings from the template string.
                const headingMatches = [...prompt.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
                if (headingMatches.length >= 2 && !prompt.includes("{{body}}")) {
                    content = [
                        `# ${title}`,
                        "",
                        ...headingMatches.flatMap((h, i) => [
                            `## ${h}`,
                            "",
                            bodySections[i % bodySections.length],
                            "",
                        ]),
                    ].join("\n");
                }
                else {
                    content = bodySections.join("\n\n");
                }
            }
            else {
                content = [
                    `# ${title}`,
                    "",
                    "![Support workflow](https://opengraph.githubassets.com/1/example/weekly-ai-agent)",
                    "",
                    bodySections[0],
                    "",
                    "## Why this matters now",
                    "",
                    bodySections[1],
                    "",
                    "## What the research shows",
                    "",
                    bodySections[2],
                    "",
                    bodySections[3],
                    "",
                    "## How to apply it",
                    "",
                    bodySections[4],
                    "",
                    "## Conclusion",
                    "",
                    bodySections[5],
                ].join("\n");
            }
            const data = {
                title,
                subtitle: "A grounded, implementation-first look",
                slug: toSlug(title),
                excerpt: "How startup founders can deploy AI agents in customer support without sacrificing trust or quality.",
                content,
                tags: ["ai-agents", "customer-support", "startups"],
                keywords: ["AI agents", "customer support", "automation"],
                seoTitle: title.slice(0, 60),
                seoDescription: "Practical guidance for founders on using AI agents in customer support with clear escalation and measurement.",
                featuredImage: "https://opengraph.githubassets.com/1/example/weekly-ai-agent",
                sources: sources.map((s) => ({
                    title: s.title,
                    url: s.url,
                    sourceName: s.sourceName,
                })),
                sourceMap: [
                    { paragraphIndex: 3, sourceIds: sources[0] ? [sources[0].id] : [] },
                ].filter((m) => m.sourceIds.length > 0),
            };
            return schema.parse(data);
        }
        // Generic empty object attempt
        return schema.parse({});
    }
}
function detectMockKind(lower, schema) {
    if (schema === GeneratedBlogSchema || lower.includes("write a complete original blog article")) {
        return "article";
    }
    if (schema === BlogOutlineSchema || lower.includes("create a blog outline")) {
        return "outline";
    }
    if (schema === ResearchAnalysisSchema ||
        lower.includes("performing research analysis") ||
        lower.includes("using only the sources below")) {
        return "analysis";
    }
    return "unknown";
}
function extractSourceIds(prompt) {
    const matches = [...prompt.matchAll(/"id"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
    return [...new Set(matches)];
}
function extractField(prompt, field) {
    const re = new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, "i");
    return prompt.match(re)?.[1] ?? null;
}
function extractSourcesFromPrompt(prompt) {
    const ids = extractSourceIds(prompt);
    return ids.map((id, i) => ({
        id,
        url: `https://example.com/source-${i + 1}`,
        title: `Source ${i + 1}`,
        sourceName: "example.com",
        content: "Example content.",
        publishedAt: null,
        relevanceScore: 0.8,
    }));
}
export function buildMockBrief(overrides = {}) {
    return {
        topic: "AI agents in customer support",
        targetAudience: "startup founders",
        tone: "technical but easy to understand",
        contentType: "educational",
        keywords: ["AI agents", "customer support", "automation"],
        referenceUrls: [],
        ...overrides,
    };
}

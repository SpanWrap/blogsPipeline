import { z } from "zod";
export const TrendSignalSchema = z.object({
    platform: z.string(),
    title: z.string(),
    url: z.string().url().optional(),
    score: z.number().default(0),
    comments: z.number().default(0),
    author: z.string().optional(),
    community: z.string().optional(),
    description: z.string().default(""),
    imageUrl: z.string().nullable().default(null),
    capturedAt: z.string(),
});
export const TopicRecommendationSchema = z.object({
    id: z.string(),
    topic: z.string().min(3),
    summary: z.string().default(""),
    whyItMatters: z.string().default(""),
    blogAngle: z.string().default(""),
    keywords: z.array(z.string()).default([]),
    heatScore: z.number().min(0).max(100),
    platforms: z.array(z.string()).default([]),
    signals: z.array(TrendSignalSchema).default([]),
    discoveredAt: z.string(),
    expiresAt: z.string().nullable().default(null),
});
export const TechDigestItemSchema = z.object({
    platform: z.enum([
        "github",
        "reddit",
        "x",
        "hackernews",
        "devto",
        "arxiv",
        "huggingface",
        "lobsters",
        "news",
    ]),
    title: z.string().min(1),
    description: z.string().default(""),
    url: z.string().url(),
    imageUrl: z.string().nullable().default(null),
    score: z.number().default(0),
    comments: z.number().default(0),
    author: z.string().optional(),
    community: z.string().optional(),
    capturedAt: z.string(),
});
export const TechDigestSchema = z.object({
    generatedAt: z.string(),
    theme: z.string().default("AI/ML technology"),
    github: z.array(TechDigestItemSchema).default([]),
    reddit: z.array(TechDigestItemSchema).default([]),
    x: z.array(TechDigestItemSchema).default([]),
    /** HN, Dev.to, arXiv, Hugging Face, Lobsters, and tech-press RSS. */
    more: z.array(TechDigestItemSchema).default([]),
    notes: z.array(z.string()).default([]),
});

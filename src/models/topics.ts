import { z } from "zod";

export const TrendSignalSchema = z.object({
  platform: z.string(),
  title: z.string(),
  url: z.string().url().optional(),
  score: z.number().default(0),
  comments: z.number().default(0),
  author: z.string().optional(),
  community: z.string().optional(),
  capturedAt: z.string(),
});

export type TrendSignal = z.infer<typeof TrendSignalSchema>;

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

export type TopicRecommendation = z.infer<typeof TopicRecommendationSchema>;

import { z } from "zod";

export const StylePresetSchema = z.object({
  id: z.string(),
  label: z.string(),
  tone: z.string(),
  voiceNotes: z.string(),
  bannedPhrases: z.array(z.string()).default([]),
});

export type StylePreset = z.infer<typeof StylePresetSchema>;

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "founder",
    label: "Founder / operator",
    tone: "direct, practical, first-person plural when useful",
    voiceNotes: "Lead with decisions and trade-offs. Short paragraphs. Concrete examples over theory.",
    bannedPhrases: ["in today's fast-paced world", "leverage synergies", "game-changer", "delve into"],
  },
  {
    id: "tutorial",
    label: "Tutorial / how-to",
    tone: "clear instructional, second person",
    voiceNotes: "Step-by-step. Numbered actions. Call out pitfalls. Assume smart but busy readers.",
    bannedPhrases: ["simply", "just", "obviously", "as we all know"],
  },
  {
    id: "opinion",
    label: "Opinion / analysis",
    tone: "confident, evidence-backed, slightly opinionated",
    voiceNotes: "State the thesis early. Steelman the counterargument. End with a clear take.",
    bannedPhrases: ["it remains to be seen", "only time will tell", "in conclusion"],
  },
  {
    id: "neutral",
    label: "Neutral educational",
    tone: "clear and professional",
    voiceNotes: "Balanced. Define terms once. Prefer precise verbs over hype adjectives.",
    bannedPhrases: ["revolutionary", "disruptive", "cutting-edge"],
  },
];

export function getStylePreset(id: string | null | undefined): StylePreset | null {
  if (!id) return null;
  return STYLE_PRESETS.find((p) => p.id === id) ?? null;
}

export function applyStyleLockToBrief(
  brief: { tone: string; topic: string },
  presetId: string | null | undefined,
): { tone: string; styleGuidance: string | null } {
  const preset = getStylePreset(presetId);
  if (!preset) return { tone: brief.tone, styleGuidance: null };
  return {
    tone: preset.tone,
    styleGuidance: [
      `Style preset: ${preset.label}`,
      preset.voiceNotes,
      preset.bannedPhrases.length
        ? `Avoid these phrases: ${preset.bannedPhrases.map((p) => `"${p}"`).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function stripBannedPhrases(content: string, presetId: string | null | undefined): string {
  const preset = getStylePreset(presetId);
  if (!preset?.bannedPhrases.length) return content;
  let next = content;
  for (const phrase of preset.bannedPhrases) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(re, "");
  }
  return next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
}

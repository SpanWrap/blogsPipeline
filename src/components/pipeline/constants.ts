export const LLM_PROVIDERS = [
  {
    id: "groq",
    label: "Groq",
    defaultModel: "openai/gpt-oss-20b",
    keyLabel: "Groq API key",
    models: [
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (free, fast)" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (higher quality, 8k TPM on free tier)" },
      { id: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyLabel: "OpenAI API key",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    keyLabel: "Gemini API key",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    id: "anthropic",
    label: "Claude",
    defaultModel: "claude-sonnet-4-0",
    keyLabel: "Anthropic API key",
    models: [
      { id: "claude-sonnet-4-0", label: "Claude Sonnet 4" },
      { id: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5" },
      { id: "claude-3-5-sonnet-latest", label: "Claude Sonnet 3.5" },
    ],
  },
  {
    id: "mock",
    label: "Mock (no API)",
    defaultModel: "mock-1",
    keyLabel: "No key needed",
    models: [{ id: "mock-1", label: "Mock" }],
  },
] as const;

export const PUBLISH_SITES = [
  { id: "spanwrap", label: "Spanwrap", note: "Live HTTP publish" },
  { id: "medium", label: "Medium", note: "Planned" },
  { id: "substack", label: "Substack", note: "Planned" },
] as const;

export const TAB_LABELS: Record<string, string> = {
  quality: "Quality",
  article: "Preview",
  publish: "Publish",
  seo: "SEO pack",
  facts: "Fact cards",
  diff: "Diff",
  repurpose: "Repurpose",
  outline: "Outline",
  template: "Template",
  sources: "Sources",
  analysis: "Analysis",
  stages: "Stages",
  raw: "Raw",
};

export const DETAIL_TABS = [
  "quality",
  "article",
  "seo",
  "facts",
  "diff",
  "repurpose",
  "publish",
  "outline",
  "template",
  "sources",
  "analysis",
  "stages",
  "raw",
] as const;

export type HomeView = "topics" | "create" | "runs";
export type AppPage = "home" | "settings";

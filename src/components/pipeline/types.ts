/* eslint-disable @typescript-eslint/no-explicit-any */
export type RunRecord = Record<string, any>;
export type TemplateRecord = { id: string; name: string; filename?: string; chars?: number };
export type StylePreset = { id: string; label: string };
export type DigestItem = {
  title?: string;
  url?: string;
  description?: string;
  platform?: string;
  imageUrl?: string;
  score?: number;
  comments?: number;
  community?: string;
};
export type DigestData = {
  generatedAt?: string;
  notes?: string[];
  github?: DigestItem[];
  reddit?: DigestItem[];
  x?: DigestItem[];
  more?: DigestItem[];
};
export type ProgressLine = { at: string; text: string };
export type LlmProvider = {
  id: string;
  label: string;
  defaultModel: string;
  keyLabel: string;
  models: { id: string; label: string }[];
};
export type LlmConfig = {
  provider?: string;
  model?: string;
  hasKey?: boolean;
  keyPreview?: string | null;
  remappedFrom?: string | null;
  providers?: LlmProvider[];
};
export type HealthData = Record<string, any>;
export type DashboardData = { buckets?: { label: string; count: number; runIds: string[] }[] };
export type AutopilotStatus = Record<string, any>;
export type AutopilotCycle = Record<string, any>;
export type ReaderProfile = {
  id: string;
  label: string;
  audience: string;
  seniority: string;
  stack: string;
  goal: string;
  summary?: string;
};
export type ReaderProfilesConfig = {
  profiles: ReaderProfile[];
  defaultProfileId: string;
  activeLabel?: string;
  activeSummary?: string;
  updatedAt?: string;
};
export type EmailNotifyConfig = {
  enabled?: boolean;
  recipients?: string[];
  updatedAt?: string;
  configured?: boolean;
  hasApiKey?: boolean;
  senderEmail?: string | null;
  senderName?: string;
};
export type LogEntry = Record<string, any>;
export type AccessLevel = "none" | "view" | "edit" | "full";
export type ModuleId =
  | "topics"
  | "runs"
  | "templates"
  | "autopilot"
  | "email"
  | "llm"
  | "people"
  | "activity";
export type ModulePermissions = Record<ModuleId, AccessLevel>;
export type UserRecord = {
  username: string;
  createdAt?: string;
  lastLoginAt?: string | null;
  active?: boolean;
  permissions?: ModulePermissions;
};

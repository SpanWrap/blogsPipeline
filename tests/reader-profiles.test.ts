import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "@/prompts/generation/v1";
import { buildOutlinePrompt } from "@/prompts/outline/v1";
import {
  NO_READER_AUDIENCE,
  NO_READER_ID,
  NO_READER_LABEL,
} from "@/services/reader-constants";
import {
  activeReaderProfile,
  publicReaderProfiles,
  type ReaderProfileSettings,
} from "@/services/reader-profiles";

const settings: ReaderProfileSettings = {
  profiles: [
    {
      id: "senior-backend",
      label: "Senior backend engineers",
      audience: "senior backend engineers",
      seniority: "senior",
      stack: "APIs",
      goal: "practical guidance",
    },
  ],
  defaultProfileId: NO_READER_ID,
  updatedAt: new Date(0).toISOString(),
};

describe("no reader", () => {
  it("does not attach a persona when the default reader is none", () => {
    expect(activeReaderProfile(settings)).toBeNull();
    expect(publicReaderProfiles(settings).activeLabel).toBe(NO_READER_LABEL);
  });

  it("tells the draft prompts not to write for one persona", () => {
    const article = buildGenerationPrompt({
      briefJson: "{}",
      outlineJson: "{}",
      analysisJson: "{}",
      sourcesJson: "[]",
      freeReader: true,
    });
    const outline = buildOutlinePrompt({
      briefJson: "{}",
      analysisJson: "{}",
      sourceIds: [],
      freeReader: true,
    });
    expect(article).toContain("do not write for one job title or persona");
    expect(outline).toContain("do not shape sections for one job title or persona");
    expect(NO_READER_AUDIENCE.length).toBeLessThanOrEqual(80);
  });
});

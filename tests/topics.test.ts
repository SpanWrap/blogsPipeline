import { describe, expect, it } from "vitest";
import { discoverTopicRecommendations } from "@/services/topic-discovery";
import { FileTopicStore } from "@/services/topic-store";
import { MockTrendProvider } from "@/providers/trends";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("topic discovery", () => {
  it("ranks mock social signals into blog recommendations", async () => {
    const topics = await discoverTopicRecommendations({
      providers: [new MockTrendProvider()],
      limit: 5,
    });
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]!.heatScore).toBeGreaterThan(0);
    expect(topics[0]!.topic.length).toBeGreaterThan(8);
    expect(topics[0]!.platforms.length).toBeGreaterThan(0);
    // higher engagement should rank higher than the last item when sorted
    if (topics.length > 1) {
      expect(topics[0]!.heatScore).toBeGreaterThanOrEqual(topics[topics.length - 1]!.heatScore);
    }
  });

  it("persists recommendations in the topic store", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "topics-"));
    const store = new FileTopicStore(dir);
    const topics = await discoverTopicRecommendations({
      providers: [new MockTrendProvider()],
      limit: 3,
    });
    const saved = await store.saveMany(topics);
    const listed = await store.list();
    expect(listed.length).toBe(saved.length);
    const one = await store.require(saved[0]!.id);
    expect(one.topic).toBe(saved[0]!.topic);
    rmSync(dir, { recursive: true, force: true });
  });
});

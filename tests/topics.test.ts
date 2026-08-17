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

describe("tech digest", () => {
  it("returns github, reddit, and x items with images and descriptions when offline", async () => {
    const { discoverTechDigest } = await import("@/services/tech-digest");
    const digest = await discoverTechDigest({ offline: true, limit: 5 });
    expect(digest.github.length).toBeGreaterThan(0);
    expect(digest.reddit.length).toBeGreaterThan(0);
    expect(digest.x.length).toBeGreaterThan(0);
    expect(digest.github[0]!.imageUrl).toBeTruthy();
    expect(digest.github[0]!.description.length).toBeGreaterThan(8);
    expect(digest.reddit[0]!.url).toMatch(/^https?:\/\//);
    expect(digest.reddit[0]!.url).toContain("/r/artificial/");
    expect(digest.x[0]!.platform).toBe("x");
    expect(digest.more.length).toBeGreaterThan(0);
    expect(digest.more.some((item) => item.platform === "arxiv")).toBe(true);
  });
});

describe("github trending + reddit /top parsers", () => {
  it("parses github.com/trending HTML for name, description, stars, and forks", async () => {
    const { parseGitHubTrendingHtml, parseCompactCount } = await import("@/providers/trends");
    expect(parseCompactCount("105,540")).toBe(105540);
    expect(parseCompactCount("1,275 stars today")).toBe(1275);
    const html = `
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/harry0703/MoneyPrinterTurbo">harry0703 / MoneyPrinterTurbo</a>
        </h2>
        <p class="col-9 color-fg-muted my-1">
          Generate HD short videos from a topic or keyword with an automated AI workflow.
        </p>
        <span itemprop="programmingLanguage">Python</span>
        <a href="/harry0703/MoneyPrinterTurbo/stargazers">105,540</a>
        <a href="/harry0703/MoneyPrinterTurbo/forks">16,050</a>
        <span class="d-inline-block float-sm-right">1,275 stars today</span>
      </article>`;
    const [repo] = parseGitHubTrendingHtml(html, "2026-08-17T00:00:00.000Z");
    expect(repo?.title).toBe("harry0703/MoneyPrinterTurbo");
    expect(repo?.url).toBe("https://github.com/harry0703/MoneyPrinterTurbo");
    expect(repo?.description).toMatch(/HD short videos/);
    expect(repo?.score).toBe(1275);
    expect(repo?.comments).toBe(16050);
    expect(repo?.community).toMatch(/Python/);
    expect(repo?.community).toMatch(/105,540 stars/);
    expect(repo?.community).toMatch(/1,275 stars today/);
    expect(repo?.imageUrl).toContain("opengraph.githubassets.com");
  });

  it("builds GitHub Search queries with a created:> window only (no all-time stars)", async () => {
    const { buildGitHubSearchQueries, isoDaysAgo } = await import("@/clients/github");
    const now = new Date("2026-08-17T00:00:00.000Z");
    const queries = buildGitHubSearchQueries({ days: 7, now });
    const date = isoDaysAgo(7, now);
    expect(date).toBe("2026-08-10");
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.q).toContain(`created:>${date}`);
      expect(query.q).not.toMatch(/pushed:>/);
      expect(query.sort).toBe("stars");
    }
    expect(queries.some((q) => /stars:>50/.test(q.q) && !q.q.includes("created:>"))).toBe(false);
  });

  it("ranks GitHub trending by stars today, not lifetime stars", async () => {
    const { rankGitHubSignals } = await import("@/clients/github");
    const now = "2026-08-17T00:00:00.000Z";
    const ranked = rankGitHubSignals(
      [
        {
          platform: "github",
          title: "tensorflow/tensorflow",
          url: "https://github.com/tensorflow/tensorflow",
          score: 40,
          comments: 80000,
          description: "An Open Source Machine Learning Framework",
          community: "Python · 190,000 stars · 40 stars today",
          imageUrl: null,
          capturedAt: now,
        },
        {
          platform: "github",
          title: "harry0703/MoneyPrinterTurbo",
          url: "https://github.com/harry0703/MoneyPrinterTurbo",
          score: 1275,
          comments: 16050,
          description: "Generate HD short videos with an automated AI workflow",
          community: "Python · 105,540 stars · 1,275 stars today",
          imageUrl: null,
          capturedAt: now,
        },
      ],
      5,
    );
    expect(ranked[0]?.title).toBe("harry0703/MoneyPrinterTurbo");
  });

  it("builds Reddit OAuth /top URLs", async () => {
    const { redditOAuthTopUrl, redditTopUrls, parseRedditListingHtml } = await import(
      "@/clients/reddit"
    );
    expect(redditOAuthTopUrl("artificial", 20, "day")).toBe(
      "https://oauth.reddit.com/r/artificial/top?limit=20&t=day",
    );
    expect(redditTopUrls("artificial", 5).json[0]).toContain("/r/artificial/top.json?t=day");
    const html = `
      <div class="thing link" data-permalink="/r/artificial/comments/abc/new_open_model/"
        data-author="alice" data-subreddit="artificial" data-score="420" data-nsfw="false">
        <a class="title">Open-source multimodal model beats last week's baseline</a>
        <a class="comments">24 comments</a>
      </div>`;
    const [post] = parseRedditListingHtml(html, "artificial", "2026-08-17T00:00:00.000Z");
    expect(post?.title).toMatch(/multimodal model/);
    expect(post?.url).toContain("/r/artificial/comments/");
    expect(post?.community).toBe("r/artificial");
    expect(post?.score).toBe(420);
    expect(post?.comments).toBe(24);
  });
});

describe("ttl cache", () => {
  it("returns values until expiry", async () => {
    const { TtlCache } = await import("@/utils/ttl-cache");
    const cache = new TtlCache<string>(50);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    await new Promise((r) => setTimeout(r, 70));
    expect(cache.get("k")).toBeUndefined();
  });
});

describe("AI/ML feed parsers", () => {
  it("parses arXiv Atom entries", async () => {
    const { parseRssOrAtom } = await import("@/providers/trends/feeds");
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/2601.01234v1</id>
          <title>Scaling Laws for Tool-Using Language Agents</title>
          <summary>We study how tool use scales with model size.</summary>
          <published>2026-08-17T00:00:00Z</published>
          <link href="https://arxiv.org/abs/2601.01234" rel="alternate" type="text/html"/>
          <author><name>Ada Lovelace</name></author>
        </entry>
      </feed>`;
    const [item] = parseRssOrAtom(xml);
    expect(item?.title).toMatch(/Scaling Laws/);
    expect(item?.url).toBe("https://arxiv.org/abs/2601.01234");
    expect(item?.author).toBe("Ada Lovelace");
  });

  it("parses RSS items and strips HTML", async () => {
    const { parseRssOrAtom } = await import("@/providers/trends/feeds");
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title><![CDATA[OpenAI ships a smaller reasoning model]]></title>
          <link>https://techcrunch.com/2026/08/17/openai-model/</link>
          <description><![CDATA[<p>A new checkpoint for on-device inference.</p>]]></description>
        </item>
      </channel></rss>`;
    const [item] = parseRssOrAtom(xml);
    expect(item?.title).toMatch(/OpenAI/);
    expect(item?.url).toContain("techcrunch.com");
    expect(item?.description).toMatch(/on-device/);
    expect(item?.description).not.toContain("<p>");
  });
});

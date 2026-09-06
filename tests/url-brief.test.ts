import { describe, expect, it } from "vitest";
import { normalizeBriefUrls, topicFromBlogUrl } from "@/utils/url";

describe("topicFromBlogUrl", () => {
  it("derives a title from an Educative lesson slug", () => {
    expect(
      topicFromBlogUrl(
        "https://www.educative.io/courses/grokking-the-system-design-interview/how-the-domain-name-system-works",
      ),
    ).toBe("How The Domain Name System Works");
  });
});

describe("normalizeBriefUrls", () => {
  it("moves a pasted topic URL into referenceUrls and derives topic", () => {
    const result = normalizeBriefUrls({
      topic:
        "https://www.educative.io/courses/grokking-the-system-design-interview/how-the-domain-name-system-works ",
    });
    expect(result.referenceUrls[0]).toContain("educative.io");
    expect(result.topic).toBe("How The Domain Name System Works");
  });

  it("keeps an explicit topic and attaches sourceUrl", () => {
    const result = normalizeBriefUrls({
      topic: "DNS hierarchy and caching",
      sourceUrl:
        "https://www.educative.io/courses/grokking-the-system-design-interview/how-the-domain-name-system-works",
    });
    expect(result.topic).toBe("DNS hierarchy and caching");
    expect(result.referenceUrls).toHaveLength(1);
  });
});

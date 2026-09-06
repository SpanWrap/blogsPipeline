import { describe, expect, it } from "vitest";
import { extractBalancedJson, extractJson } from "@/utils/llm-json";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"title":"Hello"}')).toEqual({ title: "Hello" });
  });

  it("parses fenced JSON with preamble", () => {
    const text = `Sure!\n\`\`\`json\n{"title":"DNS","content":"A { brace } inside"}\n\`\`\`\n`;
    expect(extractJson(text)).toEqual({ title: "DNS", content: "A { brace } inside" });
  });

  it("uses balanced braces when content contains }", () => {
    const text = `Here you go:\n{"title":"X","content":"code uses } here","tags":["a"]}\nThanks`;
    expect(extractJson(text)).toEqual({
      title: "X",
      content: "code uses } here",
      tags: ["a"],
    });
  });

  it("repairs trailing commas", () => {
    expect(extractJson('{"title":"Hi","tags":["a",],}')).toEqual({
      title: "Hi",
      tags: ["a"],
    });
  });

  it("throws a clear error when empty", () => {
    expect(() => extractJson("   ")).toThrow(/valid JSON/i);
  });
});

describe("extractBalancedJson", () => {
  it("returns null when truncated", () => {
    expect(extractBalancedJson('{"title":"Hi","content":"unterminated')).toBeNull();
  });
});

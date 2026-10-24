import { describe, expect, it } from "vitest";
import { distributionBoard, mergePublishResults } from "@/services/distribution";
import { readerSummary, type ReaderProfile } from "@/services/reader-profiles";

describe("distribution checklist", () => {
  it("fills every destination as not uploaded", () => {
    const board = distributionBoard();
    expect(board.map((row) => row.destination)).toEqual([
      "spanwrap",
      "medium",
      "devto",
      "hashnode",
      "wordpress",
      "substack",
      "reddit",
      "linkedin",
    ]);
    expect(board.every((row) => row.status === "not_sent")).toBe(true);
  });

  it("records a successful push and leaves unconfigured sites untouched", () => {
    const board = mergePublishResults(undefined, [
      {
        target: "spanwrap",
        success: true,
        message: "ok",
        externalId: "post-1",
      },
      {
        target: "medium",
        success: false,
        statusCode: 501,
        message: "not configured",
      },
    ]);
    expect(board.find((row) => row.destination === "spanwrap")).toMatchObject({
      status: "sent",
      externalId: "post-1",
    });
    expect(board.find((row) => row.destination === "medium")?.status).toBe("not_sent");
  });
});

describe("reader profiles", () => {
  it("builds the audience string used in the brief", () => {
    const profile: ReaderProfile = {
      id: "senior-backend",
      label: "Senior backend engineers",
      audience: "senior backend engineers",
      seniority: "senior",
      stack: "APIs and databases",
      goal: "practical implementation guidance",
    };
    expect(readerSummary(profile)).toBe(
      "senior backend engineers. Seniority: senior. Stack: APIs and databases. They want: practical implementation guidance",
    );
  });
});
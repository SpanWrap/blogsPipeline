import { describe, expect, it } from "vitest";
import { nextCronTime, parseCronExpression } from "@/services/scheduler";

describe("autopilot cron", () => {
  it("computes the next Monday 08:00 UTC", () => {
    const fields = parseCronExpression("0 8 * * 1");
    const after = new Date("2026-09-01T12:00:00.000Z"); // Tuesday
    const next = nextCronTime(after, fields);
    expect(next.toISOString()).toBe("2026-09-07T08:00:00.000Z");
  });
});

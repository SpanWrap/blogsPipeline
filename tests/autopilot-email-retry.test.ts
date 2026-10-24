import { describe, expect, it } from "vitest";
import { emailDeliveryFromResult, recordEmailDelivery } from "@/services/autopilot-email-retry";
import { newCycleLog } from "@/services/autopilot-log";

describe("autopilot email delivery", () => {
  it("records a Brevo failure on the cycle and queues a retry", () => {
    const cycle = newCycleLog();
    const delivery = emailDeliveryFromResult("run-1", {
      sent: false,
      error: "unrecognised IP address 13.234.23.23",
    });
    recordEmailDelivery(cycle, delivery);

    expect(cycle.email?.status).toBe("failed");
    expect(cycle.email?.queued).toBe(true);
    expect(cycle.email?.attempts).toBe(1);
    expect(cycle.email?.nextRetryAt).toBeTruthy();
    expect(cycle.errors[0]).toContain("unrecognised IP address");
  });

  it("stops queueing after the last backoff and clears the error once sent", () => {
    let previous = emailDeliveryFromResult("run-1", { sent: false, error: "blocked" });
    for (let i = 0; i < 4; i++) {
      previous = emailDeliveryFromResult("run-1", { sent: false, error: "blocked" }, previous);
    }
    expect(previous.attempts).toBe(5);
    expect(previous.queued).toBe(true);

    previous = emailDeliveryFromResult("run-1", { sent: false, error: "blocked" }, previous);
    expect(previous.attempts).toBe(6);
    expect(previous.queued).toBe(false);

    const cycle = newCycleLog();
    recordEmailDelivery(cycle, previous);
    const sent = emailDeliveryFromResult(
      "run-1",
      { sent: true, messageId: "msg-1" },
      cycle.email,
    );
    recordEmailDelivery(cycle, sent);
    expect(cycle.email?.status).toBe("sent");
    expect(cycle.email?.queued).toBe(false);
    expect(cycle.errors).toEqual([]);
  });
});

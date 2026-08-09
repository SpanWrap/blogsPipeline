import { appConfig } from "@/config";
import type { Publisher } from "./types";
import { MockPublisher } from "./mock";
import { SpanwrapPublisher } from "./spanwrap";

export function createPublisher(override?: "auto" | "spanwrap" | "mock"): Publisher {
  if (override === "mock") return new MockPublisher();
  if (override === "spanwrap") return new SpanwrapPublisher();
  if (process.env.PUBLISHER === "mock" || !appConfig.spanwrap.apiKey) {
    return new MockPublisher();
  }
  return new SpanwrapPublisher();
}

export type { Publisher } from "./types";
export { MockPublisher, resetMockPublisherState } from "./mock";
export { SpanwrapPublisher } from "./spanwrap";

import { appConfig } from "../../config";
import type { PublishTarget } from "../../models";
import type { Publisher } from "./types";
import { MockPublisher } from "./mock";
import { SpanwrapPublisher } from "./spanwrap";
import { MediumPublisher } from "./medium";
import { DevtoPublisher } from "./devto";
import { HashnodePublisher } from "./hashnode";
import { WordPressPublisher } from "./wordpress";
import { SubstackPublisher } from "./substack";

export function createPublisher(override?: "auto" | "spanwrap" | "mock"): Publisher {
  if (override === "mock") return new MockPublisher();
  if (override === "spanwrap") return new SpanwrapPublisher();
  if (process.env.PUBLISHER === "mock" || !appConfig.spanwrap.apiKey) {
    return new MockPublisher();
  }
  return new SpanwrapPublisher();
}

export function createPublisherForTarget(target: PublishTarget): Publisher {
  switch (target) {
    case "spanwrap":
      return createPublisher();
    case "medium":
      return new MediumPublisher();
    case "devto":
      return new DevtoPublisher();
    case "hashnode":
      return new HashnodePublisher();
    case "wordpress":
      return new WordPressPublisher();
    case "substack":
      return new SubstackPublisher();
    default:
      throw new Error(`Unknown publish target: ${target satisfies never}`);
  }
}

export type { Publisher } from "./types";
export { MockPublisher, resetMockPublisherState } from "./mock";
export { SpanwrapPublisher } from "./spanwrap";
export { MediumPublisher } from "./medium";
export { DevtoPublisher } from "./devto";
export { HashnodePublisher } from "./hashnode";
export { WordPressPublisher } from "./wordpress";
export { SubstackPublisher } from "./substack";

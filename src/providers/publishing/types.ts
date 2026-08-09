import type { PublishResult, PublishableBlog } from "@/models";

export interface Publisher {
  readonly name: string;
  publish(
    blog: PublishableBlog,
    options: { idempotencyKey: string },
  ): Promise<PublishResult>;
}

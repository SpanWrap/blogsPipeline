import type { z } from "zod";

export type JsonSchemaLike = Record<string, unknown> | z.ZodTypeAny;

export type StreamTextOptions = {
  system?: string;
  signal?: AbortSignal;
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateText(prompt: string): Promise<string>;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { system?: string },
  ): Promise<T>;
  /** Optional: stream plain text deltas for live UI drafting. */
  streamText?(
    prompt: string,
    onDelta: (chunk: string) => void | Promise<void>,
    options?: StreamTextOptions,
  ): Promise<string>;
}

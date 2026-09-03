import type { z } from "zod";

export type JsonSchemaLike = Record<string, unknown> | z.ZodTypeAny;

export type StreamTextOptions = {
  system?: string;
  signal?: AbortSignal;
};

export type GenerateTextOptions = {
  system?: string;
  /** Cap output length — critical for Quick Edit latency. */
  maxTokens?: number;
  temperature?: number;
  /** Override default request timeout (ms). */
  timeoutMs?: number;
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateText(prompt: string, options?: GenerateTextOptions): Promise<string>;
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

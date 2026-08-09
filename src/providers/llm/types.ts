import type { z } from "zod";

export type JsonSchemaLike = Record<string, unknown> | z.ZodTypeAny;

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generateText(prompt: string): Promise<string>;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: { system?: string },
  ): Promise<T>;
}

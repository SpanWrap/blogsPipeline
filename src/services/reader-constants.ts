/** Stored defaultProfileId when the daily draft should not target one persona. */
export const NO_READER_ID = "none";

export const NO_READER_LABEL = "No reader";

/** Brief audience sent to the model so it does not invent a single reader type. */
export const NO_READER_AUDIENCE = "No specific reader. Let the topic decide the angle.";

export const NO_READER_PROMPT =
  "Reader: none. Do not aim this article at one job title, seniority, or persona. Let the topic decide the angle, examples, and depth.";

export function isNoReaderAudience(value: string | null | undefined): boolean {
  return value === NO_READER_AUDIENCE;
}

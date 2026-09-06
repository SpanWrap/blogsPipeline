/**
 * Extract a JSON value from messy LLM output (fences, preamble, trailing text).
 */
export function extractJson(text: string): unknown {
  const cleaned = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();
  if (!cleaned) {
    throw new Error("LLM response did not contain valid JSON");
  }

  const attempts: string[] = [];

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());
  attempts.push(cleaned);

  const balanced = extractBalancedJson(cleaned);
  if (balanced) attempts.push(balanced);

  // Fallback: first `{` through last `}` (legacy behavior)
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    attempts.push(cleaned.slice(start, end + 1));
  }
  const aStart = cleaned.indexOf("[");
  const aEnd = cleaned.lastIndexOf("]");
  if (aStart >= 0 && aEnd > aStart) {
    attempts.push(cleaned.slice(aStart, aEnd + 1));
  }

  const seen = new Set<string>();
  for (const candidate of attempts) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const parsed = tryParseJson(candidate);
    if (parsed !== undefined) return parsed;
  }

  throw new Error("LLM response did not contain valid JSON");
}

function tryParseJson(raw: string): unknown | undefined {
  const variants = [raw, repairCommonJsonIssues(raw)];
  for (const variant of variants) {
    try {
      return JSON.parse(variant);
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function repairCommonJsonIssues(raw: string): string {
  return raw
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\r\n/g, "\\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

/** Walk the string and return the first balanced `{...}` or `[...]` object/array. */
export function extractBalancedJson(text: string): string | null {
  const startObj = text.indexOf("{");
  const startArr = text.indexOf("[");
  let start = -1;
  let open = "";
  let close = "";
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) {
    start = startObj;
    open = "{";
    close = "}";
  } else if (startArr >= 0) {
    start = startArr;
    open = "[";
    close = "]";
  } else {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

import slugifyLib from "slugify";

export function toSlug(input: string): string {
  const slug = slugifyLib(input, {
    lower: true,
    strict: true,
    trim: true,
  });
  return slug || "untitled-post";
}

export function ensureUniqueSlug(base: string, existing: string[] = []): string {
  const candidate = toSlug(base);
  if (!existing.includes(candidate)) return candidate;
  let i = 2;
  while (existing.includes(`${candidate}-${i}`)) i += 1;
  return `${candidate}-${i}`;
}

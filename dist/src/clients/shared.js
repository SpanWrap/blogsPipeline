export const AI_TOPIC_PATTERN = /\b(ai|a\.i\.|ml|llm|gpt|openai|anthropic|claude|gemini|huggingface|pytorch|tensorflow|cuda|neural|transformer|diffusion|agentic|machine[- ]?learning|deep[- ]?learning|generative|chatgpt|ollama|langchain)\b/i;
export function looksLikeAiTopic(text) {
    return AI_TOPIC_PATTERN.test(text);
}
export function parseCompactCount(raw) {
    const text = raw.replace(/,/g, "").trim();
    const match = text.match(/([\d.]+)\s*([kKmMbB])?/);
    if (!match)
        return 0;
    const n = Number.parseFloat(match[1]);
    if (!Number.isFinite(n))
        return 0;
    const suffix = (match[2] ?? "").toLowerCase();
    const mul = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    return Math.round(n * mul);
}

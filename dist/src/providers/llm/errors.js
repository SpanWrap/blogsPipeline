function extractErrorMessage(body) {
    const raw = body.trim();
    try {
        const json = JSON.parse(raw);
        return json.error?.message || json.message || raw;
    }
    catch {
        return raw;
    }
}
function tpmCounts(message) {
    const match = message.match(/Limit\s+(\d+)[\s\S]*?Requested\s+(\d+)/i);
    if (!match)
        return null;
    return { limit: Number(match[1]), requested: Number(match[2]) };
}
export function isPromptTooLargeError(status, message) {
    return (status === 413 ||
        /request too large|reduce your message size|tokens per minute|\(TPM\)/i.test(message));
}
/** Turn provider HTTP bodies (Groq TPM 413, etc.) into an actionable UI/run error. */
export function formatLlmHttpError(status, body, model) {
    const message = extractErrorMessage(body);
    if (isPromptTooLargeError(status, message)) {
        const modelLabel = model ? ` (${model})` : "";
        const counts = tpmCounts(message);
        const size = counts
            ? ` This request used ${counts.requested.toLocaleString()} tokens; the cap is ${counts.limit.toLocaleString()} tokens per minute.`
            : "";
        return (`Prompt too large for this LLM${modelLabel}.${size} ` +
            `Shorten the article template (headings and brief instructions only — not a full sample post), ` +
            `trim research/source text, or switch to a model with a higher input/TPM limit.`);
    }
    if (status === 404 && /model_not_found|does not exist/i.test(message)) {
        return `Model "${model ?? "unknown"}" is unavailable. Open Settings and pick a current model (Groq: openai/gpt-oss-20b).`;
    }
    return `LLM HTTP ${status}: ${message.slice(0, 300)}`;
}

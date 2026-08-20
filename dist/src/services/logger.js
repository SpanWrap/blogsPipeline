const SENSITIVE = /(api[_-]?key|password|secret|token|authorization|bearer)/i;
function redact(value) {
    if (typeof value === "string") {
        if (SENSITIVE.test(value) && value.length > 8)
            return "[redacted]";
        return value;
    }
    if (Array.isArray(value))
        return value.map(redact);
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
        }
        return out;
    }
    return value;
}
function log(level, message, meta) {
    const entry = {
        level,
        message,
        time: new Date().toISOString(),
        ...(meta ? { meta: redact(meta) } : {}),
    };
    const line = JSON.stringify(entry);
    if (level === "error")
        console.error(line);
    else if (level === "warn")
        console.warn(line);
    else
        console.log(line);
}
export const logger = {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
};

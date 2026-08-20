/** Process-local TTL cache. Fine for the UI server; empty on each Vercel isolate. */
export class TtlCache {
    ttlMs;
    store = new Map();
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() >= entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value) {
        this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    }
    clear() {
        this.store.clear();
    }
}

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { logger } from "./logger";
const AffiliateMappingSchema = z.object({
    name: z.string(),
    url: z.string().url(),
    aliases: z.array(z.string()).optional(),
});
const AffiliateConfigSchema = z.object({
    links: z.array(AffiliateMappingSchema),
    maxLinksPerTool: z.number().int().positive().optional(),
    maxTotalLinks: z.number().int().positive().optional(),
});
const DEFAULT_LINKS = [
    { name: "AWS", url: "https://aws.amazon.com", aliases: ["Amazon Web Services"] },
    { name: "Vercel", url: "https://vercel.com" },
    { name: "Netlify", url: "https://netlify.com" },
    { name: "GitHub", url: "https://github.com" },
    { name: "DigitalOcean", url: "https://digitalocean.com", aliases: ["Digital Ocean"] },
    { name: "Cloudflare", url: "https://cloudflare.com" },
    { name: "Supabase", url: "https://supabase.com" },
    { name: "PlanetScale", url: "https://planetscale.com" },
    { name: "Railway", url: "https://railway.app" },
    { name: "Render", url: "https://render.com" },
];
export function loadAffiliateConfig() {
    const absPath = path.join(process.cwd(), ".data", "affiliate-links.json");
    if (fs.existsSync(absPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(absPath, "utf-8"));
            const parsed = AffiliateConfigSchema.parse(raw);
            logger.info("Loaded affiliate config from file", { path: absPath, count: parsed.links.length });
            return parsed;
        }
        catch (err) {
            logger.warn("Failed to parse affiliate config file, trying env fallback", {
                error: String(err),
            });
        }
    }
    const envJson = process.env.AFFILIATE_LINKS_JSON;
    if (envJson) {
        try {
            const parsed = AffiliateConfigSchema.parse(JSON.parse(envJson));
            logger.info("Loaded affiliate config from env", { count: parsed.links.length });
            return parsed;
        }
        catch (err) {
            logger.warn("Failed to parse AFFILIATE_LINKS_JSON env", { error: String(err) });
        }
    }
    return { links: DEFAULT_LINKS };
}
export function injectAffiliateLinks(content, config) {
    const cfg = config ?? loadAffiliateConfig();
    const maxPerTool = cfg.maxLinksPerTool ?? 1;
    const maxTotal = cfg.maxTotalLinks ?? 10;
    const injected = [];
    let result = content;
    let totalInjected = 0;
    for (const mapping of cfg.links) {
        if (totalInjected >= maxTotal)
            break;
        const names = [mapping.name, ...(mapping.aliases ?? [])];
        let toolCount = 0;
        for (const name of names) {
            if (toolCount >= maxPerTool || totalInjected >= maxTotal)
                break;
            // Match the tool name that is NOT already inside a markdown link.
            // Negative lookbehind for `[` or `(` to avoid replacing inside existing links.
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`(?<!\\[)(?<!\\()\\b(${escaped})\\b(?!\\])(?!\\))`, "g");
            let replaced = false;
            result = result.replace(re, (_match, toolName) => {
                if (toolCount >= maxPerTool || totalInjected >= maxTotal)
                    return toolName;
                toolCount++;
                totalInjected++;
                replaced = true;
                return `[${toolName}](${mapping.url})`;
            });
            if (replaced) {
                injected.push({ tool: mapping.name, url: mapping.url, count: toolCount });
            }
        }
    }
    logger.info("Affiliate links injected", { total: totalInjected });
    return { content: result, linksInjected: injected };
}

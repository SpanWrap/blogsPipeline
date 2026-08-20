import { isValidHttpUrl } from "./url";
const MD_IMAGE = /!\[[^\]]*]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;
export function extractMarkdownImageUrls(markdown) {
    const urls = [];
    const re = new RegExp(MD_IMAGE.source, "gi");
    let match;
    while ((match = re.exec(markdown))) {
        const url = match[1]?.trim();
        if (url && isValidHttpUrl(url))
            urls.push(url);
    }
    return urls;
}
export function githubOpenGraphImage(url) {
    try {
        const parsed = new URL(url);
        if (!/^(www\.)?github\.com$/i.test(parsed.hostname))
            return null;
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length < 2)
            return null;
        return `https://opengraph.githubassets.com/1/${parts[0]}/${parts[1]}`;
    }
    catch {
        return null;
    }
}
export function resolveFeaturedImage(input) {
    const explicit = input.featuredImage?.trim();
    if (explicit && isValidHttpUrl(explicit))
        return explicit;
    const fromBody = extractMarkdownImageUrls(input.content ?? "")[0];
    if (fromBody)
        return fromBody;
    for (const url of input.sourceUrls ?? []) {
        const og = githubOpenGraphImage(url);
        if (og)
            return og;
    }
    return null;
}

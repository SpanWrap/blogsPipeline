/**
 * Uses provided reference URLs as primary discoveries.
 */
export class DirectURLProvider {
    name = "direct-url";
    async discover(brief) {
        return (brief.referenceUrls ?? []).map((url, index) => ({
            url,
            title: `Reference ${index + 1}`,
            snippet: brief.topic,
            relevanceScore: 0.95,
        }));
    }
}

import { appConfig } from "../../config";
import { DevToTrendProvider, GitHubTrendProvider, HackerNewsTrendProvider, MockTrendProvider, RedditTrendProvider, XTrendProvider, } from "./sources";
import { ArxivTrendProvider, HuggingFacePapersProvider, LobstersTrendProvider, NewsRssTrendProvider, } from "./feeds";
export { DevToTrendProvider, GitHubTrendProvider, HackerNewsTrendProvider, MockTrendProvider, RedditTrendProvider, XTrendProvider, parseGitHubTrendingHtml, parseRedditListingHtml, redditTopUrls, parseCompactCount, } from "./sources";
export { ArxivTrendProvider, HuggingFacePapersProvider, LobstersTrendProvider, NewsRssTrendProvider, parseRssOrAtom, decodeXml, } from "./feeds";
export function createTrendProviders(names = appConfig.trends.sources) {
    const map = {
        hackernews: () => new HackerNewsTrendProvider(),
        hn: () => new HackerNewsTrendProvider(),
        github: () => new GitHubTrendProvider(),
        reddit: () => new RedditTrendProvider(),
        x: () => new XTrendProvider(),
        twitter: () => new XTrendProvider(),
        devto: () => new DevToTrendProvider(),
        arxiv: () => new ArxivTrendProvider(),
        huggingface: () => new HuggingFacePapersProvider(),
        hf: () => new HuggingFacePapersProvider(),
        lobsters: () => new LobstersTrendProvider(),
        news: () => new NewsRssTrendProvider(),
        mock: () => new MockTrendProvider(),
    };
    const providers = [];
    for (const name of names) {
        const factory = map[name];
        if (factory)
            providers.push(factory());
    }
    if (providers.length === 0) {
        providers.push(new MockTrendProvider());
    }
    return providers;
}

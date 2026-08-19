import { appConfig } from "../config";
import { logger } from "./logger";
import { withRetry } from "../utils/retry";

export type ArticleInput = {
  title: string;
  slug: string;
  excerpt?: string;
  tags?: string[];
};

export type PromotionResult = {
  platform: string;
  success: boolean;
  message: string;
  url?: string;
};

export type PromotionContent = {
  tweet: string;
  linkedInPost: string;
  redditTitle: string;
  redditBody: string;
};

function articleUrl(slug: string): string {
  const base = appConfig.social.blogBaseUrl.replace(/\/$/, "");
  return `${base}/${slug}`;
}

export function generatePromotionContent(article: ArticleInput): PromotionContent {
  const url = articleUrl(article.slug);
  const tags = (article.tags ?? []).slice(0, 3).map((t) => `#${t.replace(/\s+/g, "")}`);
  const excerpt = article.excerpt ?? "";

  // Tweet: max 280 chars
  const tagStr = tags.join(" ");
  let tweet = `${article.title}\n\n${url}`;
  if ((tweet + "\n\n" + tagStr).length <= 280) {
    tweet = `${article.title}\n\n${url}\n\n${tagStr}`;
  }
  if (tweet.length > 280) tweet = tweet.slice(0, 277) + "...";

  const linkedInPost = [
    article.title,
    "",
    excerpt.slice(0, 300) || "Check out my latest article:",
    "",
    url,
    "",
    tags.join(" "),
  ].join("\n").trim();

  const redditTitle = article.title;
  const redditBody = [
    excerpt || `I wrote about ${article.title.toLowerCase()}.`,
    "",
    `Full article: ${url}`,
  ].join("\n");

  return { tweet, linkedInPost, redditTitle, redditBody };
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  return withRetry(
    async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`), {
          status: res.status,
        });
      }
      return res;
    },
    { maxAttempts: 2 },
  );
}

export async function promoteTweet(article: ArticleInput): Promise<PromotionResult> {
  const { xApiKey, xApiSecret, xAccessToken, xAccessSecret } = appConfig.social;
  if (!xApiKey || !xApiSecret || !xAccessToken || !xAccessSecret) {
    return { platform: "twitter", success: false, message: "Missing X/Twitter API credentials" };
  }

  const { tweet } = generatePromotionContent(article);
  try {
    // Twitter API v2 OAuth 2.0 Bearer or OAuth 1.0a — simplified to Bearer here.
    // A full implementation would use OAuth 1.0a HMAC-SHA1 signing.
    await postJson("https://api.twitter.com/2/tweets", { text: tweet }, {
      Authorization: `Bearer ${xAccessToken}`,
    });
    logger.info("Posted to Twitter", { slug: article.slug });
    return { platform: "twitter", success: true, message: "Posted successfully" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Twitter promotion failed", { error: msg });
    return { platform: "twitter", success: false, message: msg };
  }
}

export async function promoteLinkedIn(article: ArticleInput): Promise<PromotionResult> {
  const { linkedinAccessToken } = appConfig.social;
  if (!linkedinAccessToken) {
    return { platform: "linkedin", success: false, message: "Missing LinkedIn access token" };
  }

  const { linkedInPost } = generatePromotionContent(article);
  try {
    await postJson(
      "https://api.linkedin.com/v2/ugcPosts",
      {
        author: "urn:li:person:me",
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: linkedInPost },
            shareMediaCategory: "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      },
      { Authorization: `Bearer ${linkedinAccessToken}` },
    );
    logger.info("Posted to LinkedIn", { slug: article.slug });
    return { platform: "linkedin", success: true, message: "Posted successfully" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("LinkedIn promotion failed", { error: msg });
    return { platform: "linkedin", success: false, message: msg };
  }
}

export async function promoteReddit(
  article: ArticleInput,
  subreddit: string,
): Promise<PromotionResult> {
  const { redditClientId, redditClientSecret, redditUsername, redditPassword } = appConfig.social;
  if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
    return { platform: "reddit", success: false, message: "Missing Reddit API credentials" };
  }

  try {
    // Obtain OAuth token
    const authRes = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${redditClientId}:${redditClientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=password&username=${encodeURIComponent(redditUsername)}&password=${encodeURIComponent(redditPassword)}`,
    });
    if (!authRes.ok) throw new Error(`Reddit auth failed: ${authRes.status}`);
    const authData = (await authRes.json()) as { access_token: string };

    const { redditTitle, redditBody } = generatePromotionContent(article);
    await postJson(
      "https://oauth.reddit.com/api/submit",
      {
        sr: subreddit,
        kind: "self",
        title: redditTitle,
        text: redditBody,
      },
      { Authorization: `Bearer ${authData.access_token}`, "User-Agent": "SpanwrapBot/1.0" },
    );
    logger.info("Posted to Reddit", { slug: article.slug, subreddit });
    return { platform: "reddit", success: true, message: `Posted to r/${subreddit}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Reddit promotion failed", { error: msg });
    return { platform: "reddit", success: false, message: msg };
  }
}

export async function promoteAll(
  article: ArticleInput,
  subreddit = "programming",
): Promise<PromotionResult[]> {
  const results = await Promise.allSettled([
    promoteTweet(article),
    promoteLinkedIn(article),
    promoteReddit(article, subreddit),
  ]);
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { platform: "unknown", success: false, message: String(r.reason) },
  );
}

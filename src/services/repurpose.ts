import { appConfig } from "../config";
import { generatePromotionContent, type ArticleInput, type PromotionContent } from "./social-promotion";

export type RepurposePack = PromotionContent & {
  newsletterBlurb: string;
  youtubeShortOutline: string[];
  thread: string[];
};

export function buildRepurposePack(article: ArticleInput & { content?: string }): RepurposePack {
  const base = generatePromotionContent(article);
  const url = `${appConfig.social.blogBaseUrl.replace(/\/$/, "")}/${article.slug}`;
  const excerpt = article.excerpt ?? "";
  const newsletterBlurb = [
    `**${article.title}**`,
    "",
    excerpt || `New post on ${article.title}.`,
    "",
    `[Read the full article →](${url})`,
  ].join("\n");

  const sentences = (article.content || excerpt)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s+/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .slice(0, 5);

  const thread = [
    `${article.title}`,
    ...sentences.slice(0, 4),
    `Full write-up: ${url}`,
  ].map((t, i, arr) => `${i + 1}/${arr.length} ${t}`.slice(0, 280));

  const youtubeShortOutline = [
    `Hook: ${article.title}`,
    `Problem in 10s`,
    `One concrete tactic`,
    `Mistake to avoid`,
    `CTA: ${url}`,
  ];

  return {
    ...base,
    newsletterBlurb,
    youtubeShortOutline,
    thread,
  };
}

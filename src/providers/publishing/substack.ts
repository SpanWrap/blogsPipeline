import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { appConfig } from "../../config";
import type { PublishResult, PublishableBlog } from "../../models";
import { logger } from "../../services/logger";
import type { Publisher } from "./types";

function toEmailHtml(blog: PublishableBlog): string {
  const lines = [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(blog.title)}</title>`,
    "<style>body{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:20px;line-height:1.7;color:#1a1a1a}",
    "h1{font-size:28px}h2{font-size:22px}h3{font-size:18px}",
    "img{max-width:100%;height:auto}blockquote{border-left:3px solid #ccc;margin-left:0;padding-left:16px;color:#555}",
    "a{color:#0066cc}</style></head><body>",
  ];

  if (blog.featuredImage) {
    lines.push(`<img src="${escapeHtml(blog.featuredImage)}" alt="${escapeHtml(blog.title)}" />`);
  }

  lines.push(`<h1>${escapeHtml(blog.title)}</h1>`);
  lines.push(`<p><em>${escapeHtml(blog.excerpt)}</em></p>`);
  lines.push("<hr>");
  lines.push(blog.content);

  if (blog.sources.length > 0) {
    lines.push("<hr><h3>Sources</h3><ul>");
    for (const s of blog.sources) {
      lines.push(`<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a></li>`);
    }
    lines.push("</ul>");
  }

  lines.push("</body></html>");
  return lines.join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class SubstackPublisher implements Publisher {
  readonly name = "substack";

  private get draftsDir() {
    return appConfig.publishing.substack.draftsDir;
  }

  async publish(
    blog: PublishableBlog,
    options: { idempotencyKey: string },
  ): Promise<PublishResult> {
    try {
      const dir = path.isAbsolute(this.draftsDir)
        ? this.draftsDir
        : path.join(process.cwd(), this.draftsDir);

      await mkdir(dir, { recursive: true });

      const filename = `${blog.slug}.html`;
      const filePath = path.join(dir, filename);
      const html = toEmailHtml(blog);

      await writeFile(filePath, html, "utf-8");
      logger.info("Substack draft exported", { path: filePath });

      return {
        success: true,
        externalId: filePath,
        statusCode: 200,
        message: `Substack draft saved to ${filePath}. Manual upload to Substack is required.`,
        idempotencyKey: options.idempotencyKey,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Substack draft export failed",
        idempotencyKey: options.idempotencyKey,
      };
    }
  }
}

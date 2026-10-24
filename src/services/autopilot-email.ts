import type { PipelineRun } from "../models";
import { appConfig } from "../config";
import { logger } from "./logger";
import { getEmailNotifySettings } from "./email-notify-settings";
import { sendBrevoEmail } from "../providers/email/brevo";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMarkdownAttachment(run: PipelineRun): { name: string; content: string; markdown: string } | null {
  const article = run.article;
  if (!article?.content?.trim()) return null;

  const parts = [
    `# ${article.title || "Untitled"}`,
    "",
    article.excerpt ? `> ${article.excerpt}\n` : "",
    article.content.trim(),
    "",
  ];
  if (article.sources?.length) {
    parts.push("## Sources", "");
    for (const s of article.sources) {
      parts.push(`- [${s.title || s.url}](${s.url})`);
    }
    parts.push("");
  }

  const markdown = parts.filter((p, i) => !(p === "" && parts[i - 1] === "")).join("\n");
  const slug = (article.slug || run.id || "draft").replace(/[^a-z0-9-_]+/gi, "-");
  // Brevo rejects a .md attachment ("Unsupported file format: md").
  return {
    name: `${slug}.txt`,
    content: Buffer.from(markdown, "utf8").toString("base64"),
    markdown,
  };
}

/**
 * Email an Autopilot draft (markdown attachment) via Brevo when configured.
 * Safe to call always — no-ops when disabled / missing credentials / no recipients.
 */
export async function notifyAutopilotDraftEmail(run: PipelineRun): Promise<{
  sent: boolean;
  skipped?: string;
  error?: string;
  messageId?: string;
}> {
  const settings = await getEmailNotifySettings();
  if (!settings.enabled) {
    return { sent: false, skipped: "email notify disabled" };
  }
  if (!appConfig.brevo.apiKey || !appConfig.brevo.senderEmail) {
    return { sent: false, skipped: "Brevo credentials not configured" };
  }
  if (!settings.recipients.length) {
    return { sent: false, skipped: "no email recipients configured" };
  }

  const attachment = buildMarkdownAttachment(run);
  if (!attachment) {
    return { sent: false, skipped: "no article content to attach" };
  }

  const title = run.article?.title || run.brief?.topic || "Untitled draft";
  const quality = run.quality
    ? `Quality ${run.quality.score} (${run.quality.passed ? "pass" : "flag"})`
    : "Quality not scored";
  const status = run.status;
  const reader =
    run.autopilotSource?.readerLabel || run.brief?.targetAudience || "—";
  const reviewUrl = `${appConfig.publicUrl}/?run=${encodeURIComponent(run.id)}`;

  const subject = `[Autopilot] Draft ready: ${title}`.slice(0, 200);
  const htmlContent = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#1c1915">
      <h2 style="margin:0 0 0.5rem">${escapeHtml(title)}</h2>
      <p style="margin:0 0 1rem;color:#5f574c">
        A Spanwrap draft is ready for review. Nothing has been published.
        Open the pipeline and click <strong>Publish to Spanwrap</strong> when you want it on the site.
      </p>
      <ul>
        <li><strong>Run ID:</strong> ${escapeHtml(run.id)}</li>
        <li><strong>Status:</strong> ${escapeHtml(status)}</li>
        <li><strong>Reader:</strong> ${escapeHtml(String(reader))}</li>
        <li><strong>Quality:</strong> ${escapeHtml(quality)}</li>
        ${run.article?.slug ? `<li><strong>Slug:</strong> ${escapeHtml(run.article.slug)}</li>` : ""}
      </ul>
      ${
        run.article?.excerpt
          ? `<p style="margin:1rem 0;padding:0.75rem 1rem;background:#f7f2e8;border-radius:8px">${escapeHtml(run.article.excerpt)}</p>`
          : ""
      }
      <p><a href="${escapeHtml(reviewUrl)}">Review this draft</a></p>
      <p style="color:#5f574c;font-size:0.9rem">The markdown draft is attached as a .txt file. Other sites stay on the checklist until you push or mark them.</p>
    </div>
  `.trim();

  const result = await sendBrevoEmail({
    to: settings.recipients.map((email) => ({ email })),
    subject,
    htmlContent,
    textContent: [
      title,
      "",
      `Run: ${run.id}`,
      `Status: ${status}`,
      `Reader: ${reader}`,
      quality,
      "Nothing is published until you send it to Spanwrap.",
      `Review: ${reviewUrl}`,
      "",
      run.article?.excerpt || "",
      "",
      `Attachment: ${attachment.name}`,
    ]
      .filter(Boolean)
      .join("\n"),
    attachment: [{ name: attachment.name, content: attachment.content }],
  });

  if (!result.ok) {
    logger.warn("Autopilot draft email failed", {
      runId: run.id,
      error: result.error,
      status: result.status,
    });
    return { sent: false, error: result.error };
  }

  logger.info("Autopilot draft email sent", {
    runId: run.id,
    messageId: result.messageId,
    recipients: settings.recipients.length,
    attachment: attachment.name,
  });
  return { sent: true, messageId: result.messageId };
}

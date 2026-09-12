import { appConfig } from "../../config";
import { logger } from "../../services/logger";

export type BrevoRecipient = { email: string; name?: string };

export type BrevoAttachment = {
  /** File name shown to the recipient, e.g. draft.md */
  name: string;
  /** Base64-encoded file bytes */
  content: string;
};

export type BrevoSendInput = {
  to: BrevoRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  attachment?: BrevoAttachment[];
};

export type BrevoSendResult = {
  ok: boolean;
  messageId?: string;
  status?: number;
  error?: string;
};

/**
 * Send a transactional email via Brevo (Sendinblue) SMTP API.
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 */
export async function sendBrevoEmail(input: BrevoSendInput): Promise<BrevoSendResult> {
  const apiKey = appConfig.brevo.apiKey;
  const senderEmail = appConfig.brevo.senderEmail;
  if (!apiKey) {
    return { ok: false, error: "BREVO_API_KEY is not configured" };
  }
  if (!senderEmail) {
    return { ok: false, error: "BREVO_SENDER_EMAIL is not configured" };
  }
  if (!input.to.length) {
    return { ok: false, error: "No recipients" };
  }

  const payload = {
    sender: {
      email: senderEmail,
      name: appConfig.brevo.senderName || undefined,
    },
    to: input.to.map((r) => ({
      email: r.email,
      ...(r.name ? { name: r.name } : {}),
    })),
    subject: input.subject,
    htmlContent: input.htmlContent,
    ...(input.textContent ? { textContent: input.textContent } : {}),
    ...(input.attachment?.length ? { attachment: input.attachment } : {}),
  };

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let raw: unknown = text;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }

    if (!response.ok) {
      const message =
        raw && typeof raw === "object" && "message" in raw
          ? String((raw as { message: unknown }).message)
          : `Brevo HTTP ${response.status}`;
      logger.warn("Brevo send failed", { status: response.status, message: message.slice(0, 300) });
      return { ok: false, status: response.status, error: message };
    }

    const messageId =
      raw && typeof raw === "object" && "messageId" in raw
        ? String((raw as { messageId: unknown }).messageId)
        : undefined;
    return { ok: true, status: response.status, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Brevo send error", { error: message.slice(0, 300) });
    return { ok: false, error: message };
  }
}

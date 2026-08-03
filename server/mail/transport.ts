import { createTransport, type Transporter } from "nodemailer";

/* ==========================================================================
   Sending mail

   SMTP rather than a vendor API, because a school that already pays for a
   domain almost always already has a mailbox on it, and the credentials work
   the same whether that is Hostinger, Google Workspace or anything else. One
   env var, no account to open, nothing to migrate off later.

   When SMTP_URL is unset, mail is written to the log instead of sent. That is
   the important part: admissions has to keep working on a box where mail was
   never configured. A school losing an application because its SMTP password
   expired would be a far worse failure than a confirmation email that did not
   arrive, so nothing in this module ever throws into a request.
   ========================================================================== */

export type MailMessage = {
  html: string;
  /** Plain-text alternative. Some school inboxes still prefer it. */
  text: string;
  subject: string;
  to: string;
  /** Set when the sender wants replies to go somewhere else. */
  replyTo?: string;
};

export type MailResult =
  | { delivered: true; messageId: string }
  | { delivered: false; reason: string };

const globalMail = globalThis as typeof globalThis & {
  learnersHubMailTransport?: Transporter | null;
};

function resolveTransport(): Transporter | null {
  if (globalMail.learnersHubMailTransport !== undefined) {
    return globalMail.learnersHubMailTransport;
  }
  const url = process.env.SMTP_URL?.trim();
  globalMail.learnersHubMailTransport = url
    ? createTransport(url)
    : null;
  return globalMail.learnersHubMailTransport;
}

export function mailFrom(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    "Learners Hub <no-reply@localhost>"
  );
}

/** Where applications and enquiries land. Falls back to the admin account. */
export function admissionsInbox(): string | undefined {
  return (
    process.env.ADMISSIONS_INBOX?.trim() ||
    process.env.INITIAL_ADMIN_EMAIL?.trim() ||
    undefined
  );
}

export function mailIsConfigured(): boolean {
  return Boolean(process.env.SMTP_URL?.trim());
}

/**
 * Sends one message, and never throws.
 *
 * Callers get a result they may log or ignore. Nothing about admissions should
 * fail because a mail server was slow, so treat the return value as
 * information rather than as something to branch a submission on.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = resolveTransport();

  if (!transport) {
    /* Loud enough to find in a log, quiet enough not to look like an error —
       an unconfigured mailer on a staging box is expected, not broken. */
    console.info(
      `[mail] not configured, would have sent "${message.subject}" to ${message.to}`,
    );
    return { delivered: false, reason: "SMTP_URL is not configured." };
  }

  try {
    const sent = await transport.sendMail({
      from: mailFrom(),
      html: message.html,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      to: message.to,
    });
    return { delivered: true, messageId: sent.messageId };
  } catch (error) {
    console.error("[mail] send failed", error);
    return {
      delivered: false,
      reason: error instanceof Error ? error.message : "Unknown mail error.",
    };
  }
}

/** Fires several messages together, reporting each outcome. */
export async function sendAll(
  messages: MailMessage[],
): Promise<MailResult[]> {
  return Promise.all(messages.map((message) => sendMail(message)));
}

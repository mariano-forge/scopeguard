// Outgoing e-mails (review invitations, access codes, reminders, agency invitations, password resets).
//
// With MAIL_TRANSPORT=console, mails are only printed in the server console (tests, demos), whatever
// else is set. Otherwise, with RESEND_API_KEY and MAIL_FROM, they go through Resend's HTTP API; without
// them they are printed in development, and elsewhere nothing is sent and the call reports it, so the
// caller can tell the agency to share the link another way.
//
// Every mail goes as HTML with its plain-text version (src/lib/mailTemplates.ts), and with a Reply-To:
// the agency member behind it when there is one, else MAIL_REPLY_TO. The sending address has no
// mailbox; a client's answer reaches a person.

import "server-only";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Where answers go; MAIL_REPLY_TO when not given. */
  replyTo?: string | null;
};

/** Public address of the app, for links in mails. */
export const appUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const replyTo = mail.replyTo || process.env.MAIL_REPLY_TO || undefined;
  // MAIL_TRANSPORT=console wins over everything: tests and demos never send a real mail, even with a
  // Resend key in the environment. Never set it on a public server.
  if (process.env.MAIL_TRANSPORT === "console") return printMail(mail, replyTo);
  if (key && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!response.ok) console.error("[mail] Resend refused the mail:", response.status, await response.text().catch(() => ""));
    return response.ok;
  }
  if (process.env.NODE_ENV === "development") return printMail(mail, replyTo);
  console.warn("[mail] No e-mail provider configured (RESEND_API_KEY, MAIL_FROM): mail not sent.");
  return false;
}

function printMail(mail: Mail, replyTo: string | undefined) {
  console.info(`\n[mail] À : ${mail.to}${replyTo ? `\n[mail] Répondre à : ${replyTo}` : ""}\n[mail] Objet : ${mail.subject}\n${mail.text}\n`);
  return true;
}

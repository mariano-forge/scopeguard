// Outgoing e-mails (review invitations, access codes).
//
// With RESEND_API_KEY and MAIL_FROM set, mails go through Resend's HTTP API. Without them, in
// development (or with MAIL_TRANSPORT=console) the mail is printed in the server console; otherwise
// nothing is sent and the call reports it, so the caller can tell the agency to share the link another way.

import "server-only";

export type Mail = { to: string; subject: string; text: string };

/** Public address of the app, for links in mails. */
export const appUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (key && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) console.error("[mail] Resend refused the mail:", response.status, await response.text().catch(() => ""));
    return response.ok;
  }
  // MAIL_TRANSPORT=console: print mails anywhere (tests, demo on a local build). Never on a public server.
  if (process.env.NODE_ENV === "development" || process.env.MAIL_TRANSPORT === "console") {
    console.info(`\n[mail] À : ${mail.to}\n[mail] Objet : ${mail.subject}\n${mail.text}\n`);
    return true;
  }
  console.warn("[mail] No e-mail provider configured (RESEND_API_KEY, MAIL_FROM): mail not sent.");
  return false;
}

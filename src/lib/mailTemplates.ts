// Layout of Kora's mails, as HTML and plain text. Mail clients only render a narrow, old subset of
// HTML: tables, inline styles, no external image or font (blocked by default and a spam signal).
// Colours are Kora's tokens (ink, graphite, border, canvas, CTA blue) written out.

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

export type MailContent = {
  /** Shown by inboxes next to the subject, hidden in the mail itself. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** One button, with its address written out below for clients that do not show it. */
  action?: { label: string; href: string };
  /** A one-time code, shown large. */
  code?: string;
  /** Why this person receives the mail. */
  footer: string;
};

export function renderMail(content: MailContent): { html: string; text: string } {
  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(content.code ? [`Code : ${content.code}`, ""] : []),
    ...(content.action ? [`${content.action.label} : ${content.action.href}`, ""] : []),
    "—",
    content.footer,
  ].join("\n");

  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#4c4c48">${escapeHtml(paragraph)}</p>`)
    .join("");
  const code = content.code
    ? `<p style="margin:8px 0 24px;font-family:'Courier New',monospace;font-size:32px;line-height:40px;letter-spacing:8px;font-weight:700;color:#111111">${escapeHtml(content.code)}</p>`
    : "";
  const action = content.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td bgcolor="#0079d1" style="border-radius:8px">
        <a href="${escapeHtml(content.action.href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(content.action.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#4c4c48">Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br><a href="${escapeHtml(content.action.href)}" style="color:#005593;word-break:break-all">${escapeHtml(content.action.href)}</a></p>`
    : "";

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:#faf9f6;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf9f6"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td style="padding:0 4px 16px;font-size:18px;font-weight:700;color:#111111">Kora</td></tr>
    <tr><td style="background:#ffffff;border:1px solid #ddd9d1;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#111111">${escapeHtml(content.heading)}</h1>
      ${paragraphs}${code}${action}
    </td></tr>
    <tr><td style="padding:16px 4px 0;font-size:12px;line-height:18px;color:#4c4c48">${escapeHtml(content.footer)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;

  return { html, text };
}

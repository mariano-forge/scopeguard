// The requests of a version, as a printable page (saved as PDF from the browser, like the proof,
// src/app/(agency)/proofDocument.ts): by status, each with its words and its discussion. The agency's
// drafts are left out (they are its own notes).

import { isAgencyDraft, requestKind, requestText, type RequestKind, type ThreadComment } from "./editor/CanvasComments";
import { escapeHtml } from "./proofDocument";

const sections: { kind: RequestKind; label: string }[] = [
  { kind: "correction", label: "Inclus" },
  { kind: "outside", label: "Hors scope" },
  { kind: "comment", label: "À clarifier" },
];

/** « 14 oct. 2026 » for a dated message, nothing for an older one without a date. */
const day = (at: number | undefined) => (at ? new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export function requestsHtml(title: string, comments: ThreadComment[], statusOf: (comment: ThreadComment) => string | null) {
  const shown = comments.filter((comment) => !isAgencyDraft(comment));
  const body = sections
    .map(({ kind, label }) => {
      const list = shown.filter((comment) => requestKind(comment) === kind);
      if (!list.length) return "";
      const items = list
        .map((comment) => {
          const status = statusOf(comment);
          const messages = [{ author: comment.author, message: comment.message, createdAt: comment.createdAt }, ...(comment.replies ?? [])]
            .map((message) => `<p class="message"><b>${escapeHtml(message.author)}</b>${day(message.createdAt) ? ` · ${escapeHtml(day(message.createdAt))}` : ""}<br>${escapeHtml(message.message)}</p>`)
            .join("");
          return `<li><div class="row"><b>${escapeHtml(requestText(comment))}</b>${status ? `<span class="tag">${escapeHtml(status)}</span>` : ""}${comment.closed ? `<span class="tag">Close</span>` : ""}</div>
            <small>${escapeHtml(comment.location)}</small>
            ${comment.description ? `<p class="description">${escapeHtml(comment.description)}</p>` : ""}
            <div class="thread">${messages}</div></li>`;
        })
        .join("");
      return `<h2>${label} · ${list.length}</h2><ul>${items}</ul>`;
    })
    .join("");
  const generated = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "short" });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Demandes · ${escapeHtml(title)}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#111111;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.5;font-size:13px}
    h1{font-size:24px;margin:2px 0 6px}h2{font-size:15px;border-bottom:1px solid #ddd9d1;padding-bottom:6px;margin-top:28px}
    .eyebrow{font-size:11px;letter-spacing:.08em;color:#4c4c48;margin:0}header{border-bottom:2px solid #0079d1;padding-bottom:14px}
    small{display:block;color:#4c4c48;font-size:11px;margin-top:2px}ul{list-style:none;padding:0}
    li{border:1px solid #ddd9d1;border-radius:8px;padding:12px;margin:10px 0;break-inside:avoid}
    .row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.tag{font-size:11px;background:#ecece8;color:#4c4c48;border-radius:4px;padding:1px 6px;white-space:nowrap}
    .description{white-space:pre-line;margin:8px 0 0}.thread{margin-top:10px;border-top:1px solid #ecece8;padding-top:8px}
    .message{margin:6px 0;white-space:pre-line}.message b{font-weight:600}
    button{margin-top:16px;padding:8px 14px;border-radius:8px;border:0;background:#0079d1;color:#fff;font-weight:600;cursor:pointer}
    @media print{body{margin:0}button{display:none}}
  </style></head><body>
  <header><p class="eyebrow">DEMANDES DU LIVRABLE</p><h1>${escapeHtml(title)}</h1><small>Exporté le ${escapeHtml(generated)} (heure de Paris)</small></header>
  <main>${body || "<p>Aucune demande sur cette version.</p>"}</main>
  <button id="print">Imprimer ou enregistrer en PDF</button>
  <script>
    // The page prints itself once drawn (a window asked by another to print may print it blank).
    document.getElementById("print").addEventListener("click", () => window.print());
    window.addEventListener("load", () => setTimeout(() => window.print(), 300));
  </script></body></html>`;
}

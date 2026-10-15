// Printable proof of a deliverable version (opened in its own window, saved as PDF from the browser).
// Everything shown comes from /api/proof (src/db/proof.ts): server times, verified identities, origins.

import type { Proof, ProofEvent } from "@/db/proof";

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

/** Server times, shown in Paris time (the agencies' time zone), to the second. */
const when = (iso: string | null | undefined) =>
  iso ? `${new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "medium" })}` : "—";

const amount = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9]/g, ""));
  return Number.isFinite(number) && number > 0 ? `${number.toLocaleString("fr-FR")} € HT` : "—";
};
const delay = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9]/g, ""));
  return number ? `+ ${number} jour${number > 1 ? "s" : ""}` : "Aucun impact";
};

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} octets` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

const reviewLabels: Record<string, string> = { approved: "Version approuvée", "changes-requested": "Modifications demandées", pending: "En attente du client" };
const quoteLabels: Record<string, string> = { draft: "Brouillon", sent: "Envoyée", superseded: "Remplacée", accepted: "Acceptée", refused: "Refusée" };
const qualificationLabels: Record<string, string> = { "À qualifier": "À qualifier", Inclus: "Inclus dans le périmètre", "Hors périmètre": "Hors périmètre" };

/** "par claire@… le 15 octobre 2026 à 19:20:31 · IP 1.2.3.4" */
function signature(event: ProofEvent | null) {
  if (!event) return "";
  return `${escapeHtml(event.identity.label)} · ${escapeHtml(when(event.recordedAt))} · IP ${escapeHtml(event.ipAddress ?? "non disponible")}`;
}

export function proofHtml(proof: Proof) {
  const { deliverable } = proof;
  const versionLabel = `V${String(deliverable.version).padStart(2, "0")}`;
  const statusEvent = proof.approval ?? proof.changesRequested;
  const status = `${reviewLabels[deliverable.reviewStatus] ?? deliverable.reviewStatus}${statusEvent ? `<small>${signature(statusEvent)}</small>` : ""}`;

  const requests = proof.requests.length
    ? proof.requests
        .map((request, index) => {
          const quotes = request.quotes.length
            ? `<table><thead><tr><th>Version</th><th>Prestation</th><th>Montant</th><th>Délai</th><th>Statut</th></tr></thead><tbody>${request.quotes
                .map(
                  (quote) =>
                    `<tr><td>v${quote.version}</td><td>${escapeHtml(quote.description)}</td><td>${amount(quote.amount)}</td><td>${delay(quote.deadline)}</td><td>${escapeHtml(quoteLabels[quote.status] ?? quote.status)}</td></tr>`,
                )
                .join("")}</tbody></table>`
            : "";
          const decision = request.decision
            ? `<p class="decision ${request.decision === "accepted" ? "ok" : "ko"}">Proposition ${request.decision === "accepted" ? "acceptée" : "refusée"}<small>${signature(request.decisionEvent) || "Décision antérieure au journal signé"}</small></p>`
            : "";
          const adaptation = request.adaptation?.message
            ? `<p class="note">Adaptation demandée par le client : « ${escapeHtml(request.adaptation.message)} »${request.adaptation.decision ? ` · ${request.adaptation.decision === "accepted" ? "acceptée" : "refusée"} par l’agence` : ""}</p>`
            : "";
          return `<li><div class="row"><b>Demande ${index + 1}${request.title ? ` · ${escapeHtml(request.title)}` : ""}</b><span class="tag">${escapeHtml(qualificationLabels[request.qualification] ?? request.qualification)}</span></div><p>« ${escapeHtml(request.message)} »</p><small>${escapeHtml(request.author)}${request.location ? ` · ${escapeHtml(request.location)}` : ""} · réf. ${request.id}</small>${quotes}${adaptation}${decision}</li>`;
        })
        .join("")
    : "<li>Aucune demande sur cette version.</li>";

  const events = proof.events.length
    ? `<table class="journal"><thead><tr><th>Heure du serveur</th><th>Événement</th><th>Identité constatée</th><th>Origine</th></tr></thead><tbody>${proof.events
        .map(
          (event) =>
            `<tr><td>${escapeHtml(when(event.recordedAt))}</td><td>${escapeHtml(event.description)}</td><td>${escapeHtml(event.identity.label)}</td><td>${escapeHtml(event.ipAddress ?? "—")}${event.userAgent ? `<small>${escapeHtml(event.userAgent.slice(0, 80))}</small>` : ""}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "<p>Aucun événement enregistré pour cette version.</p>";

  const file = deliverable.file
    ? `SHA-256 ${escapeHtml(deliverable.file.sha256)}${deliverable.file.size ? ` · ${size(deliverable.file.size)}` : ""}`
    : deliverable.url
      ? `Page web : ${escapeHtml(deliverable.url)}`
      : "Aucun fichier stocké";

  // Own window, without the app's stylesheets: Kora token values are written out (ink, border, graphite, action-ui, status colours).
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Preuve Kora · ${escapeHtml(deliverable.name)} ${versionLabel}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#111111;max-width:860px;margin:40px auto;padding:0 24px;line-height:1.5;font-size:13px}
    h1{font-size:24px;margin:2px 0 14px}h2{font-size:15px;border-bottom:1px solid #ddd9d1;padding-bottom:6px;margin-top:30px}
    .eyebrow{font-size:11px;letter-spacing:.08em;color:#4c4c48;margin:0}small{display:block;color:#4c4c48;font-size:11px;margin-top:3px}
    header{border-bottom:2px solid #0079d1;padding-bottom:18px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;color:#4c4c48;font-size:11px}
    .meta b{display:block;color:#111111;font-size:13px}.file{margin-top:12px;font-family:"IBM Plex Mono",monospace;font-size:11px;color:#4c4c48;word-break:break-all}
    .status{background:#ddf4e4;color:#0a5933;border-radius:6px;padding:10px 12px;font-weight:600;margin-top:16px}
    ul{list-style:none;padding:0}li{border:1px solid #ddd9d1;border-radius:6px;padding:12px;margin:10px 0;break-inside:avoid}
    .row{display:flex;justify-content:space-between;gap:12px}.tag{font-size:11px;background:#eae3ff;color:#4e31a6;border-radius:4px;padding:1px 6px;white-space:nowrap}
    table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}th,td{text-align:left;border-bottom:1px solid #ecece8;padding:5px 6px;vertical-align:top}th{color:#4c4c48;font-weight:600}
    .journal td:first-child{white-space:nowrap}.decision{font-weight:600;margin-top:10px}.ok{color:#0a5933}.ko{color:#892414}.note{color:#4c4c48}
    footer{margin-top:32px;border-top:1px solid #ddd9d1;padding-top:12px;color:#4c4c48;font-size:11px}.hash{font-family:"IBM Plex Mono",monospace;word-break:break-all;color:#111111}
    button{margin-top:16px;padding:8px 14px;border-radius:8px;border:0;background:#0079d1;color:#fff;font-weight:600;cursor:pointer}
    @media print{body{margin:0}button{display:none}}
  </style></head><body>
  <header><p class="eyebrow">PREUVE DE VALIDATION · ${escapeHtml(proof.agency)}</p><h1>${escapeHtml(deliverable.name)} · ${versionLabel}</h1>
    <div class="meta"><span>Client<b>${escapeHtml(proof.client || "—")}</b></span><span>Projet<b>${escapeHtml(proof.project || "—")}</b></span><span>Version<b>${versionLabel}</b></span><span>Importée<b>${escapeHtml(deliverable.importedAt || "—")}</b></span></div>
    <p class="file">Fichier validé : ${file}</p>
    <div class="status">${status}</div></header>
  <main><h2>Demandes et décisions</h2><ul>${requests}</ul><h2>Journal de la version</h2>${events}</main>
  <footer>
    <p>Récapitulatif généré le ${escapeHtml(when(proof.generatedAt))} (heure de Paris) par ${escapeHtml(proof.generatedBy)}.</p>
    <p>Les heures sont celles du serveur Kora, en heure de Paris. Le journal est en ajout seul : un événement enregistré ne peut être ni modifié ni supprimé, y compris par l’agence. L’identité d’un client est son adresse e-mail, prouvée par un code à usage unique envoyé à cette adresse ; l’origine est l’adresse IP reçue par le serveur.</p>
    <p>Empreinte du récapitulatif (SHA-256) : <span class="hash">${escapeHtml(proof.fingerprint)}</span></p>
  </footer>
  <button onclick="window.print()">Imprimer ou enregistrer en PDF</button></body></html>`;
}

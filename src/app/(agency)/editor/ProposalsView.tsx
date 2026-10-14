"use client";

import { useState } from "react";
import { Check, Copy, Eye, MapPin, Printer, Receipt } from "lucide-react";

export type ProposalRowState = "to-quote" | "draft" | "sent" | "adaptation" | "accepted" | "refused";
export type ProposalRow = {
  commentId: number;
  message: string;
  author: string;
  location: string;
  versionLabel: string;
  /** Canvas of that version, focused on the request. */
  href: string;
  state: ProposalRowState;
  description?: string;
  amount: number;
  days: number;
  /** The proposal can be created / edited from here (request on the open, editable version). */
  editable: boolean;
};

const stateLabel: Record<ProposalRowState, string> = {
  "to-quote": "À chiffrer",
  draft: "Chiffrée, à envoyer",
  sent: "Envoyée",
  adaptation: "Adaptation demandée",
  accepted: "Acceptée",
  refused: "Refusée",
};
const stateTone: Record<ProposalRowState, string> = {
  "to-quote": "decision-pending",
  draft: "decision-pending",
  sent: "decision-sent",
  adaptation: "decision-pending",
  accepted: "decision-included",
  refused: "decision-outside",
};
// What needs the agency first, then what waits on the client, then what is settled.
const stateOrder: ProposalRowState[] = ["to-quote", "draft", "adaptation", "sent", "accepted", "refused"];
const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** Financial proposals of a deliverable: every out-of-scope request of all versions, to quote and send. */
export function ProposalsView({
  livrableName,
  projectName,
  clientName,
  rows,
  onOpenProposal,
  onSendProposal,
  onOpenCanvas,
}: {
  livrableName: string;
  projectName: string;
  clientName: string;
  rows: ProposalRow[];
  /** Follows a sent proposal (adaptation, new version). */
  onOpenProposal: (commentId: number) => void;
  /** Sends a quoted proposal (asks for confirmation). */
  onSendProposal: (commentId: number) => void;
  /** Shows the request on its version's canvas (same tab). */
  onOpenCanvas: (href: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const sorted = [...rows].sort((left, right) => stateOrder.indexOf(left.state) - stateOrder.indexOf(right.state));
  const quoted = rows.filter((row) => row.state !== "to-quote");
  const sum = (list: ProposalRow[]) => list.reduce((total, row) => total + row.amount, 0);
  const accepted = rows.filter((row) => row.state === "accepted");
  const waiting = rows.filter((row) => row.state === "sent" || row.state === "adaptation");
  const refused = rows.filter((row) => row.state === "refused");
  const total = sum(quoted);
  const proposed = quoted.filter((row) => row.state !== "refused");
  const days = proposed.reduce((count, row) => count + row.days, 0);
  const share = (list: ProposalRow[]) => (total ? (sum(list) / total) * 100 : 0);

  const summary = () =>
    [
      `Proposition financière — ${livrableName}`,
      `${clientName} · ${projectName}`,
      "",
      ...proposed.map((row) => `• ${row.description || row.message} (${row.versionLabel}) — ${euros(row.amount)} · ${row.days} j · ${stateLabel[row.state]}`),
      "",
      `Total : ${euros(sum(proposed))} HT · ${plural(days, "jour")}`,
    ].join("\n");

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused: the export stays available.
    }
  }

  function printProposal() {
    const win = window.open("", "_blank");
    if (!win) return;
    const doc = win.document;
    doc.title = `Proposition - ${livrableName}`;
    // Opened in a separate window where tokens.css is not loaded: Kora token values are inlined.
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:Arial,sans-serif;color:#111111;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;border-bottom:1px solid #ddd9d1;padding:10px 8px;font-size:13px;vertical-align:top}th{color:#4c4c48;font-size:12px}td.num,th.num{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;border-bottom:0}small{color:#4c4c48}@media print{button{display:none}}";
    doc.head.append(style);
    const title = doc.createElement("h1");
    title.textContent = `Proposition financière — ${livrableName}`;
    const meta = doc.createElement("p");
    meta.textContent = `${clientName} · ${projectName} · ${new Date().toLocaleDateString("fr-FR")}`;
    const table = doc.createElement("table");
    const head = table.createTHead().insertRow();
    [
      ["Prestation", ""],
      ["Délai", "num"],
      ["Montant HT", "num"],
    ].forEach(([label, className]) => {
      const cell = doc.createElement("th");
      cell.textContent = label;
      cell.className = className;
      head.append(cell);
    });
    const body = table.createTBody();
    proposed.forEach((row) => {
      const line = body.insertRow();
      const what = line.insertCell();
      what.textContent = row.description || row.message;
      const origin = doc.createElement("small");
      origin.textContent = ` — demande de ${row.author} (${row.versionLabel})`;
      what.append(origin);
      const delay = line.insertCell();
      delay.className = "num";
      delay.textContent = `${row.days} j`;
      const amount = line.insertCell();
      amount.className = "num";
      amount.textContent = euros(row.amount);
    });
    const foot = table.createTFoot().insertRow();
    foot.insertCell().textContent = "Total";
    const totalDays = foot.insertCell();
    totalDays.className = "num";
    totalDays.textContent = `${days} j`;
    const totalAmount = foot.insertCell();
    totalAmount.className = "num";
    totalAmount.textContent = euros(sum(proposed));
    const print = doc.createElement("button");
    print.textContent = "Imprimer ou enregistrer en PDF";
    print.onclick = () => win.print();
    doc.body.replaceChildren(title, meta, table, print);
    win.focus();
  }

  return (
    <div className="browser proposals-view">
      <header className="page-header">
        <div className="proposals-heading">
          <h1 className="page-title">Propositions financières</h1>
          <p>
            Ajouts hors scope de « {livrableName} » à chiffrer, puis à proposer au client.
          </p>
        </div>
        <div className="proposals-header-actions">
          <button className="secondary-button" onClick={copySummary} disabled={proposed.length === 0}>
            {copied ? <Check /> : <Copy />} {copied ? "Copié" : "Copier le récapitulatif"}
          </button>
          <button className="primary-button" onClick={printProposal} disabled={proposed.length === 0}>
            <Printer /> Exporter la proposition
          </button>
        </div>
      </header>

      <section className="overview is-single" aria-label="Montants">
        <div className="hero-stat">
          <span className="stat-label">Total chiffré</span>
          <span className="hero-value">{euros(total)}</span>
          <span className="stat-note">
            {plural(quoted.length, "proposition")}
            {days > 0 ? ` · ${plural(days, "jour")} de travail` : ""}
          </span>
          {total > 0 && (
            <>
            <div className="proposal-split" role="img" aria-label={`Accepté ${euros(sum(accepted))}, en attente ${euros(sum(waiting))}, refusé ${euros(sum(refused))}`}>
              <span className="is-accepted" style={{ width: `${share(accepted)}%` }} />
              <span className="is-waiting" style={{ width: `${share(waiting)}%` }} />
              <span className="is-refused" style={{ width: `${share(refused)}%` }} />
            </div>
            <ul className="chart-legend">
              <li>
                <i className="legend-swatch is-accepted" aria-hidden="true" /> Accepté <b>{euros(sum(accepted))}</b>
              </li>
              <li>
                <i className="legend-swatch is-waiting" aria-hidden="true" /> En attente <b>{euros(sum(waiting))}</b>
              </li>
              <li>
                <i className="legend-swatch is-refused" aria-hidden="true" /> Refusé <b>{euros(sum(refused))}</b>
              </li>
            </ul>
            </>
          )}
        </div>
      </section>

      <section className="browser-section">
        <h2>Ajouts hors scope · {rows.length}</h2>
        {rows.length === 0 ? (
          <div className="empty-state">
            <Receipt aria-hidden="true" />
            <h2>Aucun ajout hors scope</h2>
            <p>Qualifiez un commentaire « Hors scope » sur le canevas : il apparaîtra ici pour être chiffré.</p>
          </div>
        ) : (
          <div className="overview-table-wrap">
            <table className="overview-table proposals-table">
              <thead>
                <tr>
                  <th scope="col">Demande</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Délai</th>
                  <th scope="col">Montant HT</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.commentId}>
                    <th scope="row">
                      <span className="proposal-title">{row.description ?? row.message}</span>
                      <span className="proposal-meta">
                        {row.description ? `« ${row.message} » · ` : ""}
                        {row.author} · {row.versionLabel}
                      </span>
                    </th>
                    <td>
                      <span className={`decision-badge ${stateTone[row.state]}`}>{stateLabel[row.state]}</span>
                    </td>
                    <td>{row.state === "to-quote" ? "—" : `${row.days} j`}</td>
                    <td>{row.state === "to-quote" ? "—" : euros(row.amount)}</td>
                    <td>
                      <span className="proposal-actions">
                        {row.editable && (row.state === "to-quote" || row.state === "draft") && (
                          <>
                            <button className="secondary-button small-button" onClick={() => onOpenCanvas(`${row.href}&chiffrer=1`)}>
                              {row.state === "draft" ? "Modifier" : "Chiffrer"}
                            </button>
                            <button
                              className="secondary-button small-button"
                              disabled={row.state !== "draft"}
                              title={row.state === "draft" ? undefined : "Chiffrez d’abord la demande"}
                              onClick={() => onSendProposal(row.commentId)}
                            >
                              <Receipt /> Envoyer la proposition
                            </button>
                          </>
                        )}
                        {row.editable && (row.state === "sent" || row.state === "adaptation") && (
                          <button className="secondary-button small-button" onClick={() => onOpenProposal(row.commentId)}>
                            <Eye /> Voir la proposition
                          </button>
                        )}
                        <button
                          className="icon-only"
                          onClick={() => onOpenCanvas(row.href)}
                          aria-label={`Voir la demande sur le canevas (${row.versionLabel})`}
                          title="Voir sur le canevas"
                        >
                          <MapPin />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {proposed.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row">Total proposé</th>
                    <td />
                    <td>{days} j</td>
                    <td>{euros(sum(proposed))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

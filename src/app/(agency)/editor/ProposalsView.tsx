"use client";

import Link from "next/link";
import { ArrowUpRight, Copy, FileText, Printer, Receipt } from "lucide-react";

export type ProposalRowState = "to-quote" | "sent" | "adaptation" | "accepted" | "refused";
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
  sent: "Envoyée",
  adaptation: "Adaptation demandée",
  accepted: "Acceptée",
  refused: "Refusée",
};
const stateTone: Record<ProposalRowState, string> = {
  "to-quote": "decision-pending",
  sent: "decision-pending",
  adaptation: "decision-pending",
  accepted: "decision-included",
  refused: "decision-outside",
};
const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;

/** Every out-of-scope request of a deliverable, all versions, ready to become one financial proposal. */
export function ProposalsView({
  livrableName,
  projectName,
  clientName,
  rows,
  onOpenProposal,
}: {
  livrableName: string;
  projectName: string;
  clientName: string;
  rows: ProposalRow[];
  onOpenProposal: (commentId: number) => void;
}) {
  const quoted = rows.filter((row) => row.state !== "to-quote" && row.state !== "refused");
  const total = quoted.reduce((sum, row) => sum + row.amount, 0);
  const accepted = rows.filter((row) => row.state === "accepted").reduce((sum, row) => sum + row.amount, 0);
  const waiting = rows.filter((row) => row.state === "sent" || row.state === "adaptation").reduce((sum, row) => sum + row.amount, 0);
  const toQuote = rows.filter((row) => row.state === "to-quote").length;
  const days = quoted.reduce((sum, row) => sum + row.days, 0);

  const summary = () =>
    [
      `Proposition complémentaire — ${livrableName}`,
      `${clientName} · ${projectName}`,
      "",
      ...quoted.map((row) => `• #${row.commentId} (${row.versionLabel}) ${row.description || row.message} — ${euros(row.amount)} · ${row.days} j · ${stateLabel[row.state]}`),
      "",
      `Total : ${euros(total)} HT · ${days} jour${days > 1 ? "s" : ""}`,
    ].join("\n");

  function printProposal() {
    const win = window.open("", "_blank");
    if (!win) return;
    const doc = win.document;
    doc.title = `Proposition - ${livrableName}`;
    // Opened in a separate window where tokens.css is not loaded: Kora token values are inlined.
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:Arial,sans-serif;color:#111111;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;border-bottom:1px solid #ddd9d1;padding:10px 8px;font-size:13px;vertical-align:top}th{color:#4c4c48;font-size:12px}td.num{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;border-bottom:0}small{color:#4c4c48}@media print{button{display:none}}";
    doc.head.append(style);
    const title = doc.createElement("h1");
    title.textContent = `Proposition complémentaire — ${livrableName}`;
    const meta = doc.createElement("p");
    meta.textContent = `${clientName} · ${projectName} · ${new Date().toLocaleDateString("fr-FR")}`;
    const table = doc.createElement("table");
    const head = table.createTHead().insertRow();
    ["Demande", "Version", "Délai", "Montant HT"].forEach((label) => {
      const cell = doc.createElement("th");
      cell.textContent = label;
      head.append(cell);
    });
    const body = table.createTBody();
    quoted.forEach((row) => {
      const line = body.insertRow();
      const what = line.insertCell();
      what.textContent = row.description || row.message;
      const origin = doc.createElement("small");
      origin.textContent = ` — demande #${row.commentId} de ${row.author}`;
      what.append(origin);
      line.insertCell().textContent = row.versionLabel;
      const delay = line.insertCell();
      delay.className = "num";
      delay.textContent = `${row.days} j`;
      const amount = line.insertCell();
      amount.className = "num";
      amount.textContent = euros(row.amount);
    });
    const foot = table.createTFoot().insertRow();
    foot.insertCell().textContent = "Total";
    foot.insertCell();
    const totalDays = foot.insertCell();
    totalDays.className = "num";
    totalDays.textContent = `${days} j`;
    const totalAmount = foot.insertCell();
    totalAmount.className = "num";
    totalAmount.textContent = euros(total);
    const print = doc.createElement("button");
    print.textContent = "Imprimer ou enregistrer en PDF";
    print.onclick = () => win.print();
    doc.body.replaceChildren(title, meta, table, print);
    win.focus();
  }

  return (
    <div className="proposals-view">
      <header className="proposals-header">
        <div>
          <p className="eyebrow">Propositions hors périmètre</p>
          <h1>{livrableName}</h1>
          <p className="proposals-intro">
            Toutes les demandes hors périmètre de ce livrable, toutes versions confondues. Chiffrez-les, puis envoyez une
            proposition financière groupée au client.
          </p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => void navigator.clipboard?.writeText(summary())} disabled={quoted.length === 0}>
            <Copy /> Copier le récapitulatif
          </button>
          <button className="primary-button" onClick={printProposal} disabled={quoted.length === 0}>
            <Printer /> Exporter la proposition
          </button>
        </div>
      </header>

      <div className="proposals-stats">
        <div className="stat-tile">
          <small>Total proposé</small>
          <b>{euros(total)}</b>
          <span>
            {quoted.length} poste{quoted.length > 1 ? "s" : ""} · {days} j
          </span>
        </div>
        <div className="stat-tile">
          <small>Accepté par le client</small>
          <b>{euros(accepted)}</b>
        </div>
        <div className="stat-tile">
          <small>En attente de décision</small>
          <b>{euros(waiting)}</b>
        </div>
        <div className="stat-tile">
          <small>À chiffrer</small>
          <b>{toQuote}</b>
          <span>demande{toQuote > 1 ? "s" : ""} sans proposition</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <Receipt aria-hidden="true" />
          <h2>Aucune demande hors périmètre</h2>
          <p>Qualifiez une demande « Hors périmètre » sur le canevas : elle apparaîtra ici pour être chiffrée.</p>
        </div>
      ) : (
        <div className="arbitrage-table-wrap">
          <table className="arbitrage-table proposals-table">
            <thead>
              <tr>
                <th>Demande</th>
                <th>Version</th>
                <th>Proposition</th>
                <th className="num">Délai</th>
                <th className="num">Montant HT</th>
                <th>Statut</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.commentId}>
                  <td className="demand-cell">
                    <p>{row.message}</p>
                    <small>
                      #{row.commentId} · {row.author} · {row.location}
                    </small>
                  </td>
                  <td>{row.versionLabel}</td>
                  <td>{row.description ?? <span className="text-muted">—</span>}</td>
                  <td className="num">{row.state === "to-quote" ? "—" : `${row.days} j`}</td>
                  <td className="num">{row.state === "to-quote" ? "—" : euros(row.amount)}</td>
                  <td>
                    <span className={`decision-badge ${stateTone[row.state]}`}>{stateLabel[row.state]}</span>
                  </td>
                  <td className="proposals-actions">
                    {row.editable && (row.state === "to-quote" || row.state === "sent" || row.state === "adaptation") && (
                      <button className="action-link" onClick={() => onOpenProposal(row.commentId)}>
                        <FileText /> {row.state === "to-quote" ? "Chiffrer" : "Voir"}
                      </button>
                    )}
                    <Link className="action-link" href={row.href}>
                      Canevas <ArrowUpRight />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            {quoted.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3}>Total proposé</td>
                  <td className="num">{days} j</td>
                  <td className="num">{euros(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** Scope and proposal analytics (formerly the deliverable dashboard) for a set of deliverables. */
export type HomeAnalyticsData = {
  totalDemands: number;
  included: number;
  outside: number;
  pending: number;
  quotedEuros: number;
  acceptedEuros: number;
  acceptedDays: number;
  acceptedCount: number;
  refusedCount: number;
  awaitingCount: number;
  versions: number;
  register: {
    id: number;
    livrable: string;
    version: string;
    message: string;
    location: string;
    initials: string;
    decision: "À qualifier" | "Inclus" | "Hors périmètre";
    amount?: string;
    deadline?: string;
    clientDecision: "accepted" | "refused" | "none";
    href: string;
  }[];
};

const decisionStyles = { "À qualifier": "decision-pending", Inclus: "decision-included", "Hors périmètre": "decision-outside" } as const;
const decisionLabels = { "À qualifier": "À clarifier", Inclus: "Correction", "Hors périmètre": "Hors scope" } as const;
const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;

/** Scope split and proposal status, side by side (same bar and swatches as the proposals page). */
export function ScopeCharts({ data }: { data: HomeAnalyticsData }) {
  const { totalDemands, included, outside, pending } = data;
  const share = (count: number) => `${(count / Math.max(totalDemands, 1)) * 100}%`;
  const quoted = Math.max(data.acceptedCount + data.refusedCount + data.awaitingCount, 0);
  const statusShare = (count: number) => `${(count / Math.max(quoted, 1)) * 100}%`;
  return (
    <div className="chart-grid">
      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Arbitrages de périmètre</h3>
          <span>{totalDemands} demande{totalDemands > 1 ? "s" : ""}</span>
        </div>
        <div
          className="proposal-split"
          role="img"
          aria-label={`Corrections ${included}, hors scope ${outside}, à clarifier ${pending}`}
        >
          <span className="is-included" style={{ width: share(included) }} />
          <span className="is-outside" style={{ width: share(outside) }} />
          <span className="is-pending" style={{ width: share(pending) }} />
        </div>
        <ul className="chart-legend">
          <li>
            <i className="legend-swatch is-included" aria-hidden="true" /> Corrections <b>{included}</b>
          </li>
          <li>
            <i className="legend-swatch is-outside" aria-hidden="true" /> Hors scope <b>{outside}</b>
          </li>
          <li>
            <i className="legend-swatch is-pending" aria-hidden="true" /> À clarifier <b>{pending}</b>
          </li>
        </ul>
        <dl className="chart-facts">
          <div>
            <dt>Temps non facturé évité</dt>
            <dd>~{data.acceptedDays * 7} h</dd>
          </div>
          <div>
            <dt>Montant moyen d’un devis</dt>
            <dd>{euros(outside > 0 ? Math.round(data.quotedEuros / outside) : 0)}</dd>
          </div>
          <div>
            <dt>Versions</dt>
            <dd>{data.versions}</dd>
          </div>
        </dl>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <h3>Propositions au client</h3>
          <span>{euros(data.quotedEuros)} chiffrés</span>
        </div>
        <div className="proposal-split" role="img" aria-label={`Acceptées ${data.acceptedCount}, en attente ${data.awaitingCount}, refusées ${data.refusedCount}`}>
          <span className="is-accepted" style={{ width: statusShare(data.acceptedCount) }} />
          <span className="is-waiting" style={{ width: statusShare(data.awaitingCount) }} />
          <span className="is-refused" style={{ width: statusShare(data.refusedCount) }} />
        </div>
        <ul className="chart-rows">
          <li>
            <span>
              <i className="legend-swatch is-accepted" aria-hidden="true" /> Acceptées
            </span>
            <b>
              {data.acceptedCount} · {euros(data.acceptedEuros)}
            </b>
          </li>
          <li>
            <span>
              <i className="legend-swatch is-waiting" aria-hidden="true" /> En attente du client
            </span>
            <b>{data.awaitingCount}</b>
          </li>
          <li>
            <span>
              <i className="legend-swatch is-refused" aria-hidden="true" /> Refusées
            </span>
            <b>{data.refusedCount}</b>
          </li>
          <li className="is-total">
            <span>Valeur commerciale capturée</span>
            <b>+{euros(data.acceptedEuros)}</b>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** Every request with its qualification, quote and client answer. */
export function RegisterTable({ rows }: { rows: HomeAnalyticsData["register"] }) {
  if (rows.length === 0) return <p className="browser-empty">Aucune demande pour ces livrables.</p>;
  return (
    <div className="overview-table-wrap">
      <table className="overview-table register-table">
        <thead>
          <tr>
            <th scope="col">Demande</th>
            <th scope="col">Livrable</th>
            <th scope="col">Qualification</th>
            <th scope="col">Chiffrage</th>
            <th scope="col">Accord client</th>
            <th scope="col">
              <span className="sr-only">Ouvrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span className="proposal-title">{row.message}</span>
                <span className="proposal-meta">
                  #{row.id} · {row.initials} · {row.location}
                </span>
              </th>
              <td>
                {row.livrable} <span className="proposal-meta is-inline">{row.version}</span>
              </td>
              <td>
                <span className={`decision-badge ${decisionStyles[row.decision]}`}>{decisionLabels[row.decision]}</span>
              </td>
              <td>{row.amount ? `${row.amount} · ${row.deadline}` : "—"}</td>
              <td>
                {row.decision !== "Hors périmètre" ? (
                  <span className="proposal-meta is-inline">{row.decision === "Inclus" ? "Incluse au scope" : "—"}</span>
                ) : (
                  <span
                    className={`decision-badge ${
                      row.clientDecision === "accepted" ? "decision-included" : row.clientDecision === "refused" ? "decision-outside" : "decision-sent"
                    }`}
                  >
                    {row.clientDecision === "accepted" ? "Acceptée" : row.clientDecision === "refused" ? "Refusée" : "En attente"}
                  </span>
                )}
              </td>
              <td>
                <Link className="action-link" href={row.href} aria-label={`Ouvrir la demande #${row.id}`}>
                  Ouvrir <ArrowUpRight />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

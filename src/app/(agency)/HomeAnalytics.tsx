"use client";

import Link from "next/link";
import { ArrowUpRight, Check, Coins, FileText, Scale, ShieldCheck } from "lucide-react";

/** Scope and proposal analytics (formerly the deliverable dashboard), for the home filter's scope. */
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
const euros = (value: number) => `${value.toLocaleString("fr-FR")} €`;
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

export function HomeAnalytics({ data }: { data: HomeAnalyticsData }) {
  const { totalDemands, included, outside, pending } = data;
  const conversion = outside > 0 ? Math.round((data.acceptedCount / outside) * 100) : 0;
  const share = (count: number) => `${(count / Math.max(totalDemands, 1)) * 100}%`;
  return (
    <>
      <section className="browser-section">
        <h2>Pilotage commercial</h2>
        <div className="dashboard-kpi-grid">
          <div className="kpi-card highlight-green">
            <div className="kpi-header">
              <span className="kpi-icon">
                <Coins />
              </span>
              <span className="kpi-title">Revenu supplémentaire accepté</span>
            </div>
            <div className="kpi-value">{euros(data.acceptedEuros)}</div>
            <div className="kpi-sub">
              Sur <b>{euros(data.quotedEuros)}</b> de propositions chiffrées
            </div>
          </div>
          <div className="kpi-card highlight-coral">
            <div className="kpi-header">
              <span className="kpi-icon">
                <ShieldCheck />
              </span>
              <span className="kpi-title">Dérive de périmètre évitée</span>
            </div>
            <div className="kpi-value">+{plural(data.acceptedDays, "jour")}</div>
            <div className="kpi-sub">Délai supplémentaire formalisé et accepté par le client</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-icon">
                <FileText />
              </span>
              <span className="kpi-title">Total des demandes</span>
            </div>
            <div className="kpi-value">{totalDemands}</div>
            <div className="kpi-sub">
              Dont <b>{outside}</b> hors périmètre ({totalDemands ? Math.round((outside / totalDemands) * 100) : 0} %)
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-icon">
                <Scale />
              </span>
              <span className="kpi-title">Taux de conversion devis</span>
            </div>
            <div className="kpi-value">{conversion} %</div>
            <div className="kpi-sub">
              <b>{data.acceptedCount}</b> acceptée{data.acceptedCount > 1 ? "s" : ""}, <b>{data.refusedCount}</b> refusée
              {data.refusedCount > 1 ? "s" : ""}, <b>{data.awaitingCount}</b> en cours
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-sections-grid">
        <div className="dashboard-section-card">
          <div className="section-card-header">
            <h3>Répartition des arbitrages de périmètre</h3>
            <span>Sur {plural(data.versions, "version")}</span>
          </div>
          <div className="scope-bar-wrap">
            <div className="scope-progress-bar">
              {totalDemands > 0 ? (
                <>
                  <div className="bar-segment included" style={{ width: share(included) }} title={`Incluses : ${included}`} />
                  <div className="bar-segment outside" style={{ width: share(outside) }} title={`Hors périmètre : ${outside}`} />
                  <div className="bar-segment pending" style={{ width: share(pending) }} title={`À qualifier : ${pending}`} />
                </>
              ) : (
                <div className="bar-segment empty" style={{ width: "100%" }} />
              )}
            </div>
            <div className="scope-legend">
              <span className="legend-item">
                <i className="legend-dot included" /> Incluses ({included})
              </span>
              <span className="legend-item">
                <i className="legend-dot outside" /> Hors périmètre ({outside})
              </span>
              <span className="legend-item">
                <i className="legend-dot pending" /> À qualifier ({pending})
              </span>
            </div>
          </div>
          <div className="kpi-mini-stats">
            <div className="mini-stat">
              <small>Temps non facturé évité</small>
              <b>~{data.acceptedDays * 7} h</b>
            </div>
            <div className="mini-stat">
              <small>Montant moyen / devis</small>
              <b>{euros(outside > 0 ? Math.round(data.quotedEuros / outside) : 0)}</b>
            </div>
            <div className="mini-stat">
              <small>Versions</small>
              <b>{data.versions}</b>
            </div>
          </div>
        </div>

        <div className="dashboard-section-card">
          <div className="section-card-header">
            <h3>Statut des propositions commerciales</h3>
            <span>{plural(outside, "proposition")} au total</span>
          </div>
          <div className="proposals-status-list">
            <div className="status-row">
              <span className="status-label">
                <span className="status-dot approved-dot" /> Acceptées par le client
              </span>
              <b>
                {data.acceptedCount} ({euros(data.acceptedEuros)})
              </b>
            </div>
            <div className="status-row">
              <span className="status-label">
                <span className="status-dot changes-dot" /> Refusées par le client
              </span>
              <b>{data.refusedCount}</b>
            </div>
            <div className="status-row">
              <span className="status-label">
                <span className="status-dot" /> En attente de décision / adaptation
              </span>
              <b>{data.awaitingCount}</b>
            </div>
            <div className="status-row highlight">
              <span className="status-label">
                <b>Total valeur commerciale capturée</b>
              </span>
              <b>+{euros(data.acceptedEuros)}</b>
            </div>
          </div>
        </div>
      </div>

      <section className="browser-section">
        <h2>Registre des demandes et décisions · {data.register.length}</h2>
        {data.register.length === 0 ? (
          <p className="browser-empty">Aucune demande enregistrée pour le moment.</p>
        ) : (
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
                {data.register.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <span className="proposal-title">{row.message}</span>
                      <span className="proposal-meta">
                        #{row.id} · {row.initials} · {row.location}
                      </span>
                    </th>
                    <td>
                      {row.livrable} <small className="text-muted">{row.version}</small>
                    </td>
                    <td>
                      <span className={`decision-badge ${decisionStyles[row.decision]}`}>{row.decision}</span>
                    </td>
                    <td>{row.amount ? `${row.amount} · ${row.deadline}` : "—"}</td>
                    <td>
                      {row.decision === "Hors périmètre" ? (
                        <span
                          className={`decision-badge ${
                            row.clientDecision === "accepted" ? "decision-included" : row.clientDecision === "refused" ? "decision-outside" : "decision-pending"
                          }`}
                        >
                          {row.clientDecision === "accepted" ? (
                            <>
                              Acceptée <Check />
                            </>
                          ) : row.clientDecision === "refused" ? (
                            "Refusée"
                          ) : (
                            "En attente"
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">{row.decision === "Inclus" ? "Inclus au devis" : "—"}</span>
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
        )}
      </section>
    </>
  );
}

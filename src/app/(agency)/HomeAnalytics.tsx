"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
const decisionLabels = { "À qualifier": "À clarifier", Inclus: "Inclus", "Hors périmètre": "Hors scope" } as const;
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
          aria-label={`Inclus ${included}, hors scope ${outside}, à clarifier ${pending}`}
        >
          <span className="is-included" style={{ width: share(included) }} />
          <span className="is-outside" style={{ width: share(outside) }} />
          <span className="is-pending" style={{ width: share(pending) }} />
        </div>
        <ul className="chart-legend">
          <li>
            <i className="legend-swatch is-included" aria-hidden="true" /> Inclus <b>{included}</b>
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

const pageSizes = [10, 20, 40, 80];

/** Every request with its qualification, quote and client answer, page by page. */
export function RegisterTable({ rows }: { rows: HomeAnalyticsData["register"] }) {
  const [pageSize, setPageSize] = useState(pageSizes[0]);
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // A narrower filter can leave the current page empty: show the last one.
  const page = Math.min(pageIndex, pageCount - 1);
  const shown = rows.slice(page * pageSize, (page + 1) * pageSize);
  if (rows.length === 0) return <p className="browser-empty">Aucune demande pour ces livrables.</p>;
  return (
    <div className="register">
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
          {shown.map((row) => (
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
                  <span className="proposal-meta is-inline">{row.decision === "Inclus" ? "Dans le scope" : "—"}</span>
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
      <div className="register-pagination">
        <div className="flex items-center gap-2">
          <Label htmlFor="register-page-size" className="text-sm font-normal text-muted-foreground">
            Lignes par page
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPageIndex(0);
            }}
          >
            <SelectTrigger id="register-page-size" size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {page * pageSize + 1}–{page * pageSize + shown.length} sur {rows.length}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Page précédente" disabled={page === 0} onClick={() => setPageIndex(page - 1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-20 text-center text-sm">
            Page {page + 1} / {pageCount}
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Page suivante" disabled={page >= pageCount - 1} onClick={() => setPageIndex(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

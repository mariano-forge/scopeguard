"use client";

// The « Demandes » tab of a project: its requests as cards in columns, from the agency's draft to the proposal
// accepted, like a Jira or Linear board (requestBoard.ts), as tall as the window, each column scrolling on its
// own. Read only: a card opens its request in the editor, where it is qualified, quoted and sent.

import { useState } from "react";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sideOf } from "@/lib/authors";
import { euros } from "@/lib/projectScope";
import { boardColumns, columnOf, type BoardInput, type BoardRequest } from "./requestBoard";
import "./projectRequests.css";

const versionName = (version: number) => `V${String(version).padStart(2, "0")}`;
/** Items by key, in their order (as trackingData.ts groups the versions). */
function groupBy<T, K>(items: T[], keyOf: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return groups;
}

export function ProjectRequests({ input, hrefOf }: { input: BoardInput; hrefOf: (request: BoardRequest) => string }) {
  const [livrable, setLivrable] = useState("all");

  const versions = input.versions.filter((record) => (record.projectId ?? 1) === input.projectId);
  // A deliverable: its versions under one name, chosen by its first version's id (as the routes name it).
  const livrables = [...groupBy(versions, (record) => record.name).values()].map((records) => [...records].sort((left, right) => left.version - right.version));
  const chosen = livrables.find((records) => String(records[0]!.id) === livrable);
  const shownVersions = new Map((chosen ?? livrables.flat()).map((record) => [record.id, record]));
  const requests = input.requests
    .filter((request) => shownVersions.has(request.deliverableId ?? -1))
    .sort((left, right) => (right.createdAt ?? right.id) - (left.createdAt ?? left.id));
  const byColumn = groupBy(requests, (request) => columnOf(request, input.quoteOf(request.id).status));

  function card(request: BoardRequest) {
    const record = shownVersions.get(request.deliverableId ?? -1);
    const quote = request.decision === "Hors périmètre" ? input.quoteOf(request.id) : null;
    const title = request.title?.trim() || request.message;
    return (
      <li key={request.id} className="board-card">
        <Link className="board-card-link" href={hrefOf(request)} aria-label={`Ouvrir la demande « ${title} »`}>
          <span className="board-card-title">{title}</span>
        </Link>
        <span className="board-card-meta">
          <span className={`board-card-author is-${sideOf(request)}`} title={request.author}>
            {request.initials}
          </span>
          <span className="truncate">{record ? `${record.name} · ${versionName(record.version)}` : ""}</span>
          {quote && quote.amount > 0 && <b className="ml-auto tabular-nums">{euros(quote.amount)}</b>}
        </span>
      </li>
    );
  }

  return (
    <div className="request-board-page">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer les demandes">
        <Select value={livrable} onValueChange={setLivrable}>
          <SelectTrigger aria-label="Livrable" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">Tous les livrables</SelectItem>
            {livrables.map((records) => (
              <SelectItem key={records[0]!.id} value={String(records[0]!.id)}>
                {records[0]!.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="page-count ml-auto">
          {requests.length} demande{requests.length > 1 ? "s" : ""}
        </span>
      </div>
      {/* Wider than the page: it scrolls sideways in its own frame, each column downwards in its own. */}
      <div className="request-board" role="region" aria-label="Pipeline des demandes" tabIndex={0}>
        {boardColumns.map((column) => {
          const cards = byColumn.get(column.key) ?? [];
          return (
            <section key={column.key} className="board-column" aria-labelledby={`board-${column.key}`}>
              <header className="board-column-head">
                <h2 id={`board-${column.key}`}>{column.label}</h2>
                <span className="board-column-count">{cards.length}</span>
              </header>
              {cards.length ? (
                <ul className="board-cards" aria-label={column.label}>
                  {cards.map(card)}
                </ul>
              ) : (
                <p className="board-column-empty">{column.hint}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

"use client";

// The review canvas of a « Lien » deliverable (agency and client pages, through ReviewCanvas): its staging
// site is reviewed there, with the toolbar (public/kora-toolbar.js); here, the requests it got, page by
// page, each with the capture of what was pointed at. A card opens its request as a pin does, and the
// request's thread shows next to the cards.

import { ArrowUpRight, Globe } from "lucide-react";
import type { SiteAnchor } from "@/lib/siteReview";
import { siteClientUrl } from "@/lib/siteReview";
import { itemLabel, requestKind, requestText, statusLabels, statusTones, type ThreadComment } from "./CanvasComments";

type BoardComment = ThreadComment & { page?: number };
const siteOf = (comment: BoardComment) => (comment as BoardComment & { site?: SiteAnchor }).site;

/** "/" first, then the pages in alphabetical order. */
const byPage = (left: string, right: string) => (left === "/" ? -1 : right === "/" ? 1 : left.localeCompare(right, "fr"));

export function SiteBoard({
  siteUrl,
  comments,
  selectedId,
  onOpen,
  renderThread,
}: {
  siteUrl?: string;
  comments: BoardComment[];
  /** The request whose thread is open. */
  selectedId: number | null;
  onOpen: (comment: BoardComment) => void;
  renderThread: (comment: BoardComment) => React.ReactNode;
}) {
  const placed = comments.filter((comment) => siteOf(comment));
  const elsewhere = comments.filter((comment) => !siteOf(comment));
  const pages = [...new Set(placed.map((comment) => siteOf(comment)!.url))].sort(byPage);
  const selected = comments.find((comment) => comment.id === selectedId);
  // The agency and the client open the site with the toolbar shown.
  const siteLink = siteClientUrl({ type: "Link", url: siteUrl }) ?? siteUrl;
  const host = (() => {
    try {
      return siteUrl ? new URL(siteUrl).host : "";
    } catch {
      return siteUrl ?? "";
    }
  })();

  const card = (comment: BoardComment) => {
    const site = siteOf(comment);
    const kind = requestKind(comment);
    return (
      <li key={comment.id}>
        <button type="button" className={`site-card ${comment.id === selectedId ? "is-selected" : ""}`} aria-label={`${itemLabel(comment)} #${comment.id}`} aria-current={comment.id === selectedId ? "true" : undefined} onClick={() => onOpen(comment)}>
          {site?.capture ? (
            // The capture, annotated by the toolbar with the element and the click (src/lib/siteCapture.ts).
            <img className="site-card-shot" src={site.capture} alt="" loading="lazy" />
          ) : (
            <span className="site-card-shot is-empty">
              <Globe aria-hidden="true" />
              {site ? <small>{site.selector}</small> : <small>Sans emplacement sur le site</small>}
            </span>
          )}
          <span className="site-card-body">
            <span className={`decision-badge ${statusTones[kind]} w-fit`}>{statusLabels[kind]}</span>
            <span className="site-card-text">{requestText(comment)}</span>
            <small>{comment.author}</small>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="site-board">
      <header className="site-board-header">
        <div className="grid min-w-0 gap-0.5">
          <p className="eyebrow">Site de recette</p>
          <h2 className="truncate">{host}</h2>
        </div>
        {siteLink && (
          <a className="ghost-button" href={siteLink} target="_blank" rel="noopener">
            Ouvrir le site <ArrowUpRight />
          </a>
        )}
      </header>
      <div className="site-board-body">
        <div className="site-board-pages">
          {!placed.length && !elsewhere.length ? (
            <div className="site-board-empty">
              <Globe aria-hidden="true" />
              <p>
                <b>Aucune demande sur le site pour l’instant.</b>
                <br />
                Sur le site de recette, la barre Kora (en bas à droite) permet de commenter chaque élément ; chaque demande arrive ici, page par page, avec la capture de ce qui était visé. La ligne de script et le lien à envoyer sont dans « Partager la revue ».
              </p>
            </div>
          ) : (
            <>
              {pages.map((page) => {
                const items = placed.filter((comment) => siteOf(comment)!.url === page).sort((left, right) => left.id - right.id);
                return (
                  <section key={page} className="site-board-page" aria-label={`Page ${page}`}>
                    <h3>
                      {page} <small>· {items.length} demande{items.length > 1 ? "s" : ""}</small>
                    </h3>
                    <ul className="site-board-grid">{items.map(card)}</ul>
                  </section>
                );
              })}
              {elsewhere.length > 0 && (
                <section className="site-board-page" aria-label="Hors du site">
                  <h3>
                    Reçues ailleurs <small>· {elsewhere.length}</small>
                  </h3>
                  <ul className="site-board-grid">{elsewhere.sort((left, right) => left.id - right.id).map(card)}</ul>
                </section>
              )}
            </>
          )}
        </div>
        {selected && <aside className="site-thread site-board-thread">{renderThread(selected)}</aside>}
      </div>
    </div>
  );
}

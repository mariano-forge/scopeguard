"use client";

// The review canvas of a « Lien » deliverable (agency and client pages, through ReviewCanvas): its staging
// site is reviewed there, with the toolbar (public/kora-toolbar.js); here, the requests it got, page by
// page, each with the capture of what was pointed at. A card opens its request as a pin does, and the
// request's thread shows next to the cards. The agency also gets how to set the toolbar up (`setup`).

import { ArrowUpRight, Globe, MousePointerClick, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SiteAnchor } from "@/lib/siteReview";
import { siteClientUrl } from "@/lib/siteReview";
import { itemLabel, requestKind, requestText, statusLabels, statusTones, type ThreadComment } from "./CanvasComments";

type BoardComment = ThreadComment & { page?: number };
const siteOf = (comment: BoardComment) => (comment as BoardComment & { site?: SiteAnchor }).site;

/** "/" first, then the pages in alphabetical order. */
const byPage = (left: string, right: string) => (left === "/" ? -1 : right === "/" ? 1 : left.localeCompare(right, "fr"));
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

export function SiteBoard({
  siteUrl,
  comments,
  selectedId,
  onOpen,
  renderThread,
  setup,
}: {
  siteUrl?: string;
  comments: BoardComment[];
  /** The request whose thread is open. */
  selectedId: number | null;
  onOpen: (comment: BoardComment) => void;
  renderThread: (comment: BoardComment) => React.ReactNode;
  /** The agency: how to set the toolbar up (the script, the link for the client). */
  setup?: React.ReactNode;
}) {
  const placed = comments.filter((comment) => siteOf(comment));
  const elsewhere = comments.filter((comment) => !siteOf(comment));
  const pages = [...new Set(placed.map((comment) => siteOf(comment)!.url))].sort(byPage);
  const selected = comments.find((comment) => comment.id === selectedId);
  const empty = !placed.length && !elsewhere.length;
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
          <span className="site-card-media">
            {site?.capture ? (
              // The capture, annotated by the toolbar with the element and the click (src/lib/siteCapture.ts).
              <img className="site-card-shot" src={site.capture} alt="" loading="lazy" />
            ) : (
              <span className="site-card-shot is-empty">
                <Globe aria-hidden="true" />
                {site ? <small>{site.selector}</small> : <small>Sans emplacement sur le site</small>}
              </span>
            )}
            <span className={`decision-badge ${statusTones[kind]} site-card-status`}>{statusLabels[kind]}</span>
          </span>
          <span className="site-card-body">
            <span className="site-card-text">{requestText(comment)}</span>
            <span className="site-card-author">
              <span className="site-card-avatar" aria-hidden="true">
                {comment.initials}
              </span>
              {comment.author}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="site-board">
      <header className="site-board-header">
        <span className="site-board-favicon" aria-hidden="true">
          <Globe />
        </span>
        <div className="site-board-title">
          <p className="site-board-eyebrow">Site de recette</p>
          <h2 className="truncate">{host}</h2>
          <p className="site-board-meta">{empty ? "Aucune demande pour l’instant" : `${plural(comments.length, "demande")} · ${plural(pages.length, "page")}`}</p>
        </div>
        {siteLink && (
          <Button asChild className="site-board-open">
            <a href={siteLink} target="_blank" rel="noopener">
              Ouvrir le site <ArrowUpRight />
            </a>
          </Button>
        )}
      </header>

      {/* The agency's setup: open until the first requests arrive, then folded away. */}
      {setup && (
        <details className="site-setup-card" open={empty}>
          <summary>
            <Settings2 aria-hidden="true" /> Paramétrer la barre Kora
            <small>Une seule fois pour toutes les versions</small>
          </summary>
          {setup}
        </details>
      )}

      <div className="site-board-body">
        <div className="site-board-pages">
          {empty ? (
            <div className="site-board-empty">
              <span className="site-board-empty-icon" aria-hidden="true">
                <MousePointerClick />
              </span>
              <b>Aucune demande sur le site pour l’instant.</b>
              <p>Sur le site de recette, la barre Kora (en bas à droite) permet de commenter chaque élément. Chaque demande arrive ici, page par page, avec la capture de ce qui était visé.</p>
            </div>
          ) : (
            <>
              {pages.map((page) => {
                const items = placed.filter((comment) => siteOf(comment)!.url === page).sort((left, right) => left.id - right.id);
                return (
                  <section key={page} className="site-board-page" aria-label={`Page ${page}`}>
                    <h3>
                      <code>{page}</code>
                      <span>{items.length}</span>
                    </h3>
                    <ul className="site-board-grid">{items.map(card)}</ul>
                  </section>
                );
              })}
              {elsewhere.length > 0 && (
                <section className="site-board-page" aria-label="Hors du site">
                  <h3>
                    Reçues ailleurs <span>{elsewhere.length}</span>
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

"use client";

// The review canvas of a « Lien » deliverable (agency and client pages, through ReviewCanvas): its staging
// site is reviewed there, with the toolbar (public/kora-toolbar.js); here, one sheet in the middle of the
// canvas, framed as a browser window: what the toolbar is and the steps to use it (SiteGuide.tsx), then the
// requests it got, page by page, each with the capture of what was pointed at. A card opens its request as
// a pin does, and the request's thread floats over the canvas, docked as a request without pin is
// (ReviewCanvas), so the cards keep the sheet's width. The agency also gets how to set the toolbar up
// (`setup`): its presence is what tells the agency's board from the client's.

import { ArrowUpRight, Globe, Inbox, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SiteAnchor } from "@/lib/siteReview";
import { siteClientUrl } from "@/lib/siteReview";
import { itemLabel, requestKind, requestText, statusLabels, statusTones, type RequestKind, type ThreadComment } from "./CanvasComments";
import { SiteBarDemo, SiteGuideSteps } from "./SiteGuide";

type BoardComment = ThreadComment & { page?: number };
const siteOf = (comment: BoardComment) => (comment as BoardComment & { site?: SiteAnchor }).site;

/** "/" first, then the pages in alphabetical order. */
const byPage = (left: string, right: string) => (left === "/" ? -1 : right === "/" ? 1 : left.localeCompare(right, "fr"));
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
const kinds: RequestKind[] = ["comment", "correction", "outside"];

/** The client's steps: where to click, nothing to set up. */
const clientSteps = [
  { title: "Ouvrez le site", text: "Avec le bouton « Ouvrir le site », en haut." },
  { title: "Cliquez sur « Kora »", text: "En bas à droite, puis entrez le code reçu par e-mail." },
  { title: "Commentez", text: "Choisissez « Commenter » et cliquez sur l’élément à revoir." },
];

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
  const agency = Boolean(setup);
  const placed = comments.filter((comment) => siteOf(comment));
  const elsewhere = comments.filter((comment) => !siteOf(comment));
  const pages = [...new Set(placed.map((comment) => siteOf(comment)!.url))].sort(byPage);
  const selected = comments.find((comment) => comment.id === selectedId);
  const empty = !placed.length && !elsewhere.length;
  // The agency and the client open the site with the toolbar shown.
  const siteLink = siteClientUrl({ type: "Link", url: siteUrl }) ?? siteUrl;
  const pageLink = (page: string) => {
    try {
      return siteClientUrl({ type: "Link", url: new URL(page, siteUrl).toString() });
    } catch {
      return null;
    }
  };
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

  /** One group of cards, headed like a browser tab: the page's address, its count, a way to open it. */
  const group = (label: string, title: React.ReactNode, items: BoardComment[], href?: string | null) => (
    <section key={label} className="site-board-page" aria-label={label}>
      <header className="site-page-tab">
        <span className="site-page-address">{title}</span>
        <span className="site-page-count">{plural(items.length, "demande")}</span>
        {href && (
          <a className="site-page-open" href={href} target="_blank" rel="noopener">
            Ouvrir la page <ArrowUpRight aria-hidden="true" />
          </a>
        )}
      </header>
      <ul className="site-board-grid">{items.sort((left, right) => left.id - right.id).map(card)}</ul>
    </section>
  );

  return (
    <>
      <div className="site-board">
        <article className="site-sheet">
          {/* The sheet is framed as the browser window the site is reviewed in. */}
          <header className="site-board-header">
            <span className="site-chrome-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div className="site-chrome-address">
              <Lock aria-hidden="true" />
              <h2 className="truncate">{host}</h2>
            </div>
            {siteLink && (
              <Button asChild className="site-board-open">
                <a href={siteLink} target="_blank" rel="noopener">
                  Ouvrir le site <ArrowUpRight />
                </a>
              </Button>
            )}
          </header>

          <div className="site-sheet-body">
            <section className="site-hero" aria-label="Site de recette">
              <div className="site-hero-text">
                <h3>Les retours se font sur le site</h3>
                <p>{agency ? "Votre client clique sur un élément et écrit sa demande : elle arrive ici, avec une capture." : "Cliquez sur un élément et écrivez votre demande : elle arrive ici, avec une capture."}</p>
              </div>
              <SiteBarDemo />
            </section>

            {/* The steps: open until the first requests arrive, then folded away. */}
            <details className="site-guide" open={empty}>
              <summary>
                <span>
                  {agency ? "Paramétrer la barre Kora" : "Comment commenter le site"}
                  <small>{agency ? "3 étapes, une seule fois pour toutes les versions" : "3 étapes"}</small>
                </span>
              </summary>
              <div className="site-guide-body">{setup ?? <SiteGuideSteps steps={clientSteps} />}</div>
            </details>

            <section className="site-requests" aria-labelledby="site-requests-title">
              <header className="site-requests-header">
                <h3 id="site-requests-title">Demandes reçues</h3>
                {!empty && (
                  <ul className="site-requests-counts" aria-label="Par qualification">
                    <li className="is-total">
                      {plural(comments.length, "demande")} · {plural(pages.length, "page")}
                    </li>
                    {kinds.map((kind) => {
                      const count = comments.filter((comment) => requestKind(comment) === kind).length;
                      return count ? (
                        <li key={kind} className={`is-${kind}`}>
                          {count} {statusLabels[kind]}
                        </li>
                      ) : null;
                    })}
                  </ul>
                )}
              </header>
              <div className="site-board-pages">
                {empty ? (
                  <div className="site-board-empty">
                    <span className="site-board-empty-icon" aria-hidden="true">
                      <Inbox />
                    </span>
                    <b>Aucune demande sur le site pour l’instant.</b>
                    <p>{agency ? "Elles apparaîtront ici dès que votre client aura commenté un élément du site." : "Vos demandes apparaîtront ici dès votre premier commentaire sur le site."}</p>
                  </div>
                ) : (
                  <>
                    {pages.map((page) =>
                      group(
                        `Page ${page}`,
                        <>
                          <Globe aria-hidden="true" />
                          <span className="site-page-host">{host}</span>
                          <code>{page}</code>
                        </>,
                        placed.filter((comment) => siteOf(comment)!.url === page),
                        pageLink(page),
                      ),
                    )}
                    {elsewhere.length > 0 && group("Hors du site", "Reçues ailleurs", elsewhere)}
                  </>
                )}
              </div>
            </section>
          </div>
        </article>
      </div>
      {selected && <div className="canvas-docked-thread">{renderThread(selected)}</div>}
    </>
  );
}

"use client";

// The canvas of a « Lien » deliverable (agency and client pages, through ReviewCanvas): its staging site is
// reviewed there, with the toolbar (public/kora-toolbar.js); here, on Kora's canvas, a sheet framed as a
// browser window that says what to do (the agency's setup, or the client's steps), then, in a section of
// its own, each request as a page: the capture of the window at the click, its pin where the click was.
// ReviewCanvas draws the pins and threads on those pages as on any deliverable's (`renderPage`). The
// agency's board is told from the client's by `setup`, which only the agency gets.

import { useState } from "react";
import { ArrowUpRight, Check, Copy, Globe, Inbox, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SiteAnchor } from "@/lib/siteReview";
import { siteClientUrl } from "@/lib/siteReview";
import { isAgencyDraft, type ThreadComment } from "./CanvasComments";
import { SiteBarDemo, SiteGuideSteps, useLocalAccessNote } from "./SiteGuide";

type BoardComment = ThreadComment & { page?: number; pinnedOn?: number };
const siteOf = (comment: BoardComment) => (comment as BoardComment & { site?: SiteAnchor }).site;

/** "/" first, then the pages in alphabetical order. */
const byPage = (left: string, right: string) => (left === "/" ? -1 : right === "/" ? 1 : left.localeCompare(right, "fr"));
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** The client's steps: where to click, nothing to set up. */
const clientSteps = [
  { title: "Ouvrez le site", text: "Avec le bouton « Ouvrir le site », en haut." },
  { title: "Cliquez sur « Kora »", text: "En bas à droite, puis entrez le code reçu par e-mail." },
  { title: "Commentez", text: "Choisissez « Commenter » et cliquez sur l’élément à revoir." },
];

/**
 * The requests placed on the site as pages of the canvas, one per request, grouped by page of the site:
 * each comment gets its page and its pin at the click on the capture. A pin the agency dropped in Kora on
 * a capture (`pinnedOn`) shares its request's page, at its own place. A request without anchor (received
 * elsewhere) has no page and no pin: its thread is docked, as on any deliverable.
 */
export function sitePages<T extends BoardComment>(comments: T[]) {
  const placed = comments.filter((comment) => siteOf(comment));
  const urls = [...new Set(placed.map((comment) => siteOf(comment)!.url))].sort(byPage);
  const groups: { url: string; items: { page: number; comment: T }[] }[] = [];
  let page = 0;
  for (const url of urls) {
    const items = placed.filter((comment) => siteOf(comment)!.url === url).sort((left, right) => left.id - right.id);
    groups.push({ url, items: items.map((comment, index) => ({ page: page + index + 1, comment })) });
    page += items.length;
  }
  const pageOf = new Map(groups.flatMap((group) => group.items.map((item) => [item.comment.id, item.page] as const)));
  const onCanvas = comments.map((comment): T => {
    const site = siteOf(comment);
    const at = pageOf.get(comment.id);
    if (at && site) return { ...comment, page: at, position: site.view ?? { x: 50, y: 50 }, area: undefined };
    const pinned = comment.pinnedOn !== undefined ? pageOf.get(comment.pinnedOn) : undefined;
    if (pinned && comment.position) return { ...comment, page: pinned };
    return { ...comment, page: undefined, position: undefined, area: undefined };
  });
  return { groups, comments: onCanvas };
}

/** The site's link with the toolbar shown (?kora), as « Ouvrir le site » opens it: to paste or to send. */
function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="site-board-copy"
      aria-label="Copier le lien du site"
      title={href}
      onClick={() => void navigator.clipboard.writeText(href).then(() => setCopied(true))}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Lien copié" : "Copier le lien"}
    </Button>
  );
}

export function SiteBoard({
  siteUrl,
  comments,
  renderPage,
  setup,
}: {
  siteUrl?: string;
  comments: BoardComment[];
  /** A page of the canvas (ReviewCanvas): the capture, with the pins and the open thread over it. */
  renderPage: (page: number, content: React.ReactNode) => React.ReactNode;
  /** The agency: how to set the toolbar up (the script, the link for the client). */
  setup?: React.ReactNode;
}) {
  const agency = Boolean(setup);
  // Kora on this computer: the browser may ask before showing the toolbar, said in the step that opens it.
  const localAccess = useLocalAccessNote();
  const { groups } = sitePages(comments);
  const steps = <SiteGuideSteps steps={localAccess ? clientSteps.map((step, index) => (index === 1 ? { ...step, text: <>{step.text} {localAccess}</> } : step)) : clientSteps} />;
  // The requests, not the agency's draft comments (pins without a status): what the board counts.
  const requests = comments.filter((comment) => !isAgencyDraft(comment));
  const empty = !requests.length;
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
  // What the sheet says first depends on who reads it and where the review is.
  const hero = !agency
    ? { title: "Commentez le site avec la barre Kora", text: "Cliquez sur un élément du site et écrivez votre demande : elle arrive ici, avec une capture de ce que vous visiez." }
    : empty
      ? { title: "Les retours peuvent se faire avec la barre Kora, directement sur votre site", text: "Le décideur clique sur un élément et écrit sa demande : elle arrive ici, avec une capture." }
      : { title: `${plural(requests.length, "demande")} ${requests.length > 1 ? "reçues" : "reçue"} sur le site`, text: "Chacune est ci-dessous, sur la capture de sa page. Ouvrez une épingle pour la qualifier." };

  /** A request's page: the capture of the window at the click, or what is known of the element without it. */
  const shot = (comment: BoardComment) => {
    const site = siteOf(comment)!;
    return site.capture ? (
      // The capture, annotated by the toolbar with the element and the click (src/lib/siteCapture.ts).
      <img className="site-shot" src={site.capture} alt={`Capture de ${site.url}`} loading="lazy" draggable={false} />
    ) : (
      <span className="site-shot is-empty">
        <Globe aria-hidden="true" />
        <small>{site.selector}</small>
      </span>
    );
  };

  return (
    <div className="site-canvas">
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
          {siteLink && <CopyLink href={siteLink} />}
          {siteLink && (
            <Button asChild className="site-board-open">
              <a href={siteLink} target="_blank" rel="noopener">
                Ouvrir le site <ArrowUpRight />
              </a>
            </Button>
          )}
        </header>

        <div className="site-sheet-body">
          {/* Before the first requests, the whole tutorial: the title across the sheet, the toolbar at work,
              then the agency's setup or the client's steps. Once requests come, all of it folds under one line
              (feedback of 26 October 2026); the site's link stays in the window's bar above. */}
          {empty ? (
            <>
              <section className="site-hero" aria-label="Site de recette">
                <h3>{hero.title}</h3>
                <p>{hero.text}</p>
                <SiteBarDemo />
              </section>
              {setup ? (
                <details className="site-guide" open>
                  <summary>
                    <span>
                      Paramétrer la barre Kora
                      <small>3 étapes · une ligne par site</small>
                    </span>
                  </summary>
                  <div className="site-guide-body">{setup}</div>
                </details>
              ) : (
                steps
              )}
            </>
          ) : (
            <details className="site-guide">
              <summary>
                <span>
                  {agency ? "Paramétrer la barre Kora" : "Commenter le site avec la barre Kora"}
                  <small>{hero.title}</small>
                </span>
              </summary>
              <div className="site-guide-body">
                <SiteBarDemo />
                {setup ?? steps}
              </div>
            </details>
          )}
        </div>
      </article>

      {/* The requests, apart from the sheet: one page per request, under the page of the site it was made on. */}
      <section className="site-requests" aria-labelledby="site-requests-title">
        <header className="site-requests-header">
          <h3 id="site-requests-title">Demandes reçues</h3>
        </header>
        {!groups.length ? (
          <div className="site-board-empty">
            <span className="site-board-empty-icon" aria-hidden="true">
              <Inbox />
            </span>
            <b>Aucune demande sur le site pour l’instant.</b>
            <p>{agency ? "Elles apparaîtront ici dès que le décideur aura commenté un élément du site." : "Vos demandes apparaîtront ici dès votre premier commentaire sur le site."}</p>
          </div>
        ) : (
          groups.map((group) => {
            const href = pageLink(group.url);
            return (
              <section key={group.url} className="site-request-group" aria-label={`Page ${group.url}`}>
                <header className="site-page-tab">
                  <span className="site-page-address">
                    <Globe aria-hidden="true" />
                    <span className="site-page-host">{host}</span>
                    <code>{group.url}</code>
                  </span>
                  <span className="site-page-count">{plural(group.items.length, "demande")}</span>
                  {href && (
                    <a className="site-page-open" href={href} target="_blank" rel="noopener">
                      Ouvrir la page <ArrowUpRight aria-hidden="true" />
                    </a>
                  )}
                </header>
                {group.items.map((item) => (
                  <div key={item.comment.id} className="site-request-page">
                    {renderPage(item.page, shot(item.comment))}
                  </div>
                ))}
              </section>
            );
          })
        )}
      </section>
    </div>
  );
}

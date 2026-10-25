"use client";

// The canvas of a « Figma » deliverable (US-054, agency and client pages, through ReviewCanvas): the mock-up
// is reviewed in Figma, where the client comments as usual; here, a sheet that says which file, which
// saved version and which pages are up for review, and how the comments reach Kora. The requests are
// listed in the panel; their thread opens docked, as a request received elsewhere.

import { ArrowUpRight, Frame, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FigmaRound } from "@/lib/figmaLink";
import { isAgencyDraft, type ThreadComment } from "./CanvasComments";

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

export function FigmaBoard({ url, round, comments, agency, panel }: { url?: string; round?: FigmaRound; comments: ThreadComment[]; agency: boolean; panel?: React.ReactNode }) {
  const requests = comments.filter((comment) => !isAgencyDraft(comment));
  const reviewed = round ? round.pages.filter((page) => round.reviewed.includes(page.id)).map((page) => page.name) : [];
  const hero = !agency
    ? { title: "Commentez la maquette dans Figma", text: "Ouvrez le fichier, choisissez l’outil Commentaire (touche C) et cliquez sur l’écran à revoir : l’organisation reçoit votre demande ici." }
    : requests.length
      ? { title: `${plural(requests.length, "demande")} ${requests.length > 1 ? "reçues" : "reçue"} de Figma`, text: "Elles sont dans le panneau « Demandes » : ouvrez-en une pour la qualifier." }
      : { title: "Les retours de vos clients se font dans Figma", text: "Les commentaires laissés sur les pages en revue arrivent ici, pour que vous les qualifiiez. Les devis et la validation se font dans Kora." };

  return (
    <div className="site-canvas">
      <article className="site-sheet figma-sheet">
        <header className="site-board-header">
          <div className="site-chrome-address">
            <Frame aria-hidden="true" />
            <h2 className="truncate">{round?.fileName ?? "Fichier Figma"}</h2>
          </div>
          {url && (
            <Button asChild className="site-board-open">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Ouvrir dans Figma <ArrowUpRight />
              </a>
            </Button>
          )}
        </header>
        <div className="site-sheet-body">
          <section className="site-hero">
            <h3>{hero.title}</h3>
            <p>{hero.text}</p>
          </section>
          {round && (
            <dl className="figma-round">
              <div>
                <dt>Version Figma revue</dt>
                <dd>
                  « {round.version.label} »{round.version.createdAt && <>, enregistrée le {day(round.version.createdAt)}</>}
                  {round.version.author && <> par {round.version.author}</>}
                </dd>
              </div>
              <div>
                <dt>{reviewed.length > 1 ? "Pages en revue" : "Page en revue"}</dt>
                <dd>{reviewed.join(", ")}</dd>
              </div>
            </dl>
          )}
          {panel}
        </div>
      </article>
      {!requests.length && (
        <section className="site-requests" aria-label="Demandes reçues">
          <div className="site-board-empty">
            <span className="site-board-empty-icon" aria-hidden="true">
              <Inbox />
            </span>
            <b>Aucune demande de Figma pour l’instant.</b>
            <p>{agency ? "Elles apparaîtront ici dès que le client aura commenté une page en revue." : "Vos commentaires sur les pages en revue apparaîtront ici."}</p>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

// « Aide » (/aide): how Kora works in a few steps, the guided tour of a deliverable once more, and the keyboard
// shortcuts. No contact with Kora's team yet (decided with the product owner on 25 October 2026).

import { useRouter } from "next/navigation";
import { BadgeCheck, Compass, Keyboard, ReceiptText, Share2, Tag, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deliverableTourKey } from "./DeliverableTour";
import { keyboardShortcuts } from "./shortcuts";

const guides: { icon: LucideIcon; title: string; steps: string[] }[] = [
  {
    icon: Share2,
    title: "Partager une revue",
    steps: [
      "Ouvrez le livrable, puis « Partager la revue ».",
      "Invitez les personnes du client : les décideurs valident la version et décident de vos propositions, les contributeurs commentent.",
      "Rien ne leur est visible avant ce partage.",
    ],
  },
  {
    icon: Tag,
    title: "Qualifier une demande",
    steps: [
      "Cliquez sur le livrable pour commenter, ou ajoutez avec « + Demande » une demande reçue ailleurs.",
      "Qualifiez-la : « À clarifier », « Inclus » (prévu au devis) ou « Hors scope ».",
      "Qualifiée, elle devient visible du client ; un commentaire non qualifié reste votre brouillon.",
    ],
  },
  {
    icon: ReceiptText,
    title: "Préparer une proposition",
    steps: [
      "Sur une demande hors scope, « Préparer la proposition » : « Facturer » (un montant, un délai) ou « Offrir » (sa valeur).",
      "« Envoyer la proposition » la transmet aux décideurs, par e-mail et dans leur revue.",
      "Un devis s’accepte ou se refuse ; une offre n’a rien à décider.",
    ],
  },
  {
    icon: BadgeCheck,
    title: "Validation et preuve",
    steps: [
      "Le décideur valide la version quand aucun devis n’attend sa réponse.",
      "« Synthèse & export », dans le menu du livrable, rassemble ses demandes, les décisions et le journal signé.",
    ],
  },
];

/** `tourHref`: the deliverable the guided tour replays on (the latest opened), none before any. */
export function HelpPage({ tourHref }: { tourHref?: string }) {
  const router = useRouter();
  function replayTour() {
    if (!tourHref) return;
    try {
      window.localStorage.removeItem(deliverableTourKey);
    } catch {
      // Not forgotten: the tour may not show again.
    }
    router.push(tourHref);
  }
  return (
    <div className="browser">
      <header className="page-header">
        <h1 className="page-title">Aide</h1>
      </header>

      <section className="browser-section" aria-labelledby="help-guides">
        <h2 id="help-guides">Kora en quatre gestes</h2>
        <div className="grid gap-3 @container md:grid-cols-2">
          {guides.map((guide) => (
            <Card key={guide.title} className="gap-3 shadow-none" role="region" aria-label={guide.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="grid size-8 place-items-center rounded-lg bg-muted" aria-hidden="true">
                    <guide.icon className="size-4" />
                  </span>
                  {guide.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground marker:text-foreground">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="browser-section" aria-labelledby="help-tour">
        <h2 id="help-tour">Visite guidée</h2>
        <Card className="flex-row flex-wrap items-center justify-between gap-3 px-5 shadow-none">
          <p className="m-0 flex items-center gap-2 text-sm">
            <Compass aria-hidden="true" className="size-4 shrink-0" />
            {tourHref ? "Revoyez, sur votre dernier livrable ouvert, ce que fait chaque outil de la page." : "La visite se fait sur un livrable : ouvrez-en un, puis revenez ici."}
          </p>
          <Button variant="outline" onClick={replayTour} disabled={!tourHref}>
            Revoir la visite guidée
          </Button>
        </Card>
      </section>

      <section className="browser-section" aria-labelledby="help-shortcuts">
        <h2 id="help-shortcuts" className="flex items-center gap-2">
          <Keyboard aria-hidden="true" className="size-4" /> Raccourcis clavier
        </h2>
        <Card className="px-5 shadow-none">
          <dl className="shortcuts-list m-0">
            {keyboardShortcuts.map(([keys, action]) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </div>
  );
}

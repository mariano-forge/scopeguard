"use client";

// « Bien démarrer », on the home page: what a new agency still has to do before its first review (what
// it skipped in /demarrer, then importing and sharing a deliverable). Each step is ticked from the
// agency's data; the list leaves once everything is done, or when the member hides it.

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "./CurrentUser";

type Step = { id: string; label: string; text: string; done: boolean; action?: { label: string; run: () => void } | { label: string; href: string } };

/** Hidden by this member on this browser: a convenience, nothing depends on it. */
const hiddenKey = (organizationId: string) => `kora:bien-demarrer:${organizationId}`;
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
function readHidden(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function GettingStarted({
  spaces,
  projects,
  deliverables,
  shared,
  firstDeliverableHref,
  onNewClient,
  onNewProject,
  onNewDeliverable,
}: {
  spaces: number;
  projects: number;
  deliverables: number;
  /** A version was shared with someone of the client. */
  shared: boolean;
  firstDeliverableHref?: string;
  onNewClient: () => void;
  onNewProject: () => void;
  onNewDeliverable: () => void;
}) {
  const { organizationId } = useCurrentUser();
  const key = hiddenKey(organizationId ?? "");
  // Hidden while rendered on the server: it appears once the browser has said whether it was hidden.
  const hidden = useSyncExternalStore(subscribe, () => readHidden(key), () => true);

  const steps: Step[] = [
    { id: "agency", label: "Créer votre organisation", text: "", done: true },
    { id: "space", label: "Créer votre premier espace", text: "Un client, une marque ou une équipe interne : il regroupe vos projets.", done: spaces > 0, action: { label: "Créer un espace", run: onNewClient } },
    { id: "project", label: "Créer un projet", text: "Il regroupe les livrables d’une même mission.", done: projects > 0, action: { label: "Créer un projet", run: onNewProject } },
    { id: "deliverable", label: "Importer un livrable", text: "Une maquette, un PDF, une vidéo ou l’adresse d’un site.", done: deliverables > 0, action: { label: "Importer un livrable", run: onNewDeliverable } },
    {
      id: "share",
      label: "Partager avec votre client",
      text: "Invitez-le sur un livrable : il commente sur place, vous qualifiez chaque demande.",
      done: shared,
      action: firstDeliverableHref ? { label: "Partager la revue", href: `${firstDeliverableHref}?partage=1` } : undefined,
    },
  ];
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  if (!next || hidden) return null;

  function hide() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage refused (private window): the list simply stays.
    }
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }

  return (
    <section className="getting-started" aria-labelledby="getting-started-title">
      <header>
        <div>
          <h2 id="getting-started-title">Bien démarrer</h2>
          <p>
            {done} sur {steps.length} · jusqu’à votre première revue client
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Masquer « Bien démarrer »" onClick={hide}>
          <X />
        </Button>
      </header>
      <div className="getting-started-bar" aria-hidden="true">
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol>
        {steps.map((step) => {
          const current = step === next;
          return (
            <li key={step.id} data-done={step.done ? "" : undefined} data-current={current ? "" : undefined}>
              <span className="getting-started-check">
                {step.done && (
                  <>
                    <Check aria-hidden="true" />
                    <span className="sr-only">Fait :</span>
                  </>
                )}
              </span>
              <span className="getting-started-text">
                <b>{step.label}</b>
                {current && <small>{step.text}</small>}
              </span>
              {current &&
                step.action &&
                ("href" in step.action ? (
                  <Button asChild size="sm">
                    <Link href={step.action.href}>{step.action.label}</Link>
                  </Button>
                ) : (
                  <Button size="sm" onClick={step.action.run}>
                    {step.action.label}
                  </Button>
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

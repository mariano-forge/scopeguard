// On a project's deliverables, until its scope is active: why to frame it now, and the way to its tab. Without
// an active scope, every request is qualified from memory and out-of-scope work is easily given away.

import Link from "next/link";
import { Target } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { scopeStatus, type ProjectScope } from "@/lib/projectScope";
import { href } from "./routes";

export function ScopeRecommendation({ projectId, scope }: { projectId: number; scope?: ProjectScope }) {
  if (scopeStatus(scope) === "active") return null;
  // A draft with an included line only waits for its activation; otherwise it is still to fill.
  const toActivate = Boolean(scope?.lines.length);
  return (
    // A standing advice, not an alert to announce: a note.
    <Alert role="note" aria-label="Recommandation sur le périmètre">
      <Target aria-hidden="true" />
      <AlertTitle>{toActivate ? "Recommandé : activez le périmètre du projet" : "Recommandé : complétez et activez le périmètre du projet"}</AlertTitle>
      <AlertDescription>
        <p>
          Un périmètre actif sert de référence à chaque retour du client : vous qualifiez une demande « Inclus » ou « Hors scope » d’un coup d’œil, et ce qui dépasse le devis
          devient un avenant chiffré plutôt qu’un travail offert.
        </p>
        <Button size="sm" variant="outline" asChild>
          <Link href={href.scope(projectId)}>{toActivate ? "Finaliser le périmètre" : "Compléter le périmètre"}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// On a project's deliverables, until its scope is active: the AI suggestions it unlocks, and the way to its
// tab. A light card of the design system (DESIGN.md « Bannières »): the text and a button on the left; on the
// right, when there is room, a client's request with the AI's work on it: the request read, the initial scope
// checked, the qualification suggested. Gone once the scope is active.

import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { scopeStatus, type ProjectScope } from "@/lib/projectScope";
import { statusLabels } from "./editor/CanvasComments";
import { href } from "./routes";

/** What the AI does with a request, step by step, ending on its suggestion. */
const steps = ["Analyse de la demande", "Vérification du périmètre initial"];

/** A client's request with the AI's work on it, in one card: an illustration, not data. */
function SuggestionIllustration() {
  return (
    <div aria-hidden="true" className="hidden shrink-0 items-center py-6 pr-6 @3xl:flex">
      <div className="grid w-72 gap-3 rounded-xl border bg-paper p-4">
        <span className="flex items-center gap-2 text-sm text-ink">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-status-clarify-bg text-[10px] font-semibold text-status-clarify-text">CD</span>
          {"« Ajouter une page Blog\u00a0? »"}
        </span>
        <span className="grid gap-2 border-t pt-3 text-xs">
          {steps.map((step) => (
            <span key={step} className="flex items-center gap-2 text-graphite">
              <Check className="size-3.5 text-status-resolved-text" /> {step}
            </span>
          ))}
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Sparkles className="size-3.5 text-status-low-text" />
            <span>
              Suggestion IA{" "}: <span className="text-status-scope-text">{statusLabels.outside}</span>
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

export function ScopeRecommendation({ projectId, scope }: { projectId: number; scope?: ProjectScope }) {
  if (scopeStatus(scope) === "active") return null;
  // A draft with an included line only waits for its activation; otherwise it is still to fill.
  const toActivate = Boolean(scope?.lines.length);
  return (
    // A standing invitation, not an alert to announce: a note.
    <Card role="note" aria-label="Recommandation sur le périmètre" className="@container flex-row items-stretch gap-0 rounded-xl border-transparent bg-announce py-0 shadow-none">
      <div className="flex flex-1 flex-col items-start justify-center gap-2 p-6">
        <p className="m-0 flex items-center gap-1.5 text-xs font-semibold text-status-low-text">
          <Sparkles aria-hidden="true" className="size-3.5" /> Nouveau
        </p>
        <h2 className="m-0 font-heading text-xl font-semibold text-ink">Activez les suggestions IA</h2>
        <p className="m-0 max-w-[56ch] text-sm text-graphite">
          {toActivate ? "Activez" : "Complétez et activez"} votre périmètre initial afin de recevoir les suggestions IA sur chaque demande client.
        </p>
        <Button variant="outline" className="mt-2 bg-paper" asChild>
          <Link href={href.scope(projectId)}>
            {toActivate ? "Finaliser le périmètre" : "Compléter le périmètre"} <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <SuggestionIllustration />
    </Card>
  );
}

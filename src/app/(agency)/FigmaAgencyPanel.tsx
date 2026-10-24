"use client";

// The agency's part of a « Figma » deliverable's board (US-054): the file's comments are brought in when the
// deliverable opens and on « Actualiser » (src/db/figmaImport.ts), and the people seen in Figma are told
// apart: the agency's team stays in Figma, the client's requests come into Kora. It reads the agency's
// settings (figmaTeam, figmaImports) from the shared state, which the client never receives.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { agencyAction } from "@/lib/agencyActions";
import type { FigmaRound } from "@/lib/figmaLink";
import { readSharedState, subscribeSharedState } from "@/lib/stateSync";

type Imported = { id: number; deliverableId?: number; author?: string; figma?: { authorId?: string } };
type Settings = { team: Record<string, string>; importedAt: string | null; framesMissing: boolean; people: { id: string; handle: string }[] };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** What the panel needs of the agency's state, for the versions `versionIds` of the deliverable. */
function readSettings(serialized: string | null, deliverableId: number, versionIds: number[]): Settings {
  let state: Record<string, unknown> = {};
  try {
    state = serialized ? (JSON.parse(serialized) as Record<string, unknown>) : {};
  } catch {
    state = {};
  }
  const team = (state.figmaTeam ?? {}) as Record<string, string>;
  const imports = (state.figmaImports ?? {}) as Record<string, { at?: string; framesTriedAt?: string }>;
  const mark = imports[String(deliverableId)];
  const people = new Map<string, string>(Object.entries(team));
  for (const comment of (state.comments ?? []) as Imported[]) {
    const authorId = comment.figma?.authorId;
    if (authorId && versionIds.includes(comment.deliverableId ?? -1) && comment.author) people.set(authorId, comment.author);
  }
  return {
    team,
    importedAt: mark?.at || null,
    framesMissing: Boolean(mark?.framesTriedAt),
    people: [...people].map(([id, handle]) => ({ id, handle })).sort((left, right) => left.handle.localeCompare(right.handle, "fr")),
  };
}

export function FigmaAgencyPanel({ deliverableId, versionIds, round, readOnly }: { deliverableId: number; versionIds: number[]; round: FigmaRound; readOnly: boolean }) {
  const serialized = useSyncExternalStore(subscribeSharedState, readSharedState, () => null);
  const versionKey = versionIds.join(",");
  // The ids compared by value (versionKey): a new array at each render reads the state again for nothing.
  const settings = useMemo(() => readSettings(serialized, deliverableId, versionKey.split(",").map(Number)), [serialized, deliverableId, versionKey]);
  const [pending, setPending] = useState(false);

  async function bringIn(quiet: boolean) {
    setPending(true);
    const answer = await agencyAction(`deliverables/${deliverableId}/figma-import`, "POST");
    setPending(false);
    if (!answer || quiet) return;
    const imported = Number(answer.imported) || 0;
    const replies = Number(answer.replies) || 0;
    toast(imported || replies ? [imported && plural(imported, "nouvelle demande"), replies && plural(replies, "réponse")].filter(Boolean).join(" et ") + " de Figma" : "Rien de nouveau dans Figma");
  }

  // Opened: the comments posted since the last time are brought in (the server reads Figma at most every few seconds).
  useEffect(() => {
    if (readOnly) return;
    void agencyAction(`deliverables/${deliverableId}/figma-import`, "POST");
  }, [deliverableId, readOnly]);

  async function setTeam(person: { id: string; handle: string }, member: boolean) {
    const answer = await agencyAction("integrations/figma/team", "PUT", { figmaUserId: person.id, handle: person.handle, member });
    if (!answer) return;
    const removed = Number(answer.removed) || 0;
    toast(member ? `${person.handle} est de l’équipe : ses commentaires restent dans Figma${removed ? ` (${plural(removed, "retiré")} de Kora)` : ""}.` : `${person.handle} n’est plus de l’équipe : ses prochains commentaires arriveront dans Kora.`);
  }

  return (
    <section className="figma-agency" aria-label="Commentaires de Figma">
      <div className="figma-agency-sync">
        <p className="text-sm text-muted-foreground">
          {settings.importedAt ? `Dernière lecture de Figma : ${when(settings.importedAt)}.` : "Les commentaires de Figma n’ont pas encore été lus."}
        </p>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void bringIn(false)}>
            <RotateCcw /> Actualiser
          </Button>
        )}
      </div>
      {settings.framesMissing && !round.frames && (
        <p role="note" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
          Figma n’a pas laissé Kora lire les écrans de cette version (limite de lectures du compte connecté) : les commentaires de toutes les pages arrivent, en attendant.
        </p>
      )}
      {settings.people.length > 0 && (
        <fieldset className="figma-people">
          <legend>Personnes vues dans Figma</legend>
          <p className="text-sm text-muted-foreground">Cochez les membres de votre équipe : leurs commentaires restent dans Figma.</p>
          {settings.people.map((person) => (
            <label key={person.id} className="figma-page">
              <input type="checkbox" checked={Object.hasOwn(settings.team, person.id)} onChange={(event) => void setTeam(person, event.target.checked)} />
              <span>
                {person.handle} <span className="text-muted-foreground">· de l’équipe</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}

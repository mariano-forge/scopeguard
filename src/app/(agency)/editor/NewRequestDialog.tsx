"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Modal } from "@/components/modal";
import type { RequestChannel } from "@/lib/requestSource";
import { ScopeChoice, type Qualification, type Qualified } from "./CanvasComments";
import { SuggestionNote, useSuggestion, type ScopeAssist } from "./QualifyAssist";
import { ProposalFields, preparedProposal, proposalDraft, proposalReady } from "./ProposalFields";
import { emptySource, RequestSourceFields, sourceOf } from "./RequestSourceFields";

/** What the dialog gives back: the request, where it came from, and a capture to import first. */
export type NewRequest = Qualified & { source?: { channel: RequestChannel; channelName?: string; receivedAt?: string; excerpt?: string }; capture?: File };

/**
 * A request entered by the agency: one received elsewhere (an e-mail, a call, a meeting…), or one about
 * the whole deliverable, where no point can be pinned. Qualified now or left to clarify, with its source,
 * the client's words and a capture (src/lib/requestSource.ts), and the proposal prepared with it (a quote or an offer).
 */
export function NewRequestDialog({
  initial,
  onClose,
  onCreate,
  assist,
}: {
  /** Qualification picked in the menu; null = closed. */
  initial: Qualification | null;
  onClose: () => void;
  onCreate: (request: NewRequest) => void;
  /** The project's active scope: the line an « Inclus » cites, and the AI's suggestion on what is typed. */
  assist?: ScopeAssist;
}) {
  return initial ? <RequestForm key={initial} initial={initial} onClose={onClose} onCreate={onCreate} assist={assist} /> : null;
}

function RequestForm({ initial, onClose, onCreate, assist }: { initial: Qualification; onClose: () => void; onCreate: (request: NewRequest) => void; assist?: ScopeAssist }) {
  const [source, setSource] = useState(emptySource);
  const [decision, setDecision] = useState<Qualification>(initial);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [proposal, setProposal] = useState(() => proposalDraft());
  // Asked by the agency once the request is described: its answer pre-fills the qualification.
  const suggestion = useSuggestion(assist?.suggestionPath, (suggested) => {
    setDecision(suggested.decision);
    if (suggested.title) setTitle((typed) => typed.trim() || suggested.title!);
  });
  const described = Boolean(title.trim() || description.trim() || source.excerpt.trim());
  const outside = decision === "Hors périmètre";
  const ready = title.trim() && (!outside || proposalReady(proposal));

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle demande"
      description="Une demande reçue ailleurs (e-mail, appel, réunion…) ou portant sur tout le livrable."
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onCreate({
          title: title.trim(),
          description: description.trim(),
          decision,
          ...(outside ? preparedProposal(proposal) : {}),
          source: sourceOf(source),
          capture: sourceOf(source) ? source.capture?.file : undefined,
        });
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={!ready}>
            Créer la demande
          </Button>
        </>
      }
    >
      <div className="scope-field">
        <span className="scope-field-label">Qualifier la demande</span>
        <ScopeChoice value={decision} onChange={setDecision} clarify />
      </div>
      <Field id="request-title" label="Titre de la demande">
        <Input id="request-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. : Ajouter une section témoignages" />
      </Field>
      <Field id="request-description" label="Description" optional>
        <Textarea id="request-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Précisions utiles : où, comment, contraintes…" />
      </Field>
      {suggestion.offered && (described || suggestion.state.status !== "idle") && (
        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-end"
            disabled={!described || suggestion.state.status === "asking"}
            onClick={() => suggestion.ask({ title: title.trim(), description: description.trim(), excerpt: source.excerpt.trim() })}
          >
            <Sparkles aria-hidden="true" /> Suggérer avec l’IA
          </Button>
          <SuggestionNote state={suggestion.state} />
        </div>
      )}
      {outside && <ProposalFields id="request-proposal" draft={proposal} onChange={setProposal} />}
      <RequestSourceFields id="request-source" value={source} onChange={setSource} />
    </Modal>
  );
}

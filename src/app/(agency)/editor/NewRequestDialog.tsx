"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AddonInput, Field, Modal } from "@/components/modal";
import { ScopeChoice, type Qualification, type Qualified } from "./CanvasComments";

/**
 * A request created directly, already qualified (Inclus or Hors scope), without a comment first.
 * Same fields as qualifying a comment in its bubble: choice, title, description, and the optional quote.
 */
export function NewRequestDialog({
  initial,
  onClose,
  onCreate,
}: {
  /** Qualification picked in the menu; null = closed. */
  initial: Qualification | null;
  onClose: () => void;
  onCreate: (request: Qualified) => void;
}) {
  return initial ? <RequestForm key={initial} initial={initial} onClose={onClose} onCreate={onCreate} /> : null;
}

function RequestForm({ initial, onClose, onCreate }: { initial: Qualification; onClose: () => void; onCreate: (request: Qualified) => void }) {
  const [decision, setDecision] = useState<Qualification>(initial);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quoteOn, setQuoteOn] = useState(false);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [counter, setCounter] = useState(false);
  const outside = decision === "Hors périmètre";
  const ready = title.trim() && (!outside || !quoteOn || Number(amount) > 0);

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle demande"
      description="Une demande déjà qualifiée, sans passer par un commentaire."
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onCreate({
          title: title.trim(),
          description: description.trim(),
          decision,
          quote: outside && quoteOn ? { amount: Number(amount), days: Number(days) || 0, counter } : undefined,
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
        <ScopeChoice value={decision} onChange={setDecision} />
      </div>
      <Field id="request-title" label="Titre de la demande">
        <Input id="request-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. : Ajouter une section témoignages" />
      </Field>
      <Field id="request-description" label="Description" optional>
        <Textarea id="request-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Précisions utiles : où, comment, contraintes…" />
      </Field>
      {outside && (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="request-quote" className="grid gap-0.5 text-sm font-normal">
              Chiffrer maintenant
              <span className="text-xs text-muted-foreground">Pré-remplit la proposition, rien n’est envoyé au client.</span>
            </Label>
            <Switch id="request-quote" checked={quoteOn} onCheckedChange={setQuoteOn} />
          </div>
          {quoteOn && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field id="request-amount" label="Montant HT">
                  <AddonInput id="request-amount" addon="€" type="number" min="0" step="10" placeholder="850" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </Field>
                <Field id="request-days" label="Délai">
                  <AddonInput id="request-days" addon="jours" type="number" min="0" step="1" placeholder="3" value={days} onChange={(event) => setDays(event.target.value)} />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="request-counter" className="text-sm font-normal">
                  Le client peut faire une contre-proposition
                </Label>
                <Switch id="request-counter" checked={counter} onCheckedChange={setCounter} />
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

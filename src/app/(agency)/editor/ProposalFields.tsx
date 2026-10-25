"use client";

// The proposal of an out-of-scope request, prepared while qualifying it (the bubble's form and « + Demande »):
// « Facturer » (a quote: amount, delay, counter-proposal allowed or not) or « Offrir » (done for free, valued:
// src/lib/requestOffer.ts). Nothing reaches the client before « Envoyer la proposition ».

import { Gift, ReceiptText } from "lucide-react";
import { AddonInput, Field } from "@/components/modal";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type ProposalMode = "price" | "offer";
/** The form's fields, as typed. */
export type ProposalDraft = { on: boolean; mode: ProposalMode; amount: string; days: string; counter: boolean };
/** What the form gives: a quote, an offer, or neither (not prepared now). */
export type PreparedProposal = { quote?: { amount: number; days: number; counter: boolean }; offer?: { amount: number; days: number } };

/** The fields of a proposal prepared before (a draft quote or a draft offer), or empty. */
export function proposalDraft(from: PreparedProposal = {}, on = false): ProposalDraft {
  const value = from.offer ?? from.quote;
  return {
    on: on || Boolean(value),
    mode: from.offer ? "offer" : "price",
    amount: value ? String(value.amount) : "",
    days: value?.days ? String(value.days) : "",
    counter: from.quote?.counter ?? false,
  };
}

/** Ready when not prepared now, or with an amount (a quote's price, an offer's value: both required). */
export const proposalReady = (draft: ProposalDraft) => !draft.on || Number(draft.amount) > 0;

export function preparedProposal(draft: ProposalDraft): PreparedProposal {
  if (!draft.on) return {};
  const amount = Number(draft.amount);
  const days = Math.max(0, Math.round(Number(draft.days) || 0));
  return draft.mode === "offer" ? { offer: { amount, days } } : { quote: { amount, days, counter: draft.counter } };
}

const modes: { value: ProposalMode; label: string; hint: string; icon: typeof Gift }[] = [
  { value: "price", label: "Facturer", hint: "Un devis que le client accepte ou refuse", icon: ReceiptText },
  { value: "offer", label: "Offrir", hint: "Fait sans être facturé, sa valeur mesurée", icon: Gift },
];

export function ProposalFields({ id, draft, onChange, missing }: { id: string; draft: ProposalDraft; onChange: (draft: ProposalDraft) => void; missing?: boolean }) {
  const set = (patch: Partial<ProposalDraft>) => onChange({ ...draft, ...patch });
  const offer = draft.mode === "offer";
  return (
    <div className="proposal-fields">
      <div className="proposal-fields-head">
        <Label htmlFor={`${id}-on`} className="grid gap-0.5 text-sm font-semibold">
          Préparer la proposition
          <span className="text-xs font-normal text-muted-foreground">Facturer ou offrir : rien n’est envoyé au client avant « Envoyer la proposition ».</span>
        </Label>
        <Switch id={`${id}-on`} checked={draft.on} onCheckedChange={(on) => set({ on })} />
      </div>
      {draft.on && (
        <>
          <div className="scope-choice proposal-mode" role="radiogroup" aria-label="Proposition">
            {modes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={draft.mode === mode.value}
                className={`scope-option ${draft.mode === mode.value ? "is-selected" : ""}`}
                onClick={() => set({ mode: mode.value })}
              >
                <mode.icon aria-hidden="true" /> {mode.label}
                <span className="sr-only"> : {mode.hint}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${id}-amount`} label={offer ? "Valeur offerte HT" : "Montant HT"}>
              <AddonInput
                id={`${id}-amount`}
                addon="€"
                type="number"
                min="0"
                step="0.01"
                placeholder={offer ? "450" : "850"}
                value={draft.amount}
                onChange={(event) => set({ amount: event.target.value })}
                aria-invalid={missing || undefined}
                aria-describedby={missing ? `${id}-amount-error` : undefined}
              />
              {missing && (
                <span className="field-error" id={`${id}-amount-error`}>
                  Ce champ est obligatoire.
                </span>
              )}
            </Field>
            <Field id={`${id}-days`} label="Délai">
              <AddonInput id={`${id}-days`} addon="jours" type="number" min="0" step="1" placeholder="0" value={draft.days} onChange={(event) => set({ days: event.target.value })} />
            </Field>
          </div>
          {offer ? (
            <p className="m-0 text-xs text-muted-foreground">Envoyée, la demande est « Offerte » pour le client, avec sa valeur : il n’a rien à décider.</p>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor={`${id}-counter`} className="text-sm font-normal">
                Le client peut faire une contre-proposition
              </Label>
              <Switch id={`${id}-counter`} checked={draft.counter} onCheckedChange={(counter) => set({ counter })} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

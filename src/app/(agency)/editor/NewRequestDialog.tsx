"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AddonInput, Field, Modal, selectClassName } from "@/components/modal";
import { excerptMaxLength, requestChannels, type RequestChannel } from "@/lib/requestSource";
import { ScopeChoice, type Qualification, type Qualified } from "./CanvasComments";

/** What the dialog gives back: the request, where it came from, and a capture to import first. */
export type NewRequest = Qualified & { source?: { channel: RequestChannel; receivedAt?: string; excerpt?: string }; capture?: File };

/**
 * A request entered by the agency: one received elsewhere (an e-mail, a call, a meeting…), or one about
 * the whole deliverable, where no point can be pinned. Qualified now or left to clarify, with its source,
 * the client's words and a capture (src/lib/requestSource.ts), and the optional quote.
 */
export function NewRequestDialog({
  initial,
  onClose,
  onCreate,
}: {
  /** Qualification picked in the menu; null = closed. */
  initial: Qualification | null;
  onClose: () => void;
  onCreate: (request: NewRequest) => void;
}) {
  return initial ? <RequestForm key={initial} initial={initial} onClose={onClose} onCreate={onCreate} /> : null;
}

function RequestForm({ initial, onClose, onCreate }: { initial: Qualification; onClose: () => void; onCreate: (request: NewRequest) => void }) {
  const [channel, setChannel] = useState<RequestChannel | "">("");
  const [receivedAt, setReceivedAt] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [capture, setCapture] = useState<{ file: File; preview: string } | null>(null);
  /** An image pasted (Ctrl+V) or picked becomes the capture. */
  function takeCapture(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    if (capture) URL.revokeObjectURL(capture.preview);
    setCapture({ file, preview: URL.createObjectURL(file) });
  }
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
      description="Une demande reçue ailleurs (e-mail, appel, réunion…) ou portant sur tout le livrable."
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onCreate({
          title: title.trim(),
          description: description.trim(),
          decision,
          quote: outside && quoteOn ? { amount: Number(amount), days: Number(days) || 0, counter } : undefined,
          source: channel ? { channel, ...(receivedAt ? { receivedAt } : {}), ...(excerpt.trim() ? { excerpt: excerpt.trim() } : {}) } : undefined,
          capture: channel ? capture?.file : undefined,
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
      <Field id="request-source" label="Source" optional hint="D’où vient la demande, si le client l’a faite en dehors de Kora.">
        <select id="request-source" className={selectClassName} value={channel} onChange={(event) => setChannel(event.target.value as RequestChannel | "")}>
          <option value="">Aucune (demande de l’agence)</option>
          {(Object.entries(requestChannels) as [RequestChannel, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {channel && (
        <>
          <Field id="request-received" label="Date de la demande" optional>
            <Input id="request-received" type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
          </Field>
          <Field id="request-excerpt" label="Extrait" optional hint="Visible par le client. Collez-y le texte de son message ; une image collée devient la capture.">
            <Textarea
              id="request-excerpt"
              rows={4}
              maxLength={excerptMaxLength}
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              onPaste={(event) => {
                const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
                if (!image) return;
                event.preventDefault();
                takeCapture(image);
              }}
              placeholder="Ex. : « Pouvez-vous ajouter une page Équipe avec nos 6 portraits ? »"
            />
          </Field>
          <Field id="request-capture" label="Capture" optional hint="Visible par le client. Une image : capture d’e-mail, de message, de maquette…">
            <div className="grid gap-2">
              <Input id="request-capture" type="file" accept="image/*" onChange={(event) => takeCapture(event.target.files?.[0])} />
              {capture && (
                <div className="flex items-start gap-2">
                  <span
                    role="img"
                    aria-label="Aperçu de la capture"
                    className="block h-32 w-48 rounded-[var(--r-field)] border border-[var(--border)] bg-contain bg-left-top bg-no-repeat"
                    style={{ backgroundImage: `url(${capture.preview})` }}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => (URL.revokeObjectURL(capture.preview), setCapture(null))}>
                    Retirer
                  </Button>
                </div>
              )}
            </div>
          </Field>
        </>
      )}
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
                  <AddonInput id="request-amount" addon="€" type="number" min="0" step="0.01" placeholder="850" value={amount} onChange={(event) => setAmount(event.target.value)} />
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

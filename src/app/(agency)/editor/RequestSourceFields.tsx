"use client";

// Where a request came from (src/lib/requestSource.ts), told in a few gestures (feedback of 25 October 2026):
// a line « Ajouter une source » at the foot of the form; clicked, a section of its own, folded or taken away,
// with the channel among chips, the client's words (an image pasted there becomes the capture), the day (today
// unless changed) and an image. Shared by « + Demande » and the bubble's qualifying form.

import { useRef } from "react";
import { ChevronDown, ImagePlus, Plus, X } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { channelNameMaxLength, excerptMaxLength, requestChannels, type RequestChannel, type RequestSource } from "@/lib/requestSource";

export type SourceDraft = {
  /** The section opened (« Ajouter une source »): a source being told; `open`, unfolded. */
  on: boolean;
  open: boolean;
  channel: RequestChannel | "";
  /** « Autre »: the channel's name. */
  channelName: string;
  receivedAt: string;
  excerpt: string;
  capture: { file: File; preview: string } | null;
  /** The capture already stored with the request (« Modifier »), kept unless taken away or replaced. */
  kept?: string;
};
export const emptySource = (): SourceDraft => ({ on: false, open: false, channel: "", channelName: "", receivedAt: "", excerpt: "", capture: null });

/** The source a request already has, as the form shows it again (« Modifier »); none, the line to add one. */
export function sourceDraftOf(source?: RequestSource): SourceDraft {
  if (!source) return emptySource();
  return {
    on: true,
    open: true,
    channel: source.channel,
    channelName: source.channelName ?? "",
    receivedAt: source.receivedAt ?? "",
    excerpt: source.excerpt ?? "",
    capture: null,
    kept: source.capture,
  };
}

/** What a form sends: the source, none when « Aucune » (made in Kora). */
export function sourceOf(draft: SourceDraft) {
  if (!draft.on || !draft.channel) return undefined;
  return {
    channel: draft.channel,
    ...(draft.channel === "other" && draft.channelName.trim() ? { channelName: draft.channelName.trim() } : {}),
    ...(draft.receivedAt ? { receivedAt: draft.receivedAt } : {}),
    ...(draft.excerpt.trim() ? { excerpt: draft.excerpt.trim() } : {}),
    ...(!draft.capture && draft.kept ? { capture: draft.kept } : {}),
  };
}

/** Today, as the date field reads it (the agency's own day, not UTC's). */
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const choices = Object.entries(requestChannels) as [RequestChannel, string][];

export function RequestSourceFields({ id, value, onChange }: { id: string; value: SourceDraft; onChange: (value: SourceDraft) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<SourceDraft>) => onChange({ ...value, ...patch });
  /** An image pasted or picked becomes the capture. */
  const takeCapture = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (value.capture) URL.revokeObjectURL(value.capture.preview);
    set({ capture: { file, preview: URL.createObjectURL(file) } });
  };
  // Not told yet: one line at the foot of the form.
  if (!value.on)
    return (
      <button type="button" className="source-add" onClick={() => set({ on: true, open: true })}>
        <Plus aria-hidden="true" /> Ajouter une source
      </button>
    );
  return (
    <section className="source-fields" aria-labelledby={`${id}-label`}>
      <header className="source-fields-head">
        <button type="button" className="source-fold" aria-expanded={value.open} onClick={() => set({ open: !value.open })}>
          <ChevronDown aria-hidden="true" />
          <span id={`${id}-label`}>Source</span>
          {!value.open && value.channel && <span className="source-fold-summary">{value.channel === "other" && value.channelName.trim() ? value.channelName.trim() : requestChannels[value.channel]}</span>}
        </button>
        <Hint label="Retirer la source">
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Retirer la source" onClick={() => (value.capture && URL.revokeObjectURL(value.capture.preview), onChange(emptySource()))}>
            <X />
          </Button>
        </Hint>
      </header>
      {value.open && (
        <>
          <div className="source-channels" role="radiogroup" aria-label="Reçue par">
            {choices.map(([channel, label]) => (
              <button
                key={channel}
                type="button"
                role="radio"
                aria-checked={value.channel === channel}
                className="source-chip"
                onClick={() => set({ channel, receivedAt: value.receivedAt || today() })}
              >
                {label}
              </button>
            ))}
          </div>
          {value.channel && (
            <div className="source-details">
              {value.channel === "other" && (
                <label className="source-field">
                  Précisez le canal
                  <Input value={value.channelName} maxLength={channelNameMaxLength} placeholder="WhatsApp, LinkedIn…" onChange={(event) => set({ channelName: event.target.value })} />
                </label>
              )}
              <label className="source-field">
                Message du client
                <Textarea
                  rows={3}
                  maxLength={excerptMaxLength}
                  placeholder="Collez son message. Une image collée devient la capture."
                  value={value.excerpt}
                  onChange={(event) => set({ excerpt: event.target.value })}
                  onPaste={(event) => {
                    const image = [...event.clipboardData.files].find((file) => file.type.startsWith("image/"));
                    if (!image) return;
                    event.preventDefault();
                    takeCapture(image);
                  }}
                />
              </label>
              {/* The day and the capture, side by side, each with its label, as the form's other fields. */}
              <div className="source-row">
                <label className="source-field">
                  Reçue le
                  <Input type="date" aria-label="Date de la demande" value={value.receivedAt} onChange={(event) => set({ receivedAt: event.target.value })} />
                </label>
                <div className="source-field">
                  <span>Capture</span>
                  {value.capture ? (
                    <span className="source-capture">
                      <span role="img" aria-label="Aperçu de la capture" style={{ backgroundImage: `url(${value.capture.preview})` }} />
                      <span className="source-capture-name">{value.capture.file.name}</span>
                      <Button type="button" variant="ghost" size="xs" onClick={() => (URL.revokeObjectURL(value.capture!.preview), set({ capture: null }))}>
                        Retirer
                      </Button>
                    </span>
                  ) : value.kept ? (
                    <span className="source-capture">
                      <span role="img" aria-label="Aperçu de la capture" style={{ backgroundImage: `url(${value.kept})` }} />
                      <span className="source-capture-name">Capture enregistrée</span>
                      <Button type="button" variant="ghost" size="xs" onClick={() => set({ kept: undefined })}>
                        Retirer
                      </Button>
                    </span>
                  ) : (
                    <button type="button" className="source-capture-add" onClick={() => fileInput.current?.click()}>
                      <ImagePlus aria-hidden="true" /> Ajouter une image
                    </button>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Capture"
                  onChange={(event) => {
                    takeCapture(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

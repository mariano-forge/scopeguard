"use client";

// One request in Kora's panel on the staging site: its thread, a reply, and for the agency its
// qualification. Quotes are prepared and sent in Kora, never here (src/lib/siteReview.ts).

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/Select";
import { requestKind, requestText, statusLabels, statusTones, type ThreadComment } from "@/app/(agency)/editor/CanvasComments";
import { sideOf } from "@/lib/authors";
import type { SiteAnchor } from "@/lib/siteReview";

type Reply = { id: number; from?: string; initials?: string; author?: string; message: string };
export type SiteComment = Pick<ThreadComment, "decision" | "title" | "message"> & {
  id: number;
  from?: string;
  initials?: string;
  author?: string;
  site?: SiteAnchor;
  replies?: Reply[];
  /** In the agency's view: whether the client sees it (src/db/reviewAccess.ts readSiteAgencyState). */
  clientSees?: boolean;
};
type Qualification = ThreadComment["decision"];

const qualificationOptions: { value: Qualification; label: string }[] = [
  { value: "À qualifier", label: "À clarifier" },
  { value: "Inclus", label: "Inclus" },
  { value: "Hors périmètre", label: "Hors scope" },
];

export function SiteRequest({
  request,
  number,
  open,
  missing,
  agency,
  onToggle,
  onReply,
  onQualify,
}: {
  request: SiteComment;
  number: number;
  open: boolean;
  missing: boolean;
  /** The agency's view: internal pins shown as such, and the qualification. */
  agency: boolean;
  onToggle: () => void;
  onReply: (message: string) => Promise<boolean>;
  onQualify: (decision: Qualification, title: string) => Promise<boolean>;
}) {
  const kind = requestKind(request);
  const [reply, setReply] = useState("");
  const [decision, setDecision] = useState<Qualification>(request.decision === "Inclus" || request.decision === "Hors périmètre" ? request.decision : "À qualifier");
  const [title, setTitle] = useState(request.title ?? "");
  // « Inclus » and « Hors scope » name the request; « À clarifier » with a title shows it to the client.
  const titleNeeded = decision !== "À qualifier";

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (reply.trim() && (await onReply(reply.trim()))) setReply("");
  }

  async function qualify(event: React.FormEvent) {
    event.preventDefault();
    await onQualify(decision, title.trim());
  }

  return (
    <li className="rounded-[var(--r-panel)] border border-[var(--border)] p-3">
      <button type="button" className="flex w-full items-start gap-2 text-left" aria-expanded={open} onClick={onToggle}>
        <span
          className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${request.clientSees === false ? "border border-dashed border-[var(--graphite)] bg-[var(--paper)] text-[var(--graphite)]" : "bg-[var(--action-fill)] text-[var(--ink)]"}`}
        >
          {number}
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="font-medium">{requestText(request)}</span>
          <span className="flex flex-wrap gap-1">
            <span className={`decision-badge ${statusTones[kind]} w-fit`}>{statusLabels[kind]}</span>
            {agency && request.clientSees === false && <span className="decision-badge w-fit">Interne</span>}
          </span>
          {missing && (
            <span className="flex items-center gap-1 text-xs text-[var(--status-high-text)]">
              <MapPin className="size-3" /> Élément introuvable sur la page
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
          {request.title && <p>{request.message}</p>}
          {(request.replies ?? []).map((item) => (
            <p key={item.id} className="rounded-[var(--r-field)] bg-[var(--canvas)] px-2 py-1">
              <b>{item.author ?? (sideOf(item) === "agency" ? "Agence" : "Client")}</b> : {item.message}
            </p>
          ))}
          <form className="grid gap-2" onSubmit={(event) => void sendReply(event)}>
            <Label htmlFor={`reply-${request.id}`}>Répondre</Label>
            <Textarea id={`reply-${request.id}`} maxLength={5000} value={reply} onChange={(event) => setReply(event.target.value)} />
            <Button type="submit" variant="outline" disabled={!reply.trim()}>
              Répondre
            </Button>
          </form>
          {agency && (
            <form className="grid gap-2 border-t border-[var(--border)] pt-3" onSubmit={(event) => void qualify(event)}>
              <Select label={`Qualification de la demande ${number}`} value={decision} options={qualificationOptions} onChange={setDecision} />
              <Label htmlFor={`title-${request.id}`}>Titre{titleNeeded ? "" : " (facultatif : la demande devient visible du client)"}</Label>
              <Input id={`title-${request.id}`} maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} />
              {decision === "Hors périmètre" && <p className="text-xs text-[var(--graphite)]">Le devis se prépare et s’envoie dans Kora.</p>}
              <Button type="submit" disabled={titleNeeded && !title.trim()}>
                Qualifier
              </Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

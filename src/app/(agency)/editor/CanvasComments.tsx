"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ArrowUp, BadgeEuro, ClipboardCheck, Ellipsis, EyeOff, Film, Gift, MessageSquare, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { formatProposalAmount, formatProposalDeadline, parseNumericDays } from "@/lib/proposalFormat";
import { Hint } from "@/components/hint";
import { SiteCapture } from "@/components/SiteCapture";
import type { SiteAnchor } from "@/lib/siteReview";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import Image from "next/image";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProposalFields, preparedProposal, proposalDraft, proposalReady, type PreparedProposal } from "./ProposalFields";
import { RequestSourceFields, sourceDraftOf, sourceOf } from "./RequestSourceFields";
import { avatarLetter, sideOf, type Side } from "@/lib/authors";
import { sourceLine, type RequestSource } from "@/lib/requestSource";
import { formatTimecode } from "@/lib/timecode";
import type { CitedLine } from "@/lib/scopeCitation";
import { SuggestionNote, useSuggestion, type ScopeAssist } from "./QualifyAssist";

/**
 * One request, three states:
 * - "À qualifier" → Commentaire (to clarify): written on the canvas or by hand;
 * - "Inclus"      → Inclus: part of the scope sold (work to do);
 * - "Hors périmètre" → Hors scope: qualified as an addition, leads to a proposal.
 * Included and out-of-scope requests only come from qualifying a comment.
 */
export type Qualification = "À qualifier" | "Inclus" | "Hors périmètre";
export type RequestKind = "comment" | "correction" | "outside";

type ThreadReply = { id: number; author: string; initials: string; message: string; time: string; createdAt?: number; edited?: boolean; from?: Side; internal?: boolean };

/** Current time, refreshed every 15 s (for "il y a 5 min"). */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * "À l'instant", "il y a 5 min", "il y a 3 h", "hier", "14 oct.", always computed from the real time.
 * Older data has no createdAt: replies use Date.now() as id, otherwise no label (the stored text was frozen).
 */
export function timeLabel(item: { id?: number; time: string; createdAt?: number }, now: number) {
  const at = item.createdAt ?? (item.id && item.id > 1e12 ? item.id : undefined);
  if (!at) return "";
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  if (hours < 48) return "hier";
  return new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
/** Rectangle drawn on a page, in % of the page box. */
export type Area = { x: number; y: number; w: number; h: number };
export type ThreadComment = {
  id: number;
  /** The author changed the text after posting it. */
  edited?: boolean;
  author: string;
  initials: string;
  /** Who wrote it (older comments: from their initials, see src/lib/authors.ts). */
  from?: Side;
  time: string;
  /** When it was written (ms); older data only has `time`. */
  createdAt?: number;
  /** The comment as written (first message of the thread). */
  message: string;
  /** Set when qualified: what has to be done, stated clearly. */
  title?: string;
  description?: string;
  location: string;
  decision: Qualification;
  kind?: "remark" | "request";
  sourceId?: number;
  /** Where a request entered by the agency came from (src/lib/requestSource.ts). */
  source?: RequestSource;
  /** An « Inclus »: the line of the project's active scope the agency cited (src/lib/scopeCitation.ts). */
  scopeLine?: CitedLine;
  /** A pin the agency dropped (its draft until qualified). */
  internalNote?: boolean;
  /** Placed on the staging site, with the capture of the window (src/lib/siteReview.ts). */
  site?: SiteAnchor;
  /** Brought in from a Figma file (src/db/figmaImport.ts): the comment there, which nobody entered in Kora. */
  figma?: { url?: string };
  position?: { x: number; y: number };
  area?: Area;
  /** On a video: the moment it was pinned on, in seconds (src/lib/timecode.ts). */
  timecode?: number;
  replies?: ThreadReply[];
  /** Closed (archived) by the agency: read-only for everyone until reopened. */
  closed?: boolean;
};

/** A request's origin: the channel and day, then the client's words and the capture, each under its title (both shown to the client). */
export function RequestSourceNote({ source, enteredBy, figmaUrl }: { source: RequestSource; enteredBy?: string; figmaUrl?: string }) {
  return (
    <aside className="request-source" aria-label="Source de la demande">
      <p className="request-source-line">{sourceLine(source, enteredBy)}</p>
      {figmaUrl && (
        <a className="request-source-open" href={figmaUrl} target="_blank" rel="noopener noreferrer">
          Voir le commentaire dans Figma
        </a>
      )}
      {source.excerpt && (
        <section className="request-source-part" aria-label="Message">
          <h3>Message</h3>
          <blockquote className="request-source-excerpt">{source.excerpt}</blockquote>
        </section>
      )}
      {source.capture && (
        <section className="request-source-part" aria-label="Capture">
          <h3>Capture</h3>
          {/* The image itself, the bubble's width, at its own proportions. */}
          <a className="request-source-capture" href={source.capture} target="_blank" rel="noopener" aria-label="Ouvrir la capture">
            <Image src={source.capture} alt="Capture jointe à la demande" width={360} height={240} unoptimized />
          </a>
        </section>
      )}
    </aside>
  );
}

/**
 * A proposal's figures as the foot of a quote (feedback of 25 and 26 October 2026): its extra delay, then its
 * amount; the version when there were several. In the bubble and on the request's card, agency and client.
 */
export function ProposalFigures({ amount, days, offer, version }: { amount?: number | string; days?: number | string; offer?: boolean; version?: number }) {
  const extra = parseNumericDays(days);
  return (
    <dl className="request-figures" aria-label={offer ? "Offre" : "Devis"}>
      {version !== undefined && (
        <div>
          <dt>Version</dt>
          <dd>V{version}</dd>
        </div>
      )}
      <div>
        <dt>Délai supplémentaire</dt>
        {/* Under its label, no extra delay reads « Aucun » (elsewhere « Aucun impact »). */}
        <dd>{extra ? formatProposalDeadline(extra) : "Aucun"}</dd>
      </div>
      <div className={`is-total ${offer ? "is-offer" : ""}`}>
        <dt>Montant HT</dt>
        {/* An offer's amount marked as a gift, in green, as on its card. */}
        <dd>
          {offer && <Gift aria-hidden="true" />}
          {formatProposalAmount(amount)}
        </dd>
      </div>
    </dl>
  );
}

/** The moment of a comment on a video, as its thread and the panel's list show it. */
export const TimecodeChip = ({ seconds }: { seconds: number }) => (
  <span className="timecode-chip">
    <Film aria-hidden="true" />
    <span className="sr-only">À </span>
    {formatTimecode(seconds)}
    <span className="sr-only"> dans la vidéo</span>
  </span>
);

/** The same moment, quieter, beside when the comment was written (a thread's header): a film, not a clock. */
const TimecodeNote = ({ seconds }: { seconds: number }) => (
  <span className="timecode-note">
    <Film aria-hidden="true" />
    <span className="sr-only">À </span>
    {formatTimecode(seconds)}
    <span className="sr-only"> dans la vidéo</span>
  </span>
);

export const requestKind = (comment: Pick<ThreadComment, "decision">): RequestKind =>
  comment.decision === "Inclus" ? "correction" : comment.decision === "Hors périmètre" ? "outside" : "comment";
export const isQualified = (comment: Pick<ThreadComment, "decision">) => requestKind(comment) !== "comment";
export const kindLabels: Record<RequestKind, string> = { comment: "Commentaire", correction: "Demande incluse", outside: "Demande hors scope" };
/**
 * A pin is a comment until qualified; then a request, with a title. A request back « À clarifier » keeps
 * its title and stays a request (to clarify), not a comment again.
 */
export const isTitledRequest = (comment: Pick<ThreadComment, "decision" | "title">) => requestKind(comment) !== "comment" || Boolean(comment.title?.trim());
export const itemLabel = (comment: Pick<ThreadComment, "decision" | "title">) =>
  requestKind(comment) === "comment" && comment.title?.trim() ? "Demande à clarifier" : kindLabels[requestKind(comment)];
/**
 * A pin of the agency with no status chosen yet: its draft, internal (the client never sees it,
 * src/db/reviewAccess.ts visibleToClient). Qualifying it, « À clarifier » included, gives it a title.
 */
export const isAgencyDraft = (comment: Pick<ThreadComment, "decision" | "title" | "from" | "initials">) =>
  requestKind(comment) === "comment" && !comment.title?.trim() && sideOf(comment) === "agency";
/** Short status shown on badges. */
export const statusLabels: Record<RequestKind, string> = { comment: "À clarifier", correction: "Inclus", outside: "Hors scope" };
export const statusTones: Record<RequestKind, string> = { comment: "decision-pending", correction: "decision-included", outside: "decision-outside" };
/** What a request asks, in one line: its title once qualified, else the comment. */
export const requestText = (comment: Pick<ThreadComment, "title" | "message">) => comment.title ?? comment.message;

/** Hovered zone with the comment tool, in % of the page box. */
export type TargetBox = { left: number; top: number; width: number; height: number; label: string };

const side = (x: number) => (x > 58 ? "is-left" : "is-right");

/**
 * Opens the bubble where it fits in the visible canvas: on its preferred side, else the other side,
 * else centered on its pin (each step tried once, so it never loops).
 */
/** The height kept free at the bottom of the canvas for its tools (.canvas-toolbar), with a margin. */
function toolsClearance(frame: Element) {
  const tools = frame.closest(".canvas")?.querySelector(".canvas-toolbar")?.getBoundingClientRect();
  return tools ? Math.max(0, frame.getBoundingClientRect().bottom - tools.top) + 8 : 8;
}

/**
 * A bubble on the canvas, moved up (then made to scroll inside) until clear of the canvas's tools. While it is
 * open it only goes up, never back down: shorter (« Détail » after « Discussion »), it stays where it is, under
 * the pointer that switched it.
 */
function fitAboveTools(bubble: HTMLElement | null) {
  const frame = bubble?.closest(".artboard-transform-wrapper");
  if (!bubble || !frame) return;
  // Held in place while the canvas zooms (ReviewCanvas.tsx holdBubbles): fitted again once let go, by its pin.
  if (bubble.style.getPropertyValue("--fx")) return;
  bubble.style.removeProperty("--ty");
  bubble.style.removeProperty("max-height");
  const box = bubble.getBoundingClientRect();
  const bounds = frame.getBoundingClientRect();
  const overflow = box.bottom - (bounds.bottom - toolsClearance(frame));
  const room = Math.max(0, box.top - bounds.top - 8);
  const lift = Math.min(room, Math.max(overflow, Number(bubble.dataset.lift) || 0, 0));
  bubble.dataset.lift = String(lift);
  if (lift > 0) bubble.style.setProperty("--ty", `calc(${getComputedStyle(bubble).getPropertyValue("--ty") || "0px"} - ${lift}px)`);
  if (overflow > lift) bubble.style.maxHeight = `${Math.max(200, box.height - (overflow - lift))}px`;
}

function useFittingSide(x: number, initial?: "is-center") {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<"is-left" | "is-right" | "is-center">(initial ?? side(x));
  const tried = useRef(new Set<string>());
  useLayoutEffect(() => {
    const bubble = ref.current;
    const frame = bubble?.closest(".artboard-transform-wrapper");
    if (!bubble || !frame) return;
    tried.current.add(placement);
    const box = bubble.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    if (box.left >= bounds.left && box.right <= bounds.right) return;
    const next = (["is-right", "is-left", "is-center"] as const).find((option) => !tried.current.has(option));
    if (next) setPlacement(next);
  }, [placement]);
  // Vertically, at every render (its form grows and shrinks), and whenever the canvas moves under it (opened
  // from the panel, the canvas pans to its pin): clear of the canvas's tools at the bottom, the bubble moves up
  // within the canvas, then scrolls inside, its buttons kept in view (styles only, no state).
  useLayoutEffect(() => fitAboveTools(ref.current));
  useEffect(() => {
    const bubble = ref.current;
    const frame = bubble?.closest(".artboard-transform-wrapper");
    if (!bubble || !frame) return;
    // Told at every twentieth of the bubble hidden or shown: a pan that only hides more of it is seen too.
    const threshold = Array.from({ length: 21 }, (_, step) => step / 20);
    const observer = new IntersectionObserver(() => fitAboveTools(bubble), { root: frame, rootMargin: `0px 0px -${toolsClearance(frame)}px 0px`, threshold });
    observer.observe(bubble);
    return () => observer.disconnect();
  }, []);
  return [ref, placement] as const;
}

export function CommentPin({
  comment,
  active,
  moving,
  onOpen,
  onMove,
  unread,
  onHover,
}: {
  comment: ThreadComment;
  active: boolean;
  /** The pointer enters or leaves the pin (its drawn zone shows meanwhile). */
  onHover?: (over: boolean) => void;
  /** Something of the client not read yet in its thread: a dot on the pin. */
  unread?: boolean;
  /** Being moved (follows the pointer). */
  moving?: boolean;
  onOpen: () => void;
  /** Double-click starts moving the pin. */
  onMove?: () => void;
}) {
  const kind = requestKind(comment);
  const now = useNow();
  const replies = comment.replies?.length ?? 0;
  const time = timeLabel(comment, now);
  return (
    <button
      type="button"
      data-pin={comment.id}
      className={`canvas-pin is-${kind} ${active ? "is-active" : ""} ${moving ? "is-moving" : ""} ${sideOf(comment) === "agency" ? "is-agency" : "is-client"} ${unread ? "is-unread" : ""}`}
      style={{ left: `${comment.position?.x ?? 50}%`, top: `${comment.position?.y ?? 50}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onMove?.();
      }}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      aria-label={`${itemLabel(comment)} #${comment.id} : ${requestText(comment)}${unread ? " (non lu)" : ""}`}
      aria-expanded={active}
    >
      {kind === "correction" ? <ClipboardCheck aria-hidden="true" /> : kind === "outside" ? <BadgeEuro aria-hidden="true" /> : <span>{avatarLetter(comment.initials)}</span>}
      {/* On hover, its first message as the thread shows it, and how many replies (feedback of 25 October 2026);
          on the right half of the page, on the pin's left: it never runs off the page's edge. */}
      <span className={`pin-preview ${(comment.position?.x ?? 50) > 50 ? "is-left" : ""}`} aria-hidden="true">
        <span className="pin-preview-message">
          <span className={`thread-avatar ${sideOf(comment) === "agency" ? "is-agency" : "is-client"}`}>{avatarLetter(comment.initials)}</span>
          <span className="pin-preview-body">
            <span className="thread-meta">
              <b>{comment.author}</b>
              {time && <small>{time}</small>}
            </span>
            <span className="pin-preview-text">{comment.message}</span>
            {/* Under its words, quieter (feedback of 26 October 2026). */}
            {replies > 0 && (
              <span className="pin-preview-replies">
                <MessageSquare aria-hidden="true" />
                {replies} réponse{replies > 1 ? "s" : ""}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

/** One message of a discussion; the reader's own ones can be edited (Enter saves, Escape cancels) or deleted. */
function ThreadMessage({
  message,
  now,
  editable,
  onEdit,
  onDelete,
}: {
  message: ThreadReply;
  now: number;
  editable: boolean;
  onEdit?: (message: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);
  const save = () => {
    const text = draft.trim();
    if (text && text !== message.message) onEdit?.(text);
    setEditing(false);
  };
  return (
    <div className={`thread-message ${sideOf(message) === "agency" ? "is-agency" : "is-client"}`}>
      <span className="thread-avatar" aria-hidden="true">
        {avatarLetter(message.initials)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="thread-meta">
          <b>{message.author}</b> {timeLabel(message, now) && <small>{timeLabel(message, now)}</small>}
          {message.edited && <small>· modifié</small>}
        </p>
        {editing ? (
          <form
            className="thread-edit"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setDraft(message.message);
                  setEditing(false);
                }
              }}
              aria-label="Modifier le message"
            />
            <div className="thread-edit-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Enregistrer
              </Button>
            </div>
          </form>
        ) : (
          <p className="thread-text">{message.message}</p>
        )}
      </div>
      {editable && !editing && (onEdit || onDelete) && (
        <span className="thread-message-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Actions sur le message">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              {onEdit && (
                <DropdownMenuItem
                  onSelect={() => {
                    setDraft(message.message);
                    setEditing(true);
                  }}
                >
                  <Pencil /> Modifier le message
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  <Trash2 /> Supprimer le message
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      )}
    </div>
  );
}

/** Inclus / Hors scope switch; `clarify` adds « À clarifier », for a request still to discuss with the client. */
export function ScopeChoice({ value, onChange, clarify }: { value: Qualification; onChange: (value: Qualification) => void; clarify?: boolean }) {
  const options: { value: Qualification; label: string; hint: string }[] = [
    ...(clarify ? [{ value: "À qualifier" as const, label: "À clarifier", hint: "À préciser avec le client" }] : []),
    { value: "Inclus", label: "Inclus", hint: "Prévu au devis" },
    { value: "Hors périmètre", label: "Hors scope", hint: "Ajout à facturer ou à offrir" },
  ];
  return (
    <div className="scope-choice-field">
      <div className="scope-choice" role="radiogroup" aria-label="Qualification">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`scope-option is-${option.value === "Inclus" ? "correction" : option.value === "Hors périmètre" ? "outside" : "comment"} ${value === option.value ? "is-selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            <span className="sr-only"> : {option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Optional quote typed while qualifying an out-of-scope request (prefills the proposal, sends nothing). */
/** `counter`: the client may answer with a counter-proposal; otherwise a refusal is final. */
export type Quote = { amount: number; days: number; counter: boolean };
/** Where an out-of-scope request stands: not quoted, quoted (not sent), or sent (label says what follows). */
/** `retry`: the client refused (or the adaptation was refused): the agency can quote a new version. */
/** `draft`: prepared, not sent (`offer` when it is an offer); `offered`: an offer sent (src/lib/requestOffer.ts), `value` reads « 450 € · + 2 jours ». */
export type ProposalStage = { stage: "none" } | { stage: "draft"; offer?: boolean } | { stage: "sent"; label: string; retry?: boolean } | { stage: "offered"; value: string };

/** `scopeLineId`: the line of the active scope an « Inclus » cites (src/lib/scopeCitation.ts); the proposal prepared with it, out of scope. */
/** `source` and `capture`: where the agency's own pin came from, and a capture to import first (RequestSourceFields.tsx). */
export type Qualified = {
  title: string;
  description: string;
  decision: Qualification;
  scopeLineId?: number;
  source?: { channel: RequestSource["channel"]; channelName?: string; receivedAt?: string; excerpt?: string; capture?: string };
  capture?: File;
  /** « Modifier »: the source the agency had given taken away. */
  removeSource?: boolean;
  /** « Modifier », the proposal switched off: the quote or offer prepared (not sent) taken away. */
  dropProposal?: boolean;
} & PreparedProposal;

/** A request's bubble opens on one of its tabs: what it says, its messages, or where it came from. */
export type ThreadView = "detail" | "discussion" | "source";

/**
 * Bubble next to its pin (Figma-like). A comment shows its conversation and "Qualifier" (agency);
 * qualifying turns the same request into a correction or an out-of-scope addition, with a clear title.
 */
export function ThreadPopover({
  comment,
  readOnly,
  locked,
  proposal,
  prepared,
  startQuoting,
  openOn,
  agencyName,
  onReply,
  onQualify,
  onSendProposal,
  onOpenProposal,
  onUnoffer,
  onDelete,
  onArchive,
  onClose,
  me,
  onEditMessage,
  onDeleteMessage,
  assist,
}: {
  comment: ThreadComment;
  readOnly: boolean;
  /** Decision locked by an accepted/refused proposal. */
  locked: boolean;
  /** Out-of-scope requests: where the proposal stands (agency only). */
  proposal?: ProposalStage;
  /** Proposal already prepared for this request, not sent yet: a draft quote or a draft offer. */
  prepared?: PreparedProposal;
  /** Opens directly on the qualification form with the proposal switched on (« Préparer la proposition »). */
  startQuoting?: boolean;
  /** The tab it opens on (a card's messages: « Discussion »; its source: « Source »). */
  openOn?: ThreadView;
  /** The agency's name, on the client's page: what an offer says to them. */
  agencyName?: string;
  onReply: (message: string) => void;
  /** Agency only: qualify a comment, change a qualification, or send it back to clarify. */
  onQualify?: (qualified: Qualified) => void;
  /** Sends the quoted proposal (the caller asks for confirmation). */
  onSendProposal?: () => void;
  /** Follows a sent proposal (adaptation, new version). */
  onOpenProposal?: () => void;
  /** An offer sent to the client: takes it back. */
  onUnoffer?: () => void;
  onDelete?: () => void;
  /** Agency: closes (archives) the discussion, or reopens it. */
  onArchive?: (closed: boolean) => void;
  onClose: () => void;
  /** The side this page writes for (agency or client): its messages can be edited or deleted while the discussion is open. */
  me?: Side;
  /** Edits a message (0 = the comment itself). */
  onEditMessage?: (messageId: number, message: string) => void;
  /** Deletes a reply (the comment itself is deleted with onDelete). */
  onDeleteMessage?: (messageId: number) => void;
  /** Agency: the project's active scope, for the line an « Inclus » cites and the AI's suggestion. */
  assist?: ScopeAssist;
}) {
  const kind = requestKind(comment);
  /** A request (qualified, or back to clarify with its title) rather than a comment. */
  const asRequest = isTitledRequest(comment);
  const [draft, setDraft] = useState("");
  const [qualifying, setQualifying] = useState(Boolean(startQuoting));
  // A new request starts empty (placeholders guide it); an existing one keeps its wording.
  const [title, setTitle] = useState(comment.title ?? "");
  const [description, setDescription] = useState(comment.description ?? "");
  const now = useNow();
  // A request: its « Détail » or its « Discussion », each on the bubble's whole height. A comment: its discussion.
  const [view, setView] = useState<ThreadView>(openOn === "source" && !comment.source ? "detail" : (openOn ?? "detail"));
  const showDetail = asRequest && view === "detail";
  const showDiscussion = !asRequest || view === "discussion";
  // Where it came from: a tab of its own on a request (feedback of 25 October 2026), under a comment's words.
  const showSource = Boolean(comment.source) && (!asRequest || view === "source");
  const [decision, setDecision] = useState<Qualification>(kind === "outside" ? "Hors périmètre" : asRequest && kind === "comment" ? "À qualifier" : "Inclus");
  // The proposal prepared with it (out of scope): a quote or an offer, as it was prepared before.
  const [proposalFields, setProposalFields] = useState(() => proposalDraft(prepared, startQuoting));
  const quoteReady = decision !== "Hors périmètre" || proposalReady(proposalFields);
  // Where the agency's own pin came from (an e-mail, a call…), told while qualifying it, as in « + Demande ».
  // Where it came from: told by the agency on a request it entered, shown again to be changed (« Modifier »);
  // never on a client's words, nor a thread from Figma.
  const [source, setSource] = useState(() => sourceDraftOf(comment.source));
  const sourceOffered = sideOf(comment) === "agency" && !comment.figma;
  // Once the agency changed the form, a suggestion arriving late no longer overwrites it.
  const touched = useRef(false);
  const suggestion = useSuggestion(assist?.suggestionPath, (suggested) => {
    if (touched.current) return;
    setDecision(suggested.decision);
    if (suggested.title) setTitle((typed) => typed.trim() || suggested.title!);
  });
  // Sent incomplete once: each missing required field says so, in red, under it.
  const [tried, setTried] = useState(false);
  const titleMissing = tried && !title.trim();
  const amountMissing = tried && !quoteReady;
  const listRef = useRef<HTMLDivElement>(null);
  // A comment added by hand has no spot: its bubble opens at the top of the page, centered.
  const x = comment.position?.x ?? 50;
  const y = comment.position?.y ?? 3;
  const [bubbleRef, placement] = useFittingSide(x, comment.position ? undefined : "is-center");
  const canWrite = !readOnly && !locked && !comment.closed;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comment.replies?.length]);

  const messages = [
    { id: 0, author: comment.author, initials: comment.initials, from: comment.from, message: comment.message, time: comment.time, createdAt: comment.createdAt, edited: comment.edited },
    ...(comment.replies ?? []),
  ];
  // A proposal prepared or sent: its delay and total under the request's words.
  const figuresShown = kind === "outside" && Boolean(prepared?.offer ?? prepared?.quote);
  // The proposal's next gesture, always in the request's body under its words (and its price), the bubble's
  // width (feedback of 26 October 2026): to send or offer it in ink; to prepare, see or take it back outlined. The
  // grey foot keeps the request's other actions.
  const proposalAction =
    kind !== "outside" || !proposal ? null : proposal.stage === "offered" ? (
      !readOnly && onUnoffer ? (
        <Button variant="outline" className="request-send" onClick={onUnoffer}>
          Annuler l’offre
        </Button>
      ) : null
    ) : proposal.stage === "sent" ? (
      <Button variant="outline" className="request-send" onClick={onOpenProposal}>
        {proposal.label}
      </Button>
    ) : proposal.stage === "draft" ? (
      !readOnly ? (
        <Button className="request-send cta-ink" onClick={onSendProposal}>
          {/* An offer is a gift, not a proposal to answer: it is offered (feedback of 26 October 2026). */}
          {proposal.offer ? "Offrir au client" : "Envoyer la proposition"}
        </Button>
      ) : null
    ) : canWrite ? (
      <Button
        variant="outline"
        className="request-send"
        onClick={() => {
          setProposalFields((current) => ({ ...current, on: true }));
          setQualifying(true);
        }}
      >
        Préparer la proposition
      </Button>
    ) : null;
  return (
    <div
      ref={bubbleRef}
      // No pin (« + Demande », a remark on the whole deliverable): docked at the canvas's edge, by the panel.
      className={`thread is-${kind} ${qualifying ? "is-qualifying" : ""} ${comment.position ? placement : "is-docked"}`}
      style={comment.position ? { left: `${x}%`, top: `${y}%` } : undefined}
      role="dialog"
      aria-label={`${itemLabel(comment)} #${comment.id}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="thread-header">
        <span className="thread-title">
          <b>{comment.author}</b>
          {(timeLabel(comment, now) || comment.timecode !== undefined) && (
            <span className="thread-when">
              {timeLabel(comment, now) && <small>{timeLabel(comment, now)}</small>}
              {timeLabel(comment, now) && comment.timecode !== undefined && <span aria-hidden="true">·</span>}
              {comment.timecode !== undefined && <TimecodeNote seconds={comment.timecode} />}
            </span>
          )}
        </span>
        <span className="thread-header-actions">
          {/* What it is, in its head beside the button that closes it (feedback of 26 October 2026), on every tab. */}
          {asRequest && (
            <span className={`request-kind is-${kind}`}>
              <span className="kind-pill">{kind === "outside" ? "Hors scope" : kind === "correction" ? "Inclus" : "À clarifier"}</span>
            </span>
          )}
          {!asRequest && onQualify && canWrite && !qualifying && (
            <Hint label="Qualifier en demande : à clarifier, incluse ou hors scope">
              <Button
                size="sm"
                onClick={() => {
                  touched.current = false;
                  setQualifying(true);
                  suggestion.ask();
                }}
              >
                <Plus aria-hidden="true" /> Qualifier
              </Button>
            </Hint>
          )}
          {onArchive && !readOnly && !qualifying && (
            <Hint label={comment.closed ? "Rouvrir la discussion" : "Clôturer la discussion"}>
              <Button variant="ghost" size="icon-sm" onClick={() => onArchive(!comment.closed)} aria-label={comment.closed ? "Rouvrir la discussion" : "Clôturer la discussion"}>
                {comment.closed ? <ArchiveRestore /> : <Archive />}
              </Button>
            </Hint>
          )}
          {onDelete && (
            <Hint label="Supprimer">
              <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Supprimer">
                <Trash2 />
              </Button>
            </Hint>
          )}
          <Hint label="Fermer">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
              <X />
            </Button>
          </Hint>
        </span>
      </header>

      {qualifying ? (
        <form
          className="qualify-form"
          // Our own checks (title, amount > 0), never the browser's "valid value" bubbles.
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || !quoteReady) {
              setTried(true);
              const form = event.currentTarget;
              // Once the errors are drawn: the first field missing, in view, the cursor in it.
              requestAnimationFrame(() => {
                const missing = form.querySelector<HTMLElement>('[aria-invalid="true"]');
                missing?.scrollIntoView({ block: "center", behavior: "smooth" });
                missing?.focus({ preventScroll: true });
              });
              return;
            }
            onQualify?.({ title: title.trim(), description: description.trim(), decision,
              ...(decision === "Hors périmètre" ? preparedProposal(proposalFields) : {}),
              ...(sourceOffered && sourceOf(source) ? { source: sourceOf(source), capture: source.capture?.file } : {}),
              ...(sourceOffered && comment.source && !sourceOf(source) ? { removeSource: true } : {}),
              ...(decision === "Hors périmètre" && (prepared?.quote || prepared?.offer) && !prepared.sent && !proposalFields.on ? { dropProposal: true } : {}),
            });
            setQualifying(false);
          }}
        >
          <SuggestionNote state={suggestion.state} />
          <div className="scope-field">
            <span className="scope-field-label" id={`scope-${comment.id}`}>
              Qualifier la demande
            </span>
            <ScopeChoice
              value={decision}
              onChange={(value) => {
                touched.current = true;
                setDecision(value);
              }}
              clarify
            />
          </div>
          <label>
            <span>
              Titre de la demande <span className="text-destructive" aria-hidden="true">*</span>
            </span>
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => {
                touched.current = true;
                setTitle(event.target.value);
              }}
              placeholder="Ex. : Ajouter une section témoignages"
              aria-invalid={titleMissing || undefined}
              aria-describedby={titleMissing ? `title-error-${comment.id}` : undefined}
            />
            {titleMissing && (
              <span className="field-error" id={`title-error-${comment.id}`}>
                Ce champ est obligatoire.
              </span>
            )}
          </label>
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Précisions utiles : où, comment, contraintes… (facultatif)" />
          </label>
          {decision === "Hors périmètre" && <ProposalFields id={`proposal-${comment.id}`} draft={proposalFields} onChange={setProposalFields} missing={amountMissing} />}
          {sourceOffered && <RequestSourceFields id={`source-${comment.id}`} value={source} onChange={setSource} />}
          <div className="qualify-form-actions">
            <button type="button" className="ghost-button" onClick={() => setQualifying(false)}>
              Annuler
            </button>
            <button type="submit" className="primary-button">
              {asRequest ? "Enregistrer" : "Créer la demande"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {asRequest && (
            <Tabs value={view} onValueChange={(next) => setView(next as typeof view)} className="thread-tabs">
              <TabsList variant="line" aria-label="Demande">
                <TabsTrigger value="detail">Détail</TabsTrigger>
                <TabsTrigger value="discussion">Discussion</TabsTrigger>
                {comment.source && <TabsTrigger value="source">Source</TabsTrigger>}
              </TabsList>
            </Tabs>
          )}
          {showDetail && (
            <div className="request-body">
              <p className="request-title">{requestText(comment)}</p>
              {kind === "correction" && comment.scopeLine && (
                <p className="request-cited">
                  Prévu par la ligne du périmètre : <b>{comment.scopeLine.title}</b>
                </p>
              )}
              {comment.description && <p className="request-description">{comment.description}</p>}
              {/* What the proposal holds, under the request's words: its amount and its extra delay. */}
              {figuresShown ? (
                <ProposalFigures amount={(prepared!.offer ?? prepared!.quote)!.amount} days={(prepared!.offer ?? prepared!.quote)!.days} offer={Boolean(prepared!.offer)} />
              ) : (
                kind === "outside" &&
                proposal?.stage === "offered" && (
                  <p className="request-offer">
                    <Gift aria-hidden="true" /> {me === "client" ? `Offerte par ${agencyName ?? "l’organisation"}` : "Offerte au client"} · <b>{proposal.value}</b>
                  </p>
                )
              )}
              {/* An offer sent: what it means, the same words on both sides (feedback of 26 October 2026). */}
              {kind === "outside" && prepared?.offer && prepared.sent && (
                <p className="request-offer-note">Cette demande sera gratuitement prise en charge dans une prochaine version.</p>
              )}
              {proposalAction && <div className="request-proposal">{proposalAction}</div>}
            </div>
          )}
          {showSource && <RequestSourceNote source={comment.source!} enteredBy={comment.figma ? undefined : comment.author} figmaUrl={comment.figma?.url} />}
          {(showDetail || !asRequest) && comment.site && <SiteCapture site={comment.site} />}
          {/* What can be done, apart from what the request says (as on its card): last, kept in view while the bubble scrolls. */}
          {showDetail && onQualify && canWrite && (
            <div className="request-footer">
              {onQualify && canWrite && (
                <div className="request-actions">
                  {/* Like any request: changed from its form, its proposal with it while it is not sent. */}
                  {(kind !== "outside" || proposal?.stage === "none" || proposal?.stage === "draft") && (
                    <button
                      type="button"
                      className="thread-link"
                      onClick={() => {
                        setQualifying(true);
                        // Back to clarify: the agency hesitates again, the client may have answered since; asked
                        // again. Not for an « Inclus » the agency already settled.
                        if (kind === "comment") {
                          touched.current = false;
                          suggestion.ask();
                        }
                      }}
                    >
                      <Pencil aria-hidden="true" /> Modifier
                    </button>
                  )}
                  {kind !== "comment" && (
                    <button
                      type="button"
                      className="thread-link"
                      onClick={() => onQualify({ title: comment.title ?? "", description: comment.description ?? "", decision: "À qualifier" })}
                    >
                      <Undo2 aria-hidden="true" /> Remettre à clarifier
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* The agency's own pin, no status chosen: said in its bubble, the client does not see it yet. */}
          {showDiscussion && me === "agency" && isAgencyDraft(comment) && (
            <p role="note" className="thread-draft-note">
              <EyeOff aria-hidden="true" /> Invisible pour le client tant qu’il n’est pas qualifié.
            </p>
          )}
          {showDiscussion && (
          <div className="thread-messages" ref={listRef}>
            {messages.map((message) => (
              <ThreadMessage
                key={message.id}
                message={message}
                now={now}
                // Own messages, while the discussion is open.
                editable={Boolean(me) && sideOf(message) === me && kind === "comment" && canWrite}
                // Once the request shows to the client, what was written for the agency only is labelled.
                onEdit={onEditMessage ? (text) => onEditMessage(message.id, text) : undefined}
                onDelete={message.id === 0 ? onDelete : onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
              />
            ))}
          </div>
          )}


          {!showDiscussion ? null : comment.closed ? (
            <p className="thread-locked">Discussion close.{onArchive && !readOnly ? " Rouvrez-la pour répondre." : ""}</p>
          ) : canWrite ? (
            <form
              className="thread-reply"
              onSubmit={(event) => {
                event.preventDefault();
                if (!draft.trim()) return;
                onReply(draft.trim());
                setDraft("");
                setView("discussion");
              }}
            >
              <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Répondre, demander une précision…" aria-label="Répondre" />
              <button type="submit" className="thread-send" disabled={!draft.trim()} aria-label="Envoyer la réponse">
                <ArrowUp />
              </button>
            </form>
          ) : (
            <p className="thread-locked">{readOnly ? "Version en lecture seule." : "Décision verrouillée par la proposition."}</p>
          )}
        </>
      )}
    </div>
  );
}

export type ComposerResult = { message: string };

/** Where a new comment is written, right where the canvas was clicked (or the area drawn). */
export function Composer({
  x,
  y,
  onSubmit,
  onCancel,
}: {
  x: number;
  y: number;
  onSubmit: (result: ComposerResult) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [bubbleRef, placement] = useFittingSide(x);
  return (
    <>
      <span className="composer-pin" style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true" />
      <div
        ref={bubbleRef}
        className={`thread composer ${placement}`}
        style={{ left: `${x}%`, top: `${y}%` }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <header className="thread-header">
          <span className="thread-title">
            Nouveau commentaire
          </span>
          <button type="button" className="thread-icon-button" onClick={onCancel} aria-label="Annuler">
            <X />
          </button>
        </header>
        <form
          className="thread-reply"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) onSubmit({ message: draft.trim() });
          }}
        >
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Écrire un commentaire…" aria-label="Commentaire" />
          <button type="submit" className="thread-send" disabled={!draft.trim()} aria-label="Publier">
            <ArrowUp />
          </button>
        </form>
      </div>
    </>
  );
}

/** Blue outline on the zone under the pointer (comment tool), like Agentation. */
export function TargetHighlight({ box, drawing }: { box: TargetBox; drawing?: boolean }) {
  return (
    <div
      className={`target-highlight ${drawing ? "is-drawing" : ""}`}
      style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }}
      aria-hidden="true"
    >
      {box.label && <span>{box.label}</span>}
    </div>
  );
}

/** Human label for a hovered element: "Bouton « Nous contacter »", "Texte « Des idées… »", "Image". */
export function describeTarget(element: Element): string {
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  const short = text.length > 32 ? `${text.slice(0, 32)}…` : text;
  const tag = element.tagName.toLowerCase();
  if (tag === "img") {
    const alt = element.getAttribute("alt");
    return alt ? `Image « ${alt.length > 32 ? `${alt.slice(0, 32)}…` : alt} »` : "Image";
  }
  if (element.closest(".textLayer")) return short ? `Texte « ${short} »` : "Texte";
  const kind =
    tag === "button" || tag === "a"
      ? "Bouton"
      : /^h[1-6]$/.test(tag)
        ? "Titre"
        : tag === "svg"
          ? "Image"
          : tag === "nav"
            ? "Navigation"
            : tag === "p" || tag === "small" || tag === "span" || tag === "em" || tag === "b"
              ? "Texte"
              : "Groupe";
  return short && kind !== "Image" ? `${kind} « ${short} »` : kind;
}

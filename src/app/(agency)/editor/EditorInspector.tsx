"use client";

import { useState } from "react";
import { ChevronUp, Eye, History, MessageSquare, Plus, Share2 } from "lucide-react";
import type { ProposalStage, Qualification } from "./CanvasComments";
import { ResizeHandle } from "./ResizeHandle";
import { isAgencyDraft, itemLabel, requestKind, requestText, timeLabel, useNow, type RequestKind, type ThreadComment } from "./CanvasComments";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { outsideFilters, outsideStatusView, type OutsideStatus, type StatusTone } from "@/lib/outsideStatus";
import { sideOf } from "@/lib/authors";

/** « draft »: the agency's pins with no status yet; « closed »: discussions closed (archived). */
export type InspectorTab = RequestKind | "draft" | "closed";

/** The tab a request is listed in; drafts only where the panel shows them (the agency's). */
export const inspectorTabOf = (comment: ThreadComment, drafts = true): InspectorTab =>
  comment.closed ? "closed" : drafts && isAgencyDraft(comment) ? "draft" : requestKind(comment);

type TabOption = { kind: InspectorTab; label: string; emptyTitle: string; empty: string };
const requestTabs: TabOption[] = [
  { kind: "comment", label: "À clarifier", emptyTitle: "Rien à clarifier", empty: "Cliquez sur le livrable pour commenter, ou ajoutez une demande reçue ailleurs avec « + Demande »." },
  { kind: "correction", label: "Inclus", emptyTitle: "Aucune demande incluse", empty: "Les demandes prévues au devis s’affichent ici, une fois qualifiées « Inclus »." },
  { kind: "outside", label: "Hors scope", emptyTitle: "Aucun ajout hors scope", empty: "Les ajouts à chiffrer s’affichent ici, une fois qualifiés « Hors scope »." },
];
const commentTabs: TabOption[] = [
  { kind: "draft", label: "Mes brouillons", emptyTitle: "Aucun brouillon", empty: "Vos commentaires restent ici, internes, tant que vous ne les avez pas qualifiés." },
  { kind: "closed", label: "Discussions clôturées", emptyTitle: "Aucune discussion clôturée", empty: "Une discussion clôturée s’affiche ici, en lecture seule ; rouvrez-la pour y répondre." },
];
const closedTab: TabOption = { kind: "closed", label: "Closes", emptyTitle: "Aucune discussion close", empty: "Les discussions closes par l’agence s’affichent ici." };

/** Markdown summary of every request of the version (copy / export). */
export function threadsToMarkdown(title: string, comments: ThreadComment[]) {
  const section = (kind: RequestKind, label: string) => {
    const list = comments.filter((comment) => requestKind(comment) === kind);
    if (list.length === 0) return "";
    return `## ${label}\n\n${list
      .map((comment) =>
        [
          `- **#${comment.id} · ${requestText(comment)}** (${comment.location})${comment.description ? `\n  ${comment.description}` : ""}`,
          `  - ${comment.author} : ${comment.message}`,
          ...(comment.replies ?? []).map((reply) => `  - ${reply.author} : ${reply.message}`),
        ].join("\n"),
      )
      .join("\n")}\n\n`;
  };
  return `# ${title}\n\n${section("correction", "Inclus")}${section("outside", "Hors scope")}${section("comment", "À clarifier")}`.trim() + "\n";
}

/** A status, small: a colored dot and its words. */
export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`status-pill is-${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/**
 * Requests of a version as cards, by status (À clarifier · Inclus · Hors scope). The agency's panel adds
 * a second view, « Commentaires », with its drafts and the discussions it closed; the client's lists the
 * closed ones in their own tab. Used by the agency inspector, the client page and the staging-site panel.
 */
export function RequestPanel({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalStage,
  onQuote,
  onSendProposal,
  onOpenProposal,
  onRequote,
  proposalSummary,
  unread,
  adding,
  onAddingChange,
  onAddComment,
  emptyHint,
  drafts = false,
  outsideStatus,
  reader = "client",
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /** Shows that request on the canvas. */
  onFocus: (commentId: number) => void;
  /** Out-of-scope requests: where the proposal stands, and its actions. */
  proposalStage?: (comment: ThreadComment) => ProposalStage | null;
  onQuote?: (commentId: number) => void;
  onSendProposal?: (commentId: number) => void;
  onOpenProposal?: (commentId: number) => void;
  /** Refused proposal: quote a new version (the refused one stays in the history). */
  onRequote?: (commentId: number) => void;
  /** Out-of-scope requests: amount and delay of the proposal, above the actions. */
  proposalSummary?: (comment: ThreadComment) => React.ReactNode;
  /** Messages of the other side the reader hasn't opened yet (0 or false: none). */
  unread?: (comment: ThreadComment) => number | boolean;
  /** The manual comment form is open (opened from the panel header's "+"). */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Adds a comment by hand (not tied to a spot of the canvas); absent when read-only. */
  onAddComment?: (message: string) => void;
  /** How to add a comment where the panel is used, said when there is none yet (the canvas's by default). */
  emptyHint?: string;
  /** The agency's panel: « Commentaires » (drafts, closed discussions) beside « Demandes ». */
  drafts?: boolean;
  /** Where each out-of-scope request stands (src/lib/outsideStatus.ts): its tag and the tab's filter. */
  outsideStatus?: (comment: ThreadComment) => OutsideStatus;
  /** Whose words the statuses use. */
  reader?: "agency" | "client";
}) {
  const [draft, setDraft] = useState("");
  const [statusFilter, setStatusFilter] = useState<OutsideStatus | "all">("all");
  const now = useNow();
  const tabOf = (comment: ThreadComment) => inspectorTabOf(comment, drafts);
  const count = (kind: InspectorTab) => comments.filter((comment) => tabOf(comment) === kind).length;
  const unreadCount = (comment: ThreadComment) => Number(unread?.(comment) ?? 0);
  const hasUnread = (kind: InspectorTab) => comments.some((comment) => tabOf(comment) === kind && unreadCount(comment) > 0);
  const view: "requests" | "comments" = drafts && (tab === "draft" || tab === "closed") ? "comments" : "requests";
  const shownTabs = view === "comments" ? commentTabs : drafts || count("closed") === 0 ? requestTabs : [...requestTabs, closedTab];
  const current = shownTabs.find((option) => option.kind === tab) ?? shownTabs[0];
  const inTab = comments.filter((comment) => tabOf(comment) === current.kind);
  const statusOf = (comment: ThreadComment) => (outsideStatus ? outsideStatusView(outsideStatus(comment), reader) : null);
  // The client sees one status where the agency sees two (not quoted, quoted): counted by their words.
  const statusCount = (status: OutsideStatus) => inTab.filter((comment) => statusOf(comment)?.label === outsideStatusView(status, reader).label).length;
  const filtering = current.kind === "outside" && Boolean(outsideStatus) && statusFilter !== "all";
  const list = inTab
    .filter((comment) => !filtering || statusOf(comment)?.label === outsideStatusView(statusFilter as OutsideStatus, reader).label)
    .sort((left, right) => right.id - left.id);
  const views = [
    { key: "requests", label: "Demandes", options: requestTabs },
    { key: "comments", label: "Commentaires", options: commentTabs },
  ] as const;

  return (
    <>
      {drafts && (
        <Tabs value={view} onValueChange={(next) => onTab((next === "comments" ? commentTabs : requestTabs)[0].kind)} className="panel-views">
          <TabsList aria-label="Vue du panneau" className="w-full">
            {views.map((option) => (
              <TabsTrigger key={option.key} value={option.key}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="inspector-tabs" role="tablist" aria-label="Demandes">
        {shownTabs.map((option) => (
          <button key={option.kind} role="tab" aria-selected={current.kind === option.kind} className={current.kind === option.kind ? "is-active" : ""} onClick={() => onTab(option.kind)}>
            {option.label}{" "}
            <span className="tab-count">
              {count(option.kind)}
              {hasUnread(option.kind) && <i className="unread-dot" aria-label="Message non lu" />}
            </span>
          </button>
        ))}
      </div>

      {adding && onAddComment && (
        <form
          className="manual-comment"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            onAddComment(draft.trim());
            setDraft("");
            onAddingChange(false);
            onTab(drafts ? "draft" : "comment");
          }}
        >
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onAddingChange(false);
            }}
            rows={3}
            placeholder="Un retour sur le livrable dans son ensemble…"
            aria-label="Nouveau commentaire"
          />
          <div className="manual-comment-actions">
            <button type="button" className="ghost-button" onClick={() => onAddingChange(false)}>
              Annuler
            </button>
            <button type="submit" className="primary-button" disabled={!draft.trim()}>
              Ajouter
            </button>
          </div>
        </form>
      )}

      <div className="inspector-list" role="tabpanel">
        {current.kind === "outside" && outsideStatus && inTab.length > 0 && (
          <div className="status-filter">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OutsideStatus | "all")}>
              <SelectTrigger size="sm" className="w-full" aria-label="Filtrer par statut">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="status-filter-menu">
                <SelectItem value="all">Tous les statuts · {inTab.length}</SelectItem>
                {outsideFilters(reader).map((status) => (
                  <SelectItem key={status} value={status}>
                    {outsideStatusView(status, reader).label} · {statusCount(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {list.length === 0 ? (
          <div className="inspector-empty-state">
            <span className="empty-state-mark" aria-hidden="true">
              <MessageSquare />
            </span>
            <b>{filtering ? "Aucune demande avec ce statut" : current.emptyTitle}</b>
            <p>{filtering ? "Choisissez un autre statut, ou « Tous les statuts »." : current.kind === "comment" && emptyHint ? emptyHint : current.empty}</p>
          </div>
        ) : (
          <ul>
            {list.map((comment) => {
              const kind = requestKind(comment);
              const status = kind === "outside" ? statusOf(comment) : null;
              const stage = kind === "outside" ? proposalStage?.(comment) : null;
              const replies = comment.replies?.length ?? 0;
              const fresh = unreadCount(comment);
              return (
                <li key={comment.id} className={`inspector-row ${comment.id === selectedId ? "is-selected" : ""} ${comment.closed ? "is-closed" : ""}`}>
                  <button
                    className={`thread-row ${comment.id === selectedId ? "is-selected" : ""}`}
                    aria-current={comment.id === selectedId ? "true" : undefined}
                    aria-label={`${itemLabel(comment)} #${comment.id}`}
                    onClick={() => onFocus(comment.id)}
                  >
                    {(comment.closed || status) && (
                      <span className="thread-row-status">
                        {comment.closed ? <StatusPill label="Close" tone="waiting" /> : status && <StatusPill label={status.label} tone={status.tone} />}
                      </span>
                    )}
                    <span className={`thread-row-text ${kind !== "comment" || comment.title ? "is-title" : ""}`}>{requestText(comment)}</span>
                    <span className="thread-row-meta">
                      <span className={`thread-avatar ${sideOf(comment) === "agency" ? "is-agency" : "is-client"}`} aria-hidden="true">
                        {comment.initials}
                      </span>
                      <span>{comment.author}</span>
                      {timeLabel(comment, now) && <small>· {timeLabel(comment, now)}</small>}
                    </span>
                    {(replies > 0 || fresh > 0) && (
                      <span className={`thread-row-replies ${fresh > 0 ? "is-unread" : ""}`}>
                        <MessageSquare aria-hidden="true" />
                        {fresh > 0 ? `${plural(fresh, "message")} non lu${fresh > 1 ? "s" : ""}` : plural(replies, "réponse")}
                      </span>
                    )}
                  </button>
                  {stage && !comment.closed && (
                    // A click beside the buttons selects the card, as a click on the card does.
                    <div className="row-actions" onClick={(event) => !(event.target as Element).closest("button") && onFocus(comment.id)}>
                      {proposalSummary?.(comment)}
                      <span className="row-buttons">
                        {stage.stage === "none" && onQuote && (
                          <Button variant="outline" size="sm" onClick={() => onQuote(comment.id)}>
                            Chiffrer
                          </Button>
                        )}
                        {stage.stage === "draft" && onQuote && (
                          <Button variant="outline" size="sm" onClick={() => onQuote(comment.id)}>
                            Modifier
                          </Button>
                        )}
                        {stage.stage === "draft" && onSendProposal && (
                          <Button size="sm" className="cta-ink" onClick={() => onSendProposal(comment.id)}>
                            Envoyer la proposition
                          </Button>
                        )}
                        {stage.stage === "sent" && stage.retry && onRequote && (
                          <Button variant="outline" size="sm" onClick={() => onRequote(comment.id)}>
                            Nouvelle proposition
                          </Button>
                        )}
                        {stage.stage === "sent" && !stage.retry && (
                          <Button variant="outline" size="sm" onClick={() => onOpenProposal?.(comment.id)}>
                            {stage.label}
                          </Button>
                        )}
                        {stage.stage === "sent" && stage.retry && (
                          <Hint label="Historique de la proposition">
                            <Button variant="outline" size="icon-sm" className="ml-auto shrink-0" aria-label="Historique de la proposition" onClick={() => onOpenProposal?.(comment.id)}>
                              <History />
                            </Button>
                          </Hint>
                        )}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Right panel of the deliverable: where requests are handled.
 * Header: "Demandes", add a comment, client preview, share. Copy / export live in the canvas toolbar.
 */
export function EditorInspector({
  comments,
  selectedId,
  tab,
  onTab,
  onFocus,
  proposalStage,
  onQuote,
  onSendProposal,
  onOpenProposal,
  onRequote,
  proposalSummary,
  onAddRequest,
  onShare,
  onPreview,
  width,
  onResize,
  notifications,
  unread,
  outsideStatus,
}: {
  comments: ThreadComment[];
  selectedId: number | null;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  onFocus: (commentId: number) => void;
  proposalStage: (comment: ThreadComment) => ProposalStage | null;
  onQuote: (commentId: number) => void;
  onSendProposal: (commentId: number) => void;
  onOpenProposal: (commentId: number) => void;
  onRequote: (commentId: number) => void;
  proposalSummary: (comment: ThreadComment) => React.ReactNode;
  /** Opens the "new request" form, already qualified (no comment first). */
  onAddRequest?: (decision: Qualification) => void;
  onShare: () => void;
  onPreview: () => void;
  width: number;
  onResize: (width: number) => void;
  /** The bell, at the head of the panel. */
  notifications?: React.ReactNode;
  unread?: (comment: ThreadComment) => number;
  outsideStatus?: (comment: ThreadComment) => OutsideStatus;
}) {
  // Phones: the panel is a sheet at the bottom of the screen, opened by its handle (CSS, max-width 680px).
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <aside className="inspector editor-inspector" aria-label="Demandes" data-sheet-open={sheetOpen || undefined}>
      <button
        type="button"
        className="inspector-sheet-toggle"
        aria-label={`${sheetOpen ? "Replier" : "Ouvrir"} le panneau des demandes (${comments.length})`}
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen((open) => !open)}
      >
        <span>
          Demandes <b>{comments.length}</b>
        </span>
        <ChevronUp aria-hidden="true" />
      </button>
      <ResizeHandle edge="left" width={width} min={320} max={560} defaultWidth={384} label="Largeur du panneau des demandes" onResize={onResize} />
      <header className="requests-header">
        {notifications}
        <div className="requests-actions">
          <Hint label="Aperçu : la page que voit le client">
            <Button variant="outline" size="icon" className="icon-action" onClick={onPreview} aria-label="Aperçu client">
              <Eye />
            </Button>
          </Hint>
          <Hint label="Partager la revue avec le client">
            <Button variant="outline" size="icon" className="icon-action" onClick={onShare} aria-label="Partager la revue">
              <Share2 />
            </Button>
          </Hint>
          {onAddRequest && (
            <Hint label="Une demande reçue ailleurs (e-mail, appel, réunion…) ou portant sur tout le livrable">
              <Button className="requests-add" onClick={() => onAddRequest(tab === "outside" ? "Hors périmètre" : tab === "correction" ? "Inclus" : "À qualifier")}>
                <Plus /> Ajouter une demande
              </Button>
            </Hint>
          )}
        </div>
      </header>

      <RequestPanel
        comments={comments}
        selectedId={selectedId}
        tab={tab}
        onTab={onTab}
        onFocus={onFocus}
        proposalStage={proposalStage}
        onQuote={onQuote}
        onSendProposal={onSendProposal}
        onOpenProposal={onOpenProposal}
        onRequote={onRequote}
        proposalSummary={proposalSummary}
        unread={unread}
        drafts
        outsideStatus={outsideStatus}
        reader="agency"
        adding={false}
        onAddingChange={() => undefined}
      />
    </aside>
  );
}

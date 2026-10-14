"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import {
  Check,
  Eye,
  Lock,
  Plus,
} from "lucide-react";
import type { DeliverableType } from "@/components/deliverableKinds";
import { Composer, ThreadPopover, requestKind, type Area, type ThreadComment } from "@/app/(agency)/editor/CanvasComments";
import { RequestPanel, type InspectorTab } from "@/app/(agency)/editor/EditorInspector";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AddonInput, Field, Modal } from "@/components/modal";
import { ReviewCanvas, type CanvasComposer, type CanvasTool } from "@/app/(agency)/editor/ReviewCanvas";
import { Hint } from "@/components/hint";


function parseNumericAmount(amount: number | string | undefined): number {
  if (typeof amount === "number") return amount;
  if (!amount) return 0;
  return Number(String(amount).replace(/[^0-9]/g, "")) || 0;
}

function parseNumericDays(deadline: number | string | undefined): number {
  if (typeof deadline === "number") return deadline;
  if (!deadline) return 0;
  return Number(String(deadline).replace(/[^0-9]/g, "")) || 0;
}

function formatProposalAmount(amount: number | string | undefined): string {
  const num = parseNumericAmount(amount);
  return `${num.toLocaleString("fr-FR")} €`;
}

function formatProposalDeadline(deadline: number | string | undefined): string {
  const num = parseNumericDays(deadline);
  if (num === 0) return "Aucun impact";
  return `+ ${num} jour${num > 1 ? "s" : ""}`;
}

type ReviewLink = {
  token: string;
  active: boolean;
  expiresAt: string;
  autoExpire?: boolean;
  deliverableId?: number;
  version?: number;
};
type ReviewLinks = Record<string, ReviewLink>;

type Deliverable = {
  id?: number;
  name: string;
  version: number;
  status: string;
  locked?: boolean;
  importedAt?: string;
  type?: DeliverableType;
  url?: string;
  coverData?: string;
  fileData?: string;
  reviewStatus?: ReviewStatus;
  approvedAt?: string;
};
type ReviewStatus = "pending" | "changes-requested" | "approved";

/** The review status lives on the shared version; older saves kept a single global one. */
function reviewStateOf(
  record: Deliverable | undefined,
  legacy: { reviewStatus?: ReviewStatus; approvedAt?: string | null },
): { status: ReviewStatus; approvedAt: string | null } {
  const status = record?.reviewStatus ?? (record?.status === "Approuvée" ? "approved" : legacy.reviewStatus ?? "pending");
  return { status, approvedAt: status === "approved" ? record?.approvedAt ?? legacy.approvedAt ?? null : null };
}

type Reply = {
  id: number;
  author: string;
  initials: string;
  message: string;
  time: string;
  /** When it was written (ms); older data only has `time`. */
  createdAt?: number;
};

type ClientComment = {
  id: number;
  deliverableId?: number;
  author: string;
  initials: string;
  time: string;
  createdAt?: number;
  message: string;
  location: string;
  decision?: "À qualifier" | "À traiter" | "Inclus" | "Hors périmètre";
  position?: { x: number; y: number };
  page?: number;
  replies?: Reply[];
  /** Set by the agency: "request" = correction. */
  kind?: "remark" | "request";
  title?: string;
  sourceId?: number;
  area?: Area;
};

type ProposalState = "none" | "draft" | "sent";
type ProposalDecision = "none" | "accepted" | "refused";
type ProposalStates = Record<number, ProposalState>;
type ProposalDecisions = Record<number, ProposalDecision>;
type AdaptationRequest = {
  message: string;
  budget?: number | string;
  deadline?: number | string;
  decision?: "accepted" | "refused";
  decisionBy?: string;
  decisionAt?: string;
  requestedAt: string;
};
type AdaptationRequests = Record<number, AdaptationRequest>;
type ProposalVersion = {
  id: number;
  version: number;
  commentId: number;
  description: string;
  amount: number | string;
  deadline: number | string;
  status: "draft" | "sent" | "superseded" | "accepted" | "refused";
  createdAt: string;
};
type ProposalVersions = Record<number, ProposalVersion[]>;

const storageKey = "scopeguard-review-state";

export default function ClientReviewPage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [accessState, setAccessState] = useState<"allowed" | "denied">("denied");
  const [reviewLink, setReviewLink] = useState<ReviewLink | null>(null);
  const [comments, setComments] = useState<ClientComment[]>([]);
  const [commentSent, setCommentSent] = useState(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<number | null>(null);
  const [tool, setTool] = useState<CanvasTool>("remark");
  /** The selected thread is open on the canvas. */
  const [threadOpen, setThreadOpen] = useState(false);
  const [composer, setComposer] = useState<CanvasComposer | null>(null);
  const [panelTab, setPanelTab] = useState<InspectorTab>("comment");
  const [addingComment, setAddingComment] = useState(false);
  const [proposalStates, setProposalStates] = useState<ProposalStates>({});
  const [proposalDecisions, setProposalDecisions] = useState<ProposalDecisions>({});
  const [adaptationRequests, setAdaptationRequests] = useState<AdaptationRequests>({});
  const [proposalVersions, setProposalVersions] = useState<ProposalVersions>({});
  const [adaptationCommentId, setAdaptationCommentId] = useState<number | null>(null);
  const [proposalPreviewCommentId, setProposalPreviewCommentId] = useState<number | null>(null);
  const [adaptationMessage, setAdaptationMessage] = useState("");
  const [adaptationBudget, setAdaptationBudget] = useState("");
  const [adaptationDeadline, setAdaptationDeadline] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("pending");
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [changesRequestOpen, setChangesRequestOpen] = useState(false);
  const [changesRequestMessage, setChangesRequestMessage] = useState("");
  const [stateHydrated, setStateHydrated] = useState(false);
  const [deliverable, setDeliverable] = useState<Deliverable>({
    name: "northstar-landing-v03.pdf",
    version: 3,
    status: "À valider",
  });

  useEffect(() => {
    const savedState = window.localStorage.getItem(storageKey);

    if (!savedState || !params.token) {
      setStateHydrated(true);
      setLoading(false);
      return;
    }

    try {
      const parsedState = JSON.parse(savedState) as {
        reviewLink?: ReviewLink | null;
        reviewLinks?: ReviewLinks;
        deliverables?: Deliverable[];
        comments?: ClientComment[];
        proposalStates?: ProposalStates;
        proposalDecisions?: ProposalDecisions;
        adaptationRequests?: AdaptationRequests;
        reviewStatus?: "pending" | "changes-requested" | "approved";
        approvedAt?: string | null;
        proposalVersions?: ProposalVersions;
      };
      const savedLinks = Object.values(parsedState.reviewLinks ?? {});
      const savedLink =
        savedLinks.find((link) => link.token === params.token) ??
        (parsedState.reviewLink?.token === params.token ? parsedState.reviewLink : null);
      const expiresAt = savedLink?.expiresAt
        ? parseFrenchDate(savedLink.expiresAt)
        : null;
      const isExpired =
        savedLink?.autoExpire !== false &&
        expiresAt !== null &&
        expiresAt.getTime() < Date.now();
      const isValid = Boolean(
        savedLink &&
          savedLink.token === params.token &&
          savedLink.active &&
          !isExpired,
      );

      if (isValid) {
        setReviewLink(savedLink ?? null);
        setAccessState("allowed");
        const sharedDeliverable = parsedState.deliverables?.find(
          (candidate) =>
            candidate.id === savedLink?.deliverableId &&
            candidate.version === savedLink?.version,
        ) ?? parsedState.deliverables?.[0];
        if (sharedDeliverable) {
          setDeliverable(sharedDeliverable);
        }
        const review = reviewStateOf(sharedDeliverable, parsedState);
        setReviewStatus(review.status);
        setApprovedAt(review.approvedAt);
        if (parsedState.comments) {
          setComments(parsedState.comments);
        }
        if (parsedState.proposalStates) setProposalStates(parsedState.proposalStates);
        if (parsedState.proposalDecisions) setProposalDecisions(parsedState.proposalDecisions);
        if (parsedState.adaptationRequests) setAdaptationRequests(parsedState.adaptationRequests);
        if (parsedState.proposalVersions) setProposalVersions(parsedState.proposalVersions);
      }
    } catch {
      setAccessState("denied");
    } finally {
      setStateHydrated(true);
      setLoading(false);
    }
  }, [params.token]);

  useEffect(() => {
    if (!stateHydrated || loading || accessState !== "allowed") return;

    const savedState = window.localStorage.getItem(storageKey);
    if (!savedState) return;

    try {
      const parsedState = JSON.parse(savedState) as Record<string, unknown>;
      const targetId = reviewLink?.deliverableId ?? deliverable.id;
      const targetVersion = reviewLink?.version ?? deliverable.version;
      const sharedDeliverables = Array.isArray(parsedState.deliverables)
        ? parsedState.deliverables.map((item) =>
            item &&
            typeof item === "object" &&
            (item as Deliverable).id === targetId &&
            (item as Deliverable).version === targetVersion
              ? {
                  ...(item as Record<string, unknown>),
                  status: reviewStatus === "approved" ? "Approuvée" : (item as Record<string, unknown>).status,
                  locked: reviewStatus === "approved",
                  reviewStatus,
                  approvedAt: approvedAt ?? undefined,
                }
              : item,
          )
        : parsedState.deliverables;

      // Drop the legacy app-wide review status: it now lives on each version.
      const rest = { ...parsedState };
      delete rest.reviewStatus;
      delete rest.approved;
      delete rest.approvedAt;
      const newSerialized = JSON.stringify({
        ...rest,
        comments,
        proposalStates,
        proposalDecisions,
        adaptationRequests,
        proposalVersions,
        deliverables: sharedDeliverables,
      });

      if (window.localStorage.getItem(storageKey) === newSerialized) return;
      window.localStorage.setItem(storageKey, newSerialized);
    } catch {
      // The access check above remains the source of truth for this view.
    }
  }, [comments, proposalStates, proposalDecisions, adaptationRequests, proposalVersions, reviewStatus, approvedAt, loading, accessState, deliverable.id, deliverable.version, reviewLink, stateHydrated]);

  useEffect(() => {
    function syncFromStorage(event: StorageEvent) {
      if (event.key !== storageKey || !event.newValue) return;

      try {
        const parsedState = JSON.parse(event.newValue) as {
          reviewLink?: ReviewLink | null;
          reviewLinks?: ReviewLinks;
          reviewStatus?: "pending" | "changes-requested" | "approved";
          approvedAt?: string | null;
          deliverables?: Deliverable[];
          comments?: ClientComment[];
          proposalStates?: ProposalStates;
          proposalDecisions?: ProposalDecisions;
          adaptationRequests?: AdaptationRequests;
          proposalVersions?: ProposalVersions;
        };


        const savedLinks = Object.values(parsedState.reviewLinks ?? {});
        const currentLink =
          savedLinks.find((link) => link.token === params.token) ??
          (parsedState.reviewLink?.token === params.token ? parsedState.reviewLink : null);

        if (currentLink) {
          const sharedDeliverable = parsedState.deliverables?.find(
            (candidate) =>
              candidate.id === currentLink.deliverableId &&
              candidate.version === currentLink.version,
          );
          if (sharedDeliverable) setDeliverable(sharedDeliverable);
          const review = reviewStateOf(sharedDeliverable, parsedState);
          setReviewStatus(review.status);
          setApprovedAt(review.approvedAt);
        }

        if (parsedState.comments) setComments(parsedState.comments);
        if (parsedState.proposalStates) setProposalStates(parsedState.proposalStates);
        if (parsedState.proposalDecisions) setProposalDecisions(parsedState.proposalDecisions);
        if (parsedState.adaptationRequests) setAdaptationRequests(parsedState.adaptationRequests);
        else setAdaptationRequests({});
        if (parsedState.proposalVersions) setProposalVersions(parsedState.proposalVersions);
      } catch {
        // Ignore malformed external updates.
      }
    }

    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, [params.token]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select")) return;
      if (event.key === "Escape") {
        setComposer(null);
        setThreadOpen(false);
        setTool("remark");
      } else if (event.key.toLowerCase() === "v") setTool("move");
      else if (event.key.toLowerCase() === "c") setTool("remark");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function isReadOnlyVersion() {
    return reviewStatus === "approved" || deliverable.locked || deliverable.status === "Approuvée" || deliverable.status === "Remplacée";
  }

  /** Publishes a comment written on the canvas, or by hand (no position) from the panel. */
  function addComment(message: string, spot: CanvasComposer | null) {
    if (isReadOnlyVersion()) return;
    const id = Math.max(...comments.map((comment) => comment.id), 0) + 1;
    setComments((current) => [
      ...current,
      {
        id,
        deliverableId: reviewLink?.deliverableId ?? deliverable.id,
        author: "Claire Martin",
        initials: "CM",
        time: "À l'instant",
        createdAt: Date.now(),
        message,
        location: spot?.target ?? "Livrable (général)",
        decision: "À qualifier",
        kind: "remark",
        page: spot?.page ?? 1,
        position: spot ? { x: spot.x, y: spot.y } : undefined,
        area: spot?.area,
      },
    ]);
    setComposer(null);
    setCommentSent(true);
    setSelectedCommentId(id);
    setPanelTab("comment");
    setThreadOpen(true);
  }

  function replyTo(commentId: number, message: string) {
    if (isReadOnlyVersion() || isCommercialDecisionLocked(commentId)) return;
    const reply: Reply = { id: Date.now(), author: "Claire Martin", initials: "CM", message, time: "À l'instant", createdAt: Date.now() };
    setComments((current) => current.map((comment) => (comment.id === commentId ? { ...comment, replies: [...(comment.replies ?? []), reply] } : comment)));
  }

  /** Opens a thread from the side list and brings its pin into view. */
  function focusThread(commentId: number) {
    setSelectedCommentId(commentId);
    setComposer(null);
    setThreadOpen(true);
    requestAnimationFrame(() => {
      const pin = document.querySelector<HTMLElement>(`[data-pin="${commentId}"]`);
      const zoom = transformRef.current;
      if (pin && zoom) void zoom.zoomToElement(pin, zoom.state.scale, 300);
    });
  }

  function deleteComment(commentId: number) {
    if (isReadOnlyVersion() || isCommercialDecisionLocked(commentId)) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "CM") return;
    setComments((current) => {
      const updated = current.filter((comment) => comment.id !== commentId);
      if (selectedCommentId === commentId) {
        setSelectedCommentId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
    toast("Commentaire supprimé", { action: { label: "Annuler", onClick: () => restoreComment(target) } });
  }

  /** Double-click a pin, then click: the comment moves there (its drawn area follows). */
  function moveComment(commentId: number, page: number, x: number, y: number) {
    if (isReadOnlyVersion()) return;
    setComments((current) =>
      current.map((comment) => {
        if (comment.id !== commentId || !comment.position) return comment;
        const dx = x - comment.position.x;
        const dy = y - comment.position.y;
        return {
          ...comment,
          page,
          position: { x, y },
          area: comment.area ? { ...comment.area, x: comment.area.x + dx, y: comment.area.y + dy } : undefined,
          location: comment.location.replace(/^Page \d+/, `Page ${page}`),
        };
      }),
    );
  }

  /** Puts back a deleted comment ("Annuler" in the toast). */
  function restoreComment(removed: ClientComment) {
    setComments((current) => (current.some((comment) => comment.id === removed.id) ? current : [...current, removed].sort((a, b) => a.id - b.id)));
  }



  function decideProposal(commentId: number, decision: ProposalDecision) {
    if (isReadOnlyVersion() || isCommercialDecisionLocked(commentId)) return;
    const nextDecisions = { ...proposalDecisions, [commentId]: decision };
    const nextVersions = {
      ...proposalVersions,
      [commentId]: proposalVersions[commentId]?.map((proposal) =>
        proposal.status === "sent" && decision !== "none"
          ? { ...proposal, status: decision }
          : proposal,
      ) ?? currentVersionsFor(commentId, decision),
    };

    setProposalDecisions(nextDecisions);
    setSelectedCommentId(commentId);
    setProposalVersions(nextVersions);

    if (decision !== "none") {
      const label = decision === "accepted" ? "acceptée" : "refusée";
      notifyAgency(
        "proposal.decision",
        `Proposition ${label} par le client`,
        `Le client a ${label} la proposition liée au commentaire #${commentId}`,
        commentId,
        undefined,
        undefined,
        {
          proposalDecisions: nextDecisions,
          proposalVersions: nextVersions,
        },
      );
    }
  }

  function currentVersionsFor(commentId: number, decision: ProposalDecision) {
    const list = proposalVersions[commentId] ?? [];
    if (list.length === 0) {
      return [{
        id: Date.now(),
        version: 1,
        commentId,
        description: "Section témoignages",
        amount: "850 €",
        deadline: "+ 3 jours",
        status: decision,
        createdAt: new Date().toLocaleString("fr-FR"),
      }];
    }
    return list.map((p) => p.status === "sent" ? { ...p, status: decision } : p);
  }

  // Direct read-modify-write so the agency sees the event immediately, without waiting for the generic persist effect.
  function notifyAgency(
    type: string,
    auditDescription: string,
    notificationMessage: string,
    commentId?: number,
    nextReviewStatus?: "changes-requested" | "approved",
    nextApprovedAt?: string,
    overrides?: Record<string, unknown>,
  ) {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const auditEvents = Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [];
      const notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
      const timestamp = new Date().toLocaleString("fr-FR");
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...parsed,
          ...(overrides ?? {}),
          ...(nextReviewStatus && Array.isArray(parsed.deliverables)
            ? {
                deliverables: (parsed.deliverables as Deliverable[]).map((item) =>
                  item.id === (reviewLink?.deliverableId ?? deliverable.id) &&
                  item.version === (reviewLink?.version ?? deliverable.version)
                    ? { ...item, reviewStatus: nextReviewStatus, approvedAt: nextApprovedAt }
                    : item,
                ),
              }
            : {}),
          auditEvents: [
            {
              id: Date.now(),
              type,
              actor: "Client",
              description: auditDescription,
              timestamp,
              commentId,
            },
            ...auditEvents,
          ],
          notifications: [
            { id: Date.now() + 1, message: notificationMessage, time: timestamp },
            ...notifications,
          ],
        }),
      );
    } catch {
      // Ignore storage errors; the client-side state remains the source of truth for this view.
    }
  }

  function confirmApproval() {
    const approvalTimestamp = new Date().toLocaleString("fr-FR");
    setReviewStatus("approved");
    setApprovedAt(approvalTimestamp);
    setDeliverable((current) => ({
      ...current,
      status: "Approuvée",
      locked: true,
    }));
    setApprovalOpen(false);
    notifyAgency(
      "deliverable.approved",
      `Version ${deliverable.version} approuvée par le client`,
      `Le client a approuvé la version ${deliverable.version}`,
      undefined,
      "approved",
      approvalTimestamp,
    );
  }

  function submitChangesRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion() || reviewStatus === "changes-requested") return;
    const message = changesRequestMessage.trim();
    if (!message) return;

    setReviewStatus("changes-requested");
    setChangesRequestOpen(false);
    setChangesRequestMessage("");
    notifyAgency(
      "review.changes-requested",
      `Le client demande des modifications : \u00ab ${message} \u00bb`,
      "Le client demande des modifications sur cette version",
      undefined,
      "changes-requested",
    );
  }

  function activeProposalFor(commentId: number) {
    return proposalVersions[commentId]?.find((proposal) => proposal.status === "sent" || proposal.status === "accepted") ?? proposalVersions[commentId]?.at(-1);
  }

  function isCommercialDecisionLocked(commentId: number) {
    return proposalDecisions[commentId] !== undefined && proposalDecisions[commentId] !== "none"
      || Boolean(adaptationRequests[commentId]?.decision);
  }

  function openAdaptationRequest(commentId: number) {
    if (isReadOnlyVersion() || isCommercialDecisionLocked(commentId)) return;
    setAdaptationCommentId(commentId);
    setAdaptationMessage("");
    setAdaptationBudget("");
    setAdaptationDeadline("");
  }

  function submitAdaptationRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion() || adaptationCommentId === null || isCommercialDecisionLocked(adaptationCommentId)) return;
    const message = adaptationMessage.trim();
    if (!message) return;

    const nextAdaptations = {
      ...adaptationRequests,
      [adaptationCommentId]: {
        message,
        budget: adaptationBudget.trim() ? parseNumericAmount(adaptationBudget) : undefined,
        deadline: adaptationDeadline.trim() ? parseNumericDays(adaptationDeadline) : undefined,
        requestedAt: new Date().toLocaleString("fr-FR"),
      },
    };

    setAdaptationRequests(nextAdaptations);
    notifyAgency(
      "proposal.adaptation-requested",
      `Adaptation demandée par le client sur la proposition #${adaptationCommentId}`,
      `Le client demande une adaptation de la proposition liée au commentaire #${adaptationCommentId}`,
      adaptationCommentId,
      undefined,
      undefined,
      { adaptationRequests: nextAdaptations },
    );
    setAdaptationCommentId(null);
    setAdaptationMessage("");
    setAdaptationBudget("");
    setAdaptationDeadline("");
  }

  const sharedDeliverableId = reviewLink?.deliverableId ?? deliverable.id;
  const sharedComments = comments.filter(
    (comment) => (comment.deliverableId ?? comments[0]?.deliverableId ?? sharedDeliverableId) === sharedDeliverableId,
  );
  // Canvas threads: corrections and remarks (older "À traiter" counts as to clarify).
  const canvasComments: (ThreadComment & { page?: number; sourceId?: number })[] = sharedComments.map((comment) => ({
    ...comment,
    decision: comment.decision === "Inclus" || comment.decision === "Hors périmètre" ? comment.decision : "À qualifier",
  }));
  const sharedProposalComments = sharedComments.filter(
    (comment) => comment.decision === "Hors périmètre" && proposalStates[comment.id] === "sent",
  );
  const previewProposal = proposalPreviewCommentId === null
    ? undefined
    : activeProposalFor(proposalPreviewCommentId);
  const previewProposalComment = proposalPreviewCommentId === null
    ? undefined
    : sharedComments.find((comment) => comment.id === proposalPreviewCommentId);
  const previewAdaptationRequest = proposalPreviewCommentId === null
    ? undefined
    : adaptationRequests[proposalPreviewCommentId];

  if (loading) {
    return <main className="client-review-state">Chargement de la revue...</main>;
  }

  if (accessState === "denied") {
    return (
      <main className="client-review-state">
        <div className="client-state-mark">!</div>
        <p className="eyebrow">ACCÈS À LA REVUE</p>
        <h1>Lien indisponible</h1>
        <p>
          Ce lien de revue est inconnu, expiré ou a été révoqué par l'agence.
        </p>
      </main>
    );
  }

  return (
    <main className="client-review-shell">
      <header className="client-review-header">
        <div className="client-brand">
          <span className="brand-mark">N</span>
          <span>Northstar Studio</span>
        </div>
        <span className="client-review-label">REVUE CLIENT</span>
      </header>
      <section className="client-review-content">
        <div className="client-review-heading">
          <div>
            <p className="eyebrow">NORTHSTAR STUDIO · REFONTE SITE</p>
            <p>
              Consultez le livrable et partagez vos retours avec l'équipe.
            </p>
          </div>
          <div className="client-version-badge">
            Version {String(deliverable.version).padStart(2, "0")} · {reviewStatus === "approved" ? "Approuvée" : reviewStatus === "changes-requested" ? "Modifications demandées" : deliverable.status === "Remplacée" ? "Remplacée" : "À valider"}
          </div>
        </div>
        <div className="client-workspace">
          <ReviewCanvas
            deliverable={{ ...deliverable, type: deliverable.type ?? "PDF" }}
            comments={canvasComments}
            selectedId={selectedCommentId}
            threadOpen={threadOpen}
            readOnly={isReadOnlyVersion()}
            tool={tool}
            tools={["move", "remark"]}
            onToolChange={setTool}
            composer={composer}
            onCompose={(next) => {
              setThreadOpen(false);
              setComposer(next);
            }}
            onPinClick={(comment) => {
              setComposer(null);
              setSelectedCommentId(comment.id);
              setThreadOpen((open) => !(open && comment.id === selectedCommentId));
              setPanelTab(requestKind(comment));
            }}
            onBackgroundClick={() => {
              setThreadOpen(false);
              setComposer(null);
            }}
            transformRef={transformRef}
            canMove={(comment) => comment.initials === "CM" && requestKind(comment) === "comment"}
            onMovePin={moveComment}
            overlay={
              isReadOnlyVersion() ? (
                <div className="canvas-banner" role="status">
                  <Lock aria-hidden="true" />
                  <span>Cette version est en lecture seule.</span>
                </div>
              ) : null
            }
            renderThread={(comment) => {
              const locked = isCommercialDecisionLocked(comment.id);
              return (
                <ThreadPopover
                  key={`${comment.id}-${comment.decision}`}
                  comment={comment}
                  readOnly={isReadOnlyVersion()}
                  locked={locked}
                  proposal={proposalStates[comment.id] === "sent" ? { stage: "sent", label: "Voir la proposition" } : undefined}
                  onReply={(message) => replyTo(comment.id, message)}
                  onOpenProposal={
                    comment.decision === "Hors périmètre" && proposalStates[comment.id] === "sent"
                      ? () => {
                          setThreadOpen(false);
                          document.querySelector(".client-proposals-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      : undefined
                  }
                  onDelete={
                    comment.initials === "CM" && requestKind(comment) === "comment" && !isReadOnlyVersion() && !locked
                      ? () => {
                          deleteComment(comment.id);
                          setThreadOpen(false);
                        }
                      : undefined
                  }
                  onClose={() => setThreadOpen(false)}
                />
              );
            }}
            renderComposer={(current) => (
              <Composer
                key={`${current.x}-${current.y}`}
                x={current.x}
                y={current.y}
                onSubmit={(result) => addComment(result.message, current)}
                onCancel={() => setComposer(null)}
              />
            )}
          />

          <aside className="client-side-panel" aria-label="Vos retours">
            <header className="requests-header">
              <h2>Vos retours</h2>
              {!isReadOnlyVersion() && (
                <div className="requests-actions">
                  <Hint label="Un retour général, sans le placer sur le livrable">
                    <Button className="requests-add" onClick={() => setAddingComment(true)}>
                      <Plus /> Commentaire
                    </Button>
                  </Hint>
                </div>
              )}
            </header>
            <RequestPanel
              comments={canvasComments}
              selectedId={threadOpen ? selectedCommentId : null}
              tab={panelTab}
              onTab={setPanelTab}
              onFocus={focusThread}
              adding={addingComment}
              onAddingChange={setAddingComment}
              onAddComment={isReadOnlyVersion() ? undefined : (message) => addComment(message, null)}
            />
          </aside>
        </div>
        {sharedProposalComments.length > 0 && (
          <section className="client-proposals-panel">
            <div className="client-comments-heading">
              <div>
                <p className="eyebrow">DÉCISIONS COMMERCIALES</p>
                <h2>Propositions complémentaires</h2>
              </div>
              <span>À décider</span>
            </div>
            <div className="client-proposals-list">
              {sharedProposalComments.map((comment) => (
                <article className="client-proposal-card" key={comment.id}>
                  <div>
                    <small>Proposition liée à la demande #{comment.id} · Version {activeProposalFor(comment.id)?.version ?? 1}</small>
                    <p>{comment.message}</p>
                    <div className="client-proposal-summary">
                      <span>{activeProposalFor(comment.id)?.description ?? "Section témoignages"}</span>
                      <b>
                        {formatProposalAmount(activeProposalFor(comment.id)?.amount ?? 850)} · {formatProposalDeadline(activeProposalFor(comment.id)?.deadline ?? 3)}
                      </b>
                    </div>
                  </div>
                  {proposalDecisions[comment.id] === "accepted" ? (
                    <span className="client-proposal-status"><span className="client-proposal-accepted">Acceptée <Check /></span><button type="button" className="proposal-preview-button" onClick={() => setProposalPreviewCommentId(comment.id)} aria-label={`Voir la proposition acceptée pour la demande #${comment.id}`} title="Voir la proposition"><Eye /></button></span>
                  ) : proposalDecisions[comment.id] === "refused" ? (
                    <span className="client-proposal-status"><span className="client-proposal-refused">Refusée</span><button type="button" className="proposal-preview-button" onClick={() => setProposalPreviewCommentId(comment.id)} aria-label={`Voir la proposition refusée pour la demande #${comment.id}`} title="Voir la proposition"><Eye /></button></span>
                  ) : adaptationRequests[comment.id]?.decision ? (
                    <span className="client-proposal-status"><span className={`client-proposal-adaptation ${adaptationRequests[comment.id].decision}`}>{adaptationRequests[comment.id].decision === "accepted" ? "Adaptation acceptée" : "Adaptation refusée"}</span><button type="button" className="proposal-preview-button" onClick={() => setProposalPreviewCommentId(comment.id)} aria-label={`Voir la proposition pour la demande #${comment.id}`} title="Voir la proposition"><Eye /></button></span>
                  ) : adaptationRequests[comment.id] ? (
                    <span className={`client-proposal-adaptation ${adaptationRequests[comment.id].decision ?? ""}`}>
                      {adaptationRequests[comment.id].decision === "accepted" ? "Adaptation acceptée par l'agence" : adaptationRequests[comment.id].decision === "refused" ? "Adaptation refusée par l'agence" : "Adaptation demandée"}
                    </span>
                  ) : (
                    <div className="client-proposal-actions"><button className="client-adapt-action" onClick={() => openAdaptationRequest(comment.id)} disabled={isReadOnlyVersion()}>Demander une adaptation</button><button className="client-refuse-action" onClick={() => decideProposal(comment.id, "refused")} disabled={isReadOnlyVersion()}>Refuser</button><button className="client-accept-action" onClick={() => decideProposal(comment.id, "accepted")} disabled={isReadOnlyVersion()}>Accepter</button></div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="client-review-actions">
          <p>{commentSent ? "Votre commentaire a été transmis à l'équipe." : "Cliquez ou dessinez une zone sur le livrable pour laisser un commentaire."}</p>
          {reviewStatus === "changes-requested" && (
            <div className="client-status-banner"><span className="status-dot changes-dot" />Modifications demandées · en attente d'une nouvelle version de l'agence</div>
          )}
          <div className="client-action-group">
            <button className="client-secondary-action" onClick={() => setChangesRequestOpen(true)} disabled={isReadOnlyVersion() || reviewStatus === "changes-requested"}>Demander des modifications</button>
            <button className="client-primary-action" onClick={() => setApprovalOpen(true)} disabled={isReadOnlyVersion() || reviewStatus === "changes-requested"}>{reviewStatus === "approved" ? `Version approuvée${approvedAt ? ` · ${approvedAt}` : ""}` : "Approuver cette version"}</button>
          </div>
        </div>
      </section>
      <Modal
        open={proposalPreviewCommentId !== null && Boolean(previewProposal)}
        onClose={() => setProposalPreviewCommentId(null)}
        title="Résumé de la proposition"
        description={previewProposal ? `Demande #${previewProposalComment?.id} · Version ${previewProposal.version}` : undefined}
      >
        {previewProposal && (
          <>
            <div className={`proposal-preview-status ${proposalDecisions[previewProposal.commentId] === "refused" || previewAdaptationRequest?.decision === "refused" ? "refused" : "accepted"}`}>
              {previewAdaptationRequest?.decision === "accepted"
                ? `Acceptée par l’agence${previewAdaptationRequest.decisionBy ? ` · ${previewAdaptationRequest.decisionBy}` : ""}`
                : previewAdaptationRequest?.decision === "refused"
                  ? `Refusée par l’agence${previewAdaptationRequest.decisionBy ? ` · ${previewAdaptationRequest.decisionBy}` : ""}`
                  : proposalDecisions[previewProposal.commentId] === "accepted"
                    ? "Acceptée par le client"
                    : "Refusée par le client"}
            </div>
            <div className="proposal-summary">
              <div>
                <span>Prestation</span>
                <b>{previewProposal.description}</b>
              </div>
              <div>
                <span>Montant</span>
                <b>{formatProposalAmount(previewProposal.amount)}</b>
              </div>
              <div>
                <span>Impact planning</span>
                <b>{formatProposalDeadline(previewProposal.deadline)}</b>
              </div>
            </div>
            {previewAdaptationRequest && (
              <div className="adaptation-request-summary">
                <span>Demande d’adaptation · {previewAdaptationRequest.requestedAt}</span>
                <p>{previewAdaptationRequest.message}</p>
              </div>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={adaptationCommentId !== null}
        onClose={() => setAdaptationCommentId(null)}
        title="Demander une adaptation"
        description="L’agence reste responsable du chiffrage. Décrivez votre besoin et, si vous le souhaitez, indiquez un budget ou un délai cible."
        onSubmit={submitAdaptationRequest}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setAdaptationCommentId(null)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!adaptationMessage.trim()}>
              Envoyer la demande
            </Button>
          </>
        }
      >
        <Field id="adaptation-message" label="Votre demande">
          <Textarea id="adaptation-message" autoFocus value={adaptationMessage} onChange={(event) => setAdaptationMessage(event.target.value)} placeholder="Ex. Pouvez-vous proposer une version limitée au formulaire ?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="adaptation-budget" label="Budget indicatif" optional>
            <AddonInput id="adaptation-budget" addon="€" type="number" min="0" step="10" value={adaptationBudget} onChange={(event) => setAdaptationBudget(event.target.value)} />
          </Field>
          <Field id="adaptation-deadline" label="Délai souhaité" optional>
            <AddonInput id="adaptation-deadline" addon="jours" type="number" min="0" step="1" value={adaptationDeadline} onChange={(event) => setAdaptationDeadline(event.target.value)} />
          </Field>
        </div>
      </Modal>
      <Modal
        open={changesRequestOpen}
        onClose={() => setChangesRequestOpen(false)}
        title="Demander des modifications"
        description="Cette version ne sera pas approuvable tant que l’agence n’aura pas soumis une nouvelle version."
        onSubmit={submitChangesRequest}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setChangesRequestOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!changesRequestMessage.trim()}>
              Envoyer la demande
            </Button>
          </>
        }
      >
        <Field id="changes-request" label="Votre demande">
          <Textarea id="changes-request" autoFocus value={changesRequestMessage} onChange={(event) => setChangesRequestMessage(event.target.value)} placeholder="Décrivez ce qui doit être revu avant validation…" />
        </Field>
      </Modal>
      <Modal
        open={approvalOpen}
        onClose={() => setApprovalOpen(false)}
        role="alertdialog"
        title="Approuver cette version ?"
        description="Vous confirmez que cette version peut être considérée comme validée par Northstar Studio."
        footer={
          <>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={confirmApproval}>Confirmer l’approbation</Button>
          </>
        }
      />
    </main>
  );
}

function parseFrenchDate(value: string) {
  const parts = value.split("/").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date("invalid");
  }

  const [day, month, year] = parts;
  return new Date(year, month - 1, day, 23, 59, 59);
}

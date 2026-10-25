"use client";
import { formatProposalAmount, formatProposalDeadline, parseNumericAmount, parseNumericDays } from "@/lib/proposalFormat";
import { areaFromPin } from "@/lib/pinArea";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { ArrowRight, Check, Clock, Loader2, Lock, PenLine } from "lucide-react";
import type { DeliverableType } from "@/components/deliverableKinds";
import { Composer, ThreadPopover, requestKind, type Area, type ProposalStage, type ThreadComment } from "@/app/(agency)/editor/CanvasComments";
import { offerOf, offerValue } from "@/lib/requestOffer";
import { OfferFigures, RequestPanel, type InspectorTab } from "@/app/(agency)/editor/EditorInspector";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AddonInput, Field, Modal } from "@/components/modal";
import { ReviewCanvas, type CanvasComposer, type CanvasTool } from "@/app/(agency)/editor/ReviewCanvas";
import { Hint } from "@/components/hint";
import { ResizeHandle } from "@/app/(agency)/editor/ResizeHandle";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import { loadSharedState, subscribeSharedState } from "@/lib/stateSync";
import { reviewAction } from "@/lib/reviewActions";
import type { ClientRole } from "@/lib/clientRoles";
import { AccessGate, ProfileGate } from "./AccessGate";
import { ClientCompare } from "./ClientCompare";
import { AuthShell } from "@/components/AuthShell";
import { GateHeading } from "@/components/GatePieces";
import { initialsOf, sideOf, type Side } from "@/lib/authors";
import { outsideStatusOf, outsideStatusView } from "@/lib/outsideStatus";
import { ExportMenu } from "@/app/(agency)/editor/ExportMenu";
import { ClientScopeButton } from "@/app/(agency)/ProjectScope";
import type { ClientScope, ScopeAmendment } from "@/lib/projectScope";
import { ClientNotifications, type ClientNotice } from "./ClientNotifications";



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
  projectId?: number;
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
  /** Who wrote it (older messages: from their initials, see src/lib/authors.ts). */
  from?: Side;
  message: string;
  time: string;
  /** When it was written (ms); older data only has `time`. */
  createdAt?: number;
  edited?: boolean;
};

type ClientComment = {
  id: number;
  deliverableId?: number;
  author: string;
  initials: string;
  /** Who wrote it (older messages: from their initials, see src/lib/authors.ts). */
  from?: Side;
  time: string;
  createdAt?: number;
  message: string;
  edited?: boolean;
  location: string;
  decision?: "À qualifier" | "À traiter" | "Inclus" | "Hors périmètre";
  position?: { x: number; y: number };
  page?: number;
  /** On a video: the moment it was pinned on, in seconds (src/lib/timecode.ts). */
  timecode?: number;
  replies?: Reply[];
  /** Set by the agency: "request" = correction. */
  kind?: "remark" | "request";
  title?: string;
  sourceId?: number;
  area?: Area;
  /** When the agency last qualified it, for the client's own requests (src/db/reviewAccess.ts). */
  qualifiedAt?: number;
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
  /** The client may counter-propose; absent on older data = allowed. */
  allowCounter?: boolean;
};
type ProposalVersions = Record<number, ProposalVersion[]>;


export default function ClientReviewPage() {
  const params = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [accessState, setAccessState] = useState<"allowed" | "denied">("denied");
  /** Who opens the link (see /api/review/[token]/access): "none" shows the e-mail verification first. */
  const [viewer, setViewer] = useState<{
    mode: "client" | "preview" | "none";
    verifiedEmail: string | null;
    /** A personal link's invitation: its address masked, the code asked by its id (never the whole address). */
    invitation: { id: string | null; masked: string } | null;
    /** The client's full name; null until they give it, at their first verification. */
    name: string | null;
    deliverable: string;
    /** On this link: a decider approves and decides quotes, a contributor comments (src/lib/clientRoles.ts). */
    role: ClientRole | null;
    /** A later version shared with this client (src/db/reviewAuth.ts newerSharedVersion); none otherwise. */
    newerVersion?: { version: number; href: string } | null;
  } | null>(null);
  const viewerMode = viewer?.mode;
  const contributor = viewerMode === "client" && viewer?.role === "contributor";
  /** Name shown on the client's own messages: the verified address (the server signs with it anyway). */
  const clientName = viewer?.name ?? viewer?.verifiedEmail ?? "Client";
  const [reviewLink, setReviewLink] = useState<ReviewLink | null>(null);
  const [comments, setComments] = useState<ClientComment[]>([]);
  /** "Northstar · Refonte site": where the shared deliverable lives. */
  const [panelWidth, setPanelWidth] = useState(340);
  /** Agency replies and proposals the client has opened ("c12", "r1739…", "p1739…"); read once, in the browser. */
  const [seen, setSeen] = useState<string[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`kora-client-seen-${window.location.pathname.split("/").pop()}`) ?? "[]");
      return Array.isArray(saved) ? saved.filter((key) => typeof key === "string") : [];
    } catch {
      return [];
    }
  });
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<number | null>(null);
  const [tool, setTool] = useState<CanvasTool>("remark");
  /** The selected thread is open on the canvas. */
  const [threadOpen, setThreadOpen] = useState(false);
  const [composer, setComposer] = useState<CanvasComposer | null>(null);
  const [panelTab, setPanelTab] = useState<InspectorTab>("comment");
  const [proposalStates, setProposalStates] = useState<ProposalStates>({});
  /** The project's scope, once active: what was agreed (src/lib/projectScope.ts clientScope). */
  const [projectScope, setProjectScope] = useState<ClientScope | undefined>();
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
  const [deliverable, setDeliverable] = useState<Deliverable>({
    name: "northstar-landing-v03.pdf",
    version: 3,
    status: "À valider",
  });

  const [accessCheck, setAccessCheck] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const invitation = new URLSearchParams(window.location.search).get("invitation");
    const query = invitation ? `?invitation=${encodeURIComponent(invitation)}` : "";
    fetch(`/api/review/${encodeURIComponent(params.token)}/access${query}`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setLoading(false);
          return;
        }
        setViewer(await response.json());
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params.token, accessCheck]);

  useEffect(() => {
    if (viewerMode !== "client" && viewerMode !== "preview") return;
    let cancelled = false;
    void loadSharedState(params.token).then((savedState) => {
      if (cancelled) return;
      if (!savedState || !params.token) {
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
          projects?: { id: number; name: string; clientId?: number; scope?: ClientScope }[];
          clients?: { id: number; name: string }[];
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
          setProjectScope(parsedState.projects?.[0]?.scope);
        }
      } catch {
        setAccessState("denied");
      } finally {
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [params.token, viewerMode]);

  useEffect(() => {
    function syncFromStorage(newValue: string) {
      try {
        const parsedState = JSON.parse(newValue) as {
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
          projects?: { scope?: ClientScope }[];
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
        setProjectScope(parsedState.projects?.[0]?.scope);
      } catch {
        // Ignore malformed external updates.
      }
    }

    return subscribeSharedState(syncFromStorage);
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

  // Read state of the agency's answers, per review link.
  const seenKey = `kora-client-seen-${params.token}`;
  function markSeen(keys: string[]) {
    setSeen((current) => {
      const base = current ?? [];
      const fresh = keys.filter((key) => !base.includes(key));
      if (fresh.length === 0) return current;
      const next = [...base, ...fresh];
      try {
        window.localStorage.setItem(seenKey, JSON.stringify(next));
      } catch {
        // Unread dots come back on reload when storage is unavailable.
      }
      return next;
    });
  }
  /** Keys of the agency's answers on a request: its replies (or the request itself if the agency wrote it), and the proposal sent. */
  function agencyKeysOf(comment: ClientComment) {
    const keys = [
      ...(sideOf(comment) === "agency" ? [`c${comment.id}`] : []),
      ...(comment.replies ?? []).filter((reply) => sideOf(reply) === "agency").map((reply) => `r${reply.id}`),
    ];
    const proposal = proposalStates[comment.id] === "sent" ? activeProposalFor(comment.id) : undefined;
    if (proposal) keys.push(`p${proposal.id}`);
    return keys;
  }
  const isUnread = (comment: ClientComment) => seen !== null && agencyKeysOf(comment).some((key) => !seen.includes(key));

  function isReadOnlyVersion() {
    // The agency previewing the page only reads.
    if (viewerMode === "preview") return true;
    return reviewStatus === "approved" || deliverable.locked || deliverable.status === "Approuvée" || deliverable.status === "Remplacée";
  }

  /** Publishes a comment written on the canvas, or by hand (no position) from the panel. */
  function addComment(message: string, spot: CanvasComposer | null) {
    if (isReadOnlyVersion()) return;
    // Like the agency: the page only sees this version's comments, ids must not depend on them.
    const id = Date.now();
    const comment: ClientComment = {
      id,
      deliverableId: reviewLink?.deliverableId ?? deliverable.id,
      author: clientName,
      initials: initialsOf(clientName),
      from: "client",
      time: "À l'instant",
      createdAt: Date.now(),
      message,
      location: spot?.target ?? "Livrable (général)",
      decision: "À qualifier",
      kind: "remark",
      page: spot?.page ?? 1,
      position: spot ? { x: spot.x, y: spot.y } : undefined,
      area: spot?.area,
      timecode: spot?.timecode,
    };
    setComments((current) => [...current, comment]);
    setComposer(null);
    setSelectedCommentId(id);
    setPanelTab("comment");
    setThreadOpen(true);
    void createComment(comment);
  }

  /** Sends a comment (new, or put back after a deletion); the server may give it another id. */
  async function createComment(comment: ClientComment) {
    const { id, message, location, page, position, area, timecode } = comment;
    const replies = (comment.replies ?? []).filter((reply) => sideOf(reply) === "client").map((reply) => ({ id: reply.id, message: reply.message }));
    const result = await reviewAction(params.token, "comments", "POST", { id, message, location, page, position, area, timecode, replies });
    if (result?.id && result.id !== id) setSelectedCommentId((selected) => (selected === id ? result.id! : selected));
  }

  function replyTo(commentId: number, message: string) {
    if (isReadOnlyVersion() || isCommercialDecisionLocked(commentId)) return;
    const reply: Reply = { id: Date.now(), author: clientName, initials: initialsOf(clientName), from: "client", message, time: "À l'instant", createdAt: Date.now() };
    setComments((current) => current.map((comment) => (comment.id === commentId ? { ...comment, replies: [...(comment.replies ?? []), reply] } : comment)));
    void reviewAction(params.token, `comments/${commentId}/replies`, "POST", { id: reply.id, message });
  }

  /** Its own comment (messageId 0) or one of its replies, rewritten. */
  function editMessage(commentId: number, messageId: number, message: string) {
    setComments((current) =>
      current.map((candidate) =>
        candidate.id !== commentId
          ? candidate
          : messageId === 0
            ? { ...candidate, message, edited: true }
            : { ...candidate, replies: candidate.replies?.map((reply) => (reply.id === messageId ? { ...reply, message, edited: true } : reply)) },
      ),
    );
    void reviewAction(params.token, messageId === 0 ? `comments/${commentId}` : `comments/${commentId}/replies/${messageId}`, "PATCH", { message });
  }

  function deleteReply(commentId: number, replyId: number) {
    setComments((current) => current.map((candidate) => (candidate.id === commentId ? { ...candidate, replies: candidate.replies?.filter((reply) => reply.id !== replyId) } : candidate)));
    void reviewAction(params.token, `comments/${commentId}/replies/${replyId}`, "DELETE");
  }

  /** Opens a thread from the side list and brings its pin into view. */
  function focusThread(commentId: number) {
    readThread(commentId);
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
    if (!target || sideOf(target) !== "client") return;
    setComments((current) => {
      const updated = current.filter((comment) => comment.id !== commentId);
      if (selectedCommentId === commentId) {
        setSelectedCommentId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
    void reviewAction(params.token, `comments/${commentId}`, "DELETE");
    toast("Commentaire supprimé", { action: { label: "Annuler", onClick: () => restoreComment(target) } });
  }

  /** Double-click a pin, then click: the comment moves there (its drawn area follows, as the server does: src/lib/pinArea.ts). */
  function moveComment(commentId: number, page: number, x: number, y: number) {
    if (isReadOnlyVersion()) return;
    void reviewAction(params.token, `comments/${commentId}`, "PATCH", { page, x, y });
    setComments((current) =>
      current.map((comment) => {
        if (comment.id !== commentId || !comment.position) return comment;
        return {
          ...comment,
          page,
          position: { x, y },
          area: comment.area ? areaFromPin(comment.area, comment.position, x, y) : undefined,
          location: comment.location.replace(/^Page \d+/, `Page ${page}`),
        };
      }),
    );
  }

  /** Puts back a deleted comment ("Annuler" in the toast). */
  function restoreComment(removed: ClientComment) {
    setComments((current) => (current.some((comment) => comment.id === removed.id) ? current : [...current, removed].sort((a, b) => a.id - b.id)));
    void createComment(removed);
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

    if (decision !== "none") void reviewAction(params.token, `proposals/${commentId}/decision`, "POST", { decision });
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
    void reviewAction(params.token, "approval", "POST");
  }

  function submitChangesRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion() || reviewStatus === "changes-requested") return;
    const message = changesRequestMessage.trim();
    if (!message) return;

    setReviewStatus("changes-requested");
    setChangesRequestOpen(false);
    setChangesRequestMessage("");
    void reviewAction(params.token, "changes-request", "POST", { message });
  }

  function activeProposalFor(commentId: number) {
    return proposalVersions[commentId]?.find((proposal) => proposal.status === "sent" || proposal.status === "accepted") ?? proposalVersions[commentId]?.at(-1);
  }

  // A draft quote is never sent here: for the client, nothing is said before a proposal is sent. An offer
  // is said at once, with its value (src/lib/requestOffer.ts).
  const clientOutsideStatus = (comment: ThreadComment) =>
    outsideStatusOf({ state: proposalStates[comment.id] === "sent" ? "sent" : "none", decision: proposalDecisions[comment.id] ?? "none", adaptation: adaptationRequests[comment.id], offered: Boolean(offerOf(comment)) });
  const clientProposalStage = (comment: ThreadComment): ProposalStage | null => {
    const offer = offerOf(comment);
    if (offer) return { stage: "offered", value: offerValue(offer) };
    return proposalStates[comment.id] === "sent" ? { stage: "sent", label: "Voir la proposition" } : null;
  };

  function isCommercialDecisionLocked(commentId: number) {
    return proposalDecisions[commentId] !== undefined && proposalDecisions[commentId] !== "none"
      || Boolean(adaptationRequests[commentId]?.decision);
  }

  /** The agency let the client answer with a counter-proposal (adaptation). */
  function canCounter(commentId: number) {
    return activeProposalFor(commentId)?.allowCounter !== false;
  }

  function openAdaptationRequest(commentId: number) {
    if (isReadOnlyVersion() || isCommercialDecisionLocked(commentId) || !canCounter(commentId)) return;
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

    const request = {
      message,
      budget: adaptationBudget.trim() ? parseNumericAmount(adaptationBudget) : undefined,
      deadline: adaptationDeadline.trim() ? parseNumericDays(adaptationDeadline) : undefined,
      requestedAt: new Date().toLocaleString("fr-FR"),
    };
    setAdaptationRequests({ ...adaptationRequests, [adaptationCommentId]: request });
    void reviewAction(params.token, `proposals/${adaptationCommentId}/adaptation`, "POST", { message, budget: request.budget, deadline: request.deadline });
    setAdaptationCommentId(null);
    setAdaptationMessage("");
    setAdaptationBudget("");
    setAdaptationDeadline("");
  }

  const sharedDeliverableId = reviewLink?.deliverableId ?? deliverable.id;
  const unreadCount = seen === null ? 0 : comments.filter((comment) => (comment.deliverableId ?? sharedDeliverableId) === sharedDeliverableId).flatMap(agencyKeysOf).filter((key) => !seen.includes(key)).length;
  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    if (seen === null) return;
    if (previousUnread.current !== null && unreadCount > previousUnread.current) toast("Nouvelle réponse de l’organisation", { description: "Un point marqué d’un rond orange vous attend dans « Vos retours »." });
    previousUnread.current = unreadCount;
  }, [unreadCount, seen]);
  /** Opening a thread marks the agency's replies as read. */
  function readThread(commentId: number) {
    const comment = comments.find((candidate) => candidate.id === commentId);
    if (comment) markSeen(agencyKeysOf(comment).filter((key) => !key.startsWith("p")));
  }
  /** Opening a proposal marks it as read. */
  function openProposalModal(commentId: number) {
    const proposal = activeProposalFor(commentId);
    if (proposal) markSeen([`p${proposal.id}`]);
    setProposalPreviewCommentId(commentId);
  }
  const sharedComments = comments.filter(
    (comment) => (comment.deliverableId ?? comments[0]?.deliverableId ?? sharedDeliverableId) === sharedDeliverableId,
  );
  // Quotes still waiting for this client: decided before validating, since the version then locks
  // (the server refuses the validation otherwise, src/db/reviewActions.ts).
  const quotesToDecide = sharedComments.filter(
    (comment) => proposalStates[comment.id] === "sent" && (proposalDecisions[comment.id] ?? "none") === "none" && !adaptationRequests[comment.id]?.decision,
  );
  // Remarks still to clarify: validating gives them up, which the dialog says and the server records.
  const remarksToClarify = sharedComments.filter((comment) => comment.decision !== "Inclus" && comment.decision !== "Hors périmètre");
  // Canvas threads: corrections and remarks (older "À traiter" counts as to clarify).
  const canvasComments: (ThreadComment & { page?: number; sourceId?: number })[] = sharedComments.map((comment) => ({
    ...comment,
    decision: comment.decision === "Inclus" || comment.decision === "Hors périmètre" ? comment.decision : "À qualifier",
  }));
  const previewProposal = proposalPreviewCommentId === null
    ? undefined
    : activeProposalFor(proposalPreviewCommentId);
  const previewProposalComment = proposalPreviewCommentId === null
    ? undefined
    : sharedComments.find((comment) => comment.id === proposalPreviewCommentId);
  const previewAdaptationRequest = proposalPreviewCommentId === null
    ? undefined
    : adaptationRequests[proposalPreviewCommentId];

  if (viewer?.mode === "none")
    return (
      <AccessGate
        token={params.token}
        deliverable={viewer.deliverable}
        invitation={viewer.invitation}
        verifiedEmail={viewer.verifiedEmail}
        onVerified={() => {
          setViewer(null);
          setAccessCheck((count) => count + 1);
        }}
      />
    );

  // First verification of this address: their name, before the review.
  if (viewer?.mode === "client" && !viewer.name && viewer.verifiedEmail)
    return (
      <ProfileGate
        token={params.token}
        deliverable={viewer.deliverable}
        email={viewer.verifiedEmail}
        onSaved={(name) => setViewer((current) => (current ? { ...current, name } : current))}
      />
    );

  if (loading) {
    return (
      <AuthShell plain>
        <p className="gate-loading" role="status">
          <Loader2 aria-hidden="true" /> Chargement de la revue…
        </p>
      </AuthShell>
    );
  }

  if (accessState === "denied") {
    return (
      <AuthShell plain>
        <GateHeading title="Lien indisponible">
          Ce lien de revue est inconnu, expiré ou a été révoqué par l’organisation. Demandez-lui un nouveau lien.
        </GateHeading>
      </AuthShell>
    );
  }

  const versionName = (version: number) => `V${String(version).padStart(2, "0")}`;
  const versionLabel = versionName(deliverable.version);
  const newerVersion = viewer?.newerVersion ?? null;
  const reviewState =
    reviewStatus === "approved"
      ? { tone: "approved", icon: <Check />, label: "Validée", hint: approvedAt ? `Validée le ${approvedAt}` : "Version validée" }
      : reviewStatus === "changes-requested"
        ? { tone: "changes", icon: <PenLine />, label: "Modifications demandées", hint: "En attente d’une nouvelle version de l’organisation" }
        : deliverable.status === "Remplacée"
          ? // A version still in preparation at the agency stays unknown to the client.
            newerVersion
            ? { tone: "replaced", icon: <Lock />, label: "Ancienne version", hint: `La ${versionName(newerVersion.version)} vous a été partagée` }
            : { tone: "replaced", icon: <Lock />, label: "Fermée", hint: "Cette version n’est plus en revue" }
          : { tone: "pending", icon: <Clock />, label: "À valider", hint: "En attente de votre validation" };
  const canValidate = !isReadOnlyVersion() && reviewStatus === "pending" && !contributor;
  /** Where the client's decision on a proposal stands. */
  const proposalStatus = (commentId: number) => {
    const adaptation = adaptationRequests[commentId];
    if (proposalDecisions[commentId] === "accepted") return { label: "Acceptée", tone: "decision-included" };
    if (proposalDecisions[commentId] === "refused") return { label: "Refusée", tone: "decision-refused" };
    if (adaptation?.decision === "accepted") return { label: "Adaptation acceptée", tone: "decision-included" };
    if (adaptation?.decision === "refused") return { label: "Adaptation refusée", tone: "decision-refused" };
    if (adaptation) return { label: "Adaptation demandée", tone: "decision-sent" };
    return { label: "À décider", tone: "decision-sent" };
  };
  const canDecide = (commentId: number) => !isReadOnlyVersion() && !contributor && !isCommercialDecisionLocked(commentId) && !adaptationRequests[commentId];

  const requestName = (comment: ClientComment) => comment.title?.trim() || comment.message;
  const excerpt = (text: string) => (text.length > 90 ? `${text.slice(0, 89)}…` : text);
  const qualificationLabel = (comment: ClientComment) => (comment.decision === "Inclus" ? "Inclus" : comment.decision === "Hors périmètre" ? "Hors scope" : "À clarifier");
  // The bell: the agency's replies, the quotes to decide, the client's requests qualified, a newer version.
  const notices: ClientNotice[] = [
    ...sharedComments.flatMap((comment) =>
      (comment.replies ?? [])
        .filter((reply) => sideOf(reply) === "agency")
        .map((reply) => ({
          key: `r${reply.id}`,
          at: reply.createdAt ?? (reply.id > 1e12 ? reply.id : undefined),
          title: "Réponse de l’organisation",
          detail: `« ${excerpt(reply.message)} » · ${requestName(comment)}`,
          onOpen: () => focusThread(comment.id),
        })),
    ),
    ...quotesToDecide.flatMap((comment) => {
      const proposal = activeProposalFor(comment.id);
      return proposal
        ? [{ key: `p${proposal.id}`, at: proposal.id > 1e12 ? proposal.id : undefined, title: "Devis à valider", detail: `${requestName(comment)} · ${formatProposalAmount(proposal.amount)} HT`, onOpen: () => openProposalModal(comment.id) }]
        : [];
    }),
    ...sharedComments
      .filter((comment) => comment.qualifiedAt !== undefined && sideOf(comment) === "client")
      .map((comment) => ({ key: `q${comment.id}:${comment.qualifiedAt}`, at: comment.qualifiedAt, title: `Demande qualifiée : ${qualificationLabel(comment)}`, detail: requestName(comment), onOpen: () => focusThread(comment.id) })),
    ...(newerVersion ? [{ key: `v${newerVersion.version}`, title: `La ${versionName(newerVersion.version)} vous a été partagée`, detail: "Ouvrir la nouvelle version", onOpen: () => window.location.assign(newerVersion.href) }] : []),
  ];
  // The scope's amendments, as the client sees them: the accepted out-of-scope quotes of this version.
  const amendments: ScopeAmendment[] = sharedComments
    .filter((comment) => comment.decision === "Hors périmètre" && proposalDecisions[comment.id] === "accepted")
    .map((comment) => {
      const proposal = activeProposalFor(comment.id);
      return { commentId: comment.id, title: requestName(comment), deliverable: `${deliverable.name} · ${versionLabel}`, amount: parseNumericAmount(proposal?.amount), days: parseNumericDays(proposal?.deadline) };
    });

  return (
    <main className="client-app">
      <header className="client-topbar">
        <div className="client-topbar-identity">
          <span className="client-topbar-icon" aria-hidden="true">
            <DeliverableIcon type={deliverable.type ?? "PDF"} />
          </span>
          <div className="min-w-0">
            <h1 className="client-topbar-title">
              <span className="truncate">{deliverable.name}</span>
            </h1>
            {contributor && <p className="client-topbar-context">Contributeur · vos retours sont transmis, la validation revient au décideur désigné par l’organisation</p>}
          </div>
        </div>
        <div className="client-topbar-actions">
          <div className="client-version-state">
            <Hint label="Version actuelle du livrable">
              <span className="version-chip">{versionLabel}</span>
            </Hint>
            <Hint label={reviewState.hint}>
              <span className={`client-review-state-chip is-${reviewState.tone}`} role="status">
                {reviewState.icon}
                {reviewState.label}
              </span>
            </Hint>
          </div>
          <ClientCompare token={params.token} currentVersion={deliverable.version} />
          {/* One call to action on this page: validating. Feedback goes through comments. */}
          {canValidate && (
            <Button onClick={() => setApprovalOpen(true)}>
              <Check /> Valider cette version
            </Button>
          )}
        </div>
      </header>
      <div className="client-body" style={{ gridTemplateColumns: `minmax(0, 1fr) ${panelWidth}px` }}>
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
            readThread(comment.id);
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
          canMove={(comment) => sideOf(comment) === "client" && requestKind(comment) === "comment"}
          onMovePin={moveComment}
          toolbarExtra={
            <ExportMenu
              title={`${deliverable.name} — ${versionLabel}`}
              comments={canvasComments}
              statusOf={(comment) =>
                comment.decision === "Hors périmètre" ? outsideStatusView(clientOutsideStatus(comment), "client").label : null
              }
              file={deliverable.fileData}
            />
          }
          overlay={
            newerVersion ? (
              <div className="canvas-banner" role="status">
                <span className="canvas-banner-icon" aria-hidden="true">
                  <Lock />
                </span>
                <span className="canvas-banner-text">
                  <b>Vous consultez une ancienne version</b>
                  <small>
                    {reviewStatus === "approved" ? "Vous avez validé cette version. " : ""}La {versionName(newerVersion.version)} vous a été partagée.
                  </small>
                </span>
                <Button asChild size="sm">
                  <a href={newerVersion.href}>
                    Voir la {versionName(newerVersion.version)} <ArrowRight />
                  </a>
                </Button>
              </div>
            ) : isReadOnlyVersion() ? (
              <div className="canvas-banner" role="status">
                <span className="canvas-banner-icon" aria-hidden="true">
                  <Lock />
                </span>
                <span className="canvas-banner-text">
                  <b>Lecture seule</b>
                  <small>{reviewStatus === "approved" ? "Vous avez validé cette version" : "Cette version n’est plus en revue"}</small>
                </span>
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
                proposal={clientProposalStage(comment) ?? undefined}
                onReply={(message) => replyTo(comment.id, message)}
                me="client"
                onEditMessage={(messageId, message) => editMessage(comment.id, messageId, message)}
                onDeleteMessage={(messageId) => {
                  deleteReply(comment.id, messageId);
                  toast("Message supprimé");
                }}
                onOpenProposal={
                  comment.decision === "Hors périmètre" && proposalStates[comment.id] === "sent"
                    ? () => {
                        setThreadOpen(false);
                        openProposalModal(comment.id);
                      }
                    : undefined
                }
                onDelete={
                  // Their own comment, until the agency qualifies it (a title) or closes it: then it is closed, not deleted.
                  sideOf(comment) === "client" && requestKind(comment) === "comment" && !comment.title?.trim() && !comment.closed && !isReadOnlyVersion() && !locked
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

        <aside className="inspector client-side-panel" aria-label="Vos retours">
          <ResizeHandle edge="left" width={panelWidth} min={300} max={560} defaultWidth={340} label="Largeur du panneau des retours" onResize={setPanelWidth} />
          <header className="requests-header">
            <h2>Vos retours</h2>
            <div className="requests-actions">
              <ClientNotifications notices={notices} seen={seen} onSeen={markSeen} />
              <ClientScopeButton scope={projectScope} amendments={amendments} />
            </div>
          </header>
          <RequestPanel
            comments={canvasComments}
            selectedId={threadOpen ? selectedCommentId : null}
            tab={panelTab}
            onTab={setPanelTab}
            onFocus={focusThread}
            proposalStage={clientProposalStage}
            onOpenProposal={openProposalModal}
            unread={(comment) => isUnread(comment as ClientComment)}
            outsideStatus={clientOutsideStatus}
            proposalSummary={(comment) => {
              // Offered: its value, not an earlier quote's.
              const offer = offerOf(comment);
              if (offer) return <OfferFigures offer={offer} />;
              const proposal = activeProposalFor(comment.id);
              return (
                <span className="client-proposal-line">
                  <span className="proposal-figure">
                    <small>Montant</small>
                    <b>{formatProposalAmount(proposal?.amount)} HT</b>
                  </span>
                  <span className="proposal-figure">
                    <small>Délai supplémentaire</small>
                    <b>{parseNumericDays(proposal?.deadline) ? formatProposalDeadline(proposal?.deadline) : "aucun"}</b>
                  </span>
                </span>
              );
            }}
            // Comments are written on the deliverable (canvas); no general comment from the panel.
            adding={false}
            onAddingChange={() => undefined}
          />
        </aside>
      </div>
      <Modal
        open={proposalPreviewCommentId !== null && Boolean(previewProposal)}
        onClose={() => setProposalPreviewCommentId(null)}
        title={`Proposition · demande n°${previewProposalComment?.id ?? ""}`}
        description={previewProposalComment ? (previewProposalComment.title ?? previewProposalComment.message) : undefined}
        footer={
          previewProposal && proposalPreviewCommentId !== null && canDecide(proposalPreviewCommentId) ? (
            <>
              {canCounter(proposalPreviewCommentId) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const id = proposalPreviewCommentId;
                    setProposalPreviewCommentId(null);
                    openAdaptationRequest(id);
                  }}
                >
                  Faire une contre-proposition
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  decideProposal(proposalPreviewCommentId, "refused");
                  setProposalPreviewCommentId(null);
                }}
              >
                Refuser
              </Button>
              <Button
                onClick={() => {
                  decideProposal(proposalPreviewCommentId, "accepted");
                  setProposalPreviewCommentId(null);
                  toast("Proposition acceptée");
                }}
              >
                <Check /> Accepter
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setProposalPreviewCommentId(null)}>
              Fermer
            </Button>
          )
        }
      >
        {previewProposal && proposalPreviewCommentId !== null && (
          <>
            <div className="proposal-summary">
              <div>
                <span>Prestation</span>
                <b>{previewProposal.description}</b>
              </div>
              <div>
                <span>Montant</span>
                <b>{formatProposalAmount(previewProposal.amount)} HT</b>
              </div>
              <div>
                <span>Impact planning</span>
                <b>{formatProposalDeadline(previewProposal.deadline)}</b>
              </div>
            </div>
            <p className="flex items-center gap-2 text-sm">
              {proposalStatus(proposalPreviewCommentId).label === "À décider" ? <Clock className="size-4" aria-hidden="true" /> : null}
              <span className={`decision-badge ${proposalStatus(proposalPreviewCommentId).tone}`}>{proposalStatus(proposalPreviewCommentId).label}</span>
              <span className="text-muted-foreground">Version {previewProposal.version} de la proposition</span>
            </p>
            {contributor && proposalStatus(proposalPreviewCommentId).label === "À décider" && (
              <p className="text-sm text-muted-foreground">Seul le décideur désigné par l’organisation peut accepter ou refuser cette proposition.</p>
            )}
            {!canCounter(proposalPreviewCommentId) && canDecide(proposalPreviewCommentId) && (
              <p className="text-sm text-muted-foreground">L’organisation ne propose pas de contre-proposition sur ce devis : un refus est définitif.</p>
            )}
            {previewAdaptationRequest && (
              <div className="adaptation-request-summary">
                <span>Votre demande d’adaptation · {previewAdaptationRequest.requestedAt}</span>
                <p>{previewAdaptationRequest.message}</p>
              </div>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={adaptationCommentId !== null}
        onClose={() => setAdaptationCommentId(null)}
        title="Faire une contre-proposition"
        description="L’organisation reste responsable du chiffrage. Décrivez votre besoin et, si vous le souhaitez, indiquez un budget ou un délai cible."
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
            <AddonInput id="adaptation-budget" addon="€" type="number" min="0" step="0.01" value={adaptationBudget} onChange={(event) => setAdaptationBudget(event.target.value)} />
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
        description="Cette version ne sera pas approuvable tant que l’organisation n’aura pas soumis une nouvelle version."
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
        title="Valider cette version ?"
        description={
          quotesToDecide.length
            ? "Avant de valider, décidez de chaque proposition en attente : une fois validée, la version est verrouillée."
            : "L’organisation en est informée et la version passe en lecture seule."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={confirmApproval} disabled={quotesToDecide.length > 0}>
              {remarksToClarify.length ? "Valider et renoncer à ces remarques" : "Confirmer la validation"}
            </Button>
          </>
        }
      >
        {quotesToDecide.length > 0 && (
          <ul className="grid gap-2" aria-label="Propositions en attente de votre décision">
            {quotesToDecide.map((comment) => {
              const proposal = activeProposalFor(comment.id);
              return (
                <li key={comment.id} className="grid gap-2 rounded-[var(--r-field)] border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="grid gap-0.5">
                    <b className="font-medium">{comment.title ?? comment.message}</b>
                    <span className="text-muted-foreground">
                      {formatProposalAmount(proposal?.amount)} HT · {formatProposalDeadline(proposal?.deadline)}
                    </span>
                  </span>
                  <span className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" aria-label={`Refuser « ${comment.title ?? comment.message} »`} onClick={() => decideProposal(comment.id, "refused")}>
                      Refuser
                    </Button>
                    <Button size="sm" aria-label={`Accepter « ${comment.title ?? comment.message} »`} onClick={() => decideProposal(comment.id, "accepted")}>
                      Accepter
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {remarksToClarify.length > 0 && (
          <div className="grid gap-2 text-sm">
            <p role="note" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-[var(--status-medium-text)]">
              <b>Certaines remarques n’ont pas encore été clarifiées avec l’organisation.</b> En validant, vous y renoncez : elles ne seront pas traitées dans cette version.
            </p>
            <ul className="grid gap-1 text-muted-foreground" aria-label="Remarques auxquelles vous renoncez">
              {remarksToClarify.map((comment) => (
                <li key={comment.id} className="truncate">
                  « {comment.message} »
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
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

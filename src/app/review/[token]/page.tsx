"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

const PdfDocument = dynamic(
  async () => {
    const module = await import("react-pdf");
    module.pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return module.Document;
  },
  { ssr: false },
);
const PdfPage = dynamic(() => import("react-pdf").then((module) => module.Page), {
  ssr: false,
});

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
  type?: "PDF" | "Image";
  fileData?: string;
};

type Reply = {
  id: number;
  author: string;
  initials: string;
  message: string;
  time: string;
};

type ClientComment = {
  id: number;
  deliverableId?: number;
  author: string;
  initials: string;
  time: string;
  message: string;
  location: string;
  decision?: "À traiter" | "Inclus" | "Hors périmètre";
  position?: { x: number; y: number };
  page?: number;
  replies?: Reply[];
};

type ProposalState = "none" | "draft" | "sent";
type ProposalDecision = "none" | "accepted" | "refused";
type ProposalStates = Record<number, ProposalState>;
type ProposalDecisions = Record<number, ProposalDecision>;
type AdaptationRequest = {
  message: string;
  budget?: string;
  deadline?: string;
  requestedAt: string;
};
type AdaptationRequests = Record<number, AdaptationRequest>;
type ProposalVersion = {
  id: number;
  version: number;
  commentId: number;
  description: string;
  amount: string;
  deadline: string;
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
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number } | null>(null);
  const [generalComment, setGeneralComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSent, setCommentSent] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [previewDragging, setPreviewDragging] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const clientPanelRef = useRef<HTMLElement | null>(null);
  const [selectedCommentId, setSelectedCommentId] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [editingReply, setEditingReply] = useState<{ commentId: number; replyId: number } | null>(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [proposalStates, setProposalStates] = useState<ProposalStates>({});
  const [proposalDecisions, setProposalDecisions] = useState<ProposalDecisions>({});
  const [adaptationRequests, setAdaptationRequests] = useState<AdaptationRequests>({});
  const [proposalVersions, setProposalVersions] = useState<ProposalVersions>({});
  const [adaptationCommentId, setAdaptationCommentId] = useState<number | null>(null);
  const [adaptationMessage, setAdaptationMessage] = useState("");
  const [adaptationBudget, setAdaptationBudget] = useState("");
  const [adaptationDeadline, setAdaptationDeadline] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"pending" | "changes-requested" | "approved">("pending");
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [changesRequestOpen, setChangesRequestOpen] = useState(false);
  const [changesRequestMessage, setChangesRequestMessage] = useState("");
  const [stateHydrated, setStateHydrated] = useState(false);
  const [deliverable, setDeliverable] = useState<Deliverable>({
    name: "northstar-landing-v03.pdf",
    version: 3,
    status: "En revue",
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
        if (parsedState.comments) {
          setComments(parsedState.comments);
        }
        if (parsedState.proposalStates) setProposalStates(parsedState.proposalStates);
        if (parsedState.proposalDecisions) setProposalDecisions(parsedState.proposalDecisions);
        if (parsedState.adaptationRequests) setAdaptationRequests(parsedState.adaptationRequests);
        if (parsedState.reviewStatus) setReviewStatus(parsedState.reviewStatus);
        if (parsedState.approvedAt) setApprovedAt(parsedState.approvedAt);
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
      const sharedDeliverables = Array.isArray(parsedState.deliverables)
        ? parsedState.deliverables.map((item, index) =>
            index === 0 && typeof item === "object" && item !== null
              ? {
                  ...(item as Record<string, unknown>),
                  status: reviewStatus === "approved" ? "Approuvée" : (item as Record<string, unknown>).status,
                  locked: reviewStatus === "approved",
                }
              : item,
          )
        : parsedState.deliverables;
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ ...parsedState, comments, proposalStates, proposalDecisions, adaptationRequests, proposalVersions, reviewStatus, approved: reviewStatus === "approved", approvedAt, deliverables: sharedDeliverables }),
      );
    } catch {
      // The access check above remains the source of truth for this view.
    }
  }, [comments, proposalStates, proposalDecisions, adaptationRequests, proposalVersions, reviewStatus, approvedAt, loading, accessState]);

  useEffect(() => {
    function syncReviewStatus(event: StorageEvent) {
      if (event.key !== storageKey || !event.newValue) return;

      try {
        const parsedState = JSON.parse(event.newValue) as {
          reviewStatus?: "pending" | "changes-requested" | "approved";
          approvedAt?: string | null;
          deliverables?: Deliverable[];
        };
        if (parsedState.reviewStatus) setReviewStatus(parsedState.reviewStatus);
        if (parsedState.reviewStatus !== "approved") setApprovedAt(null);
        else if (parsedState.approvedAt) setApprovedAt(parsedState.approvedAt);
        const sharedDeliverable = parsedState.deliverables?.find(
          (candidate) =>
            candidate.id === reviewLink?.deliverableId &&
            candidate.version === reviewLink?.version,
        ) ?? parsedState.deliverables?.[0];
        if (sharedDeliverable) setDeliverable(sharedDeliverable);
      } catch {
        // Ignore malformed external updates.
      }
    }

    window.addEventListener("storage", syncReviewStatus);
    return () => window.removeEventListener("storage", syncReviewStatus);
  }, []);

  useEffect(() => {
    function syncComments(event: StorageEvent) {
      if (event.key !== storageKey || !event.newValue) return;

      try {
        const parsedState = JSON.parse(event.newValue) as {
          comments?: ClientComment[];
        };
        if (parsedState.comments) setComments(parsedState.comments);
      } catch {
        // Ignore malformed external updates.
      }
    }

    window.addEventListener("storage", syncComments);
    return () => window.removeEventListener("storage", syncComments);
  }, []);

  useEffect(() => {
    function syncProposalUpdates(event: StorageEvent) {
      if (event.key !== storageKey || !event.newValue) return;

      try {
        const parsedState = JSON.parse(event.newValue) as {
          proposalStates?: ProposalStates;
          proposalDecisions?: ProposalDecisions;
          adaptationRequests?: AdaptationRequests;
          proposalVersions?: ProposalVersions;
        };
        if (parsedState.proposalStates) setProposalStates(parsedState.proposalStates);
        if (parsedState.proposalDecisions) setProposalDecisions(parsedState.proposalDecisions);
        if (parsedState.adaptationRequests) setAdaptationRequests(parsedState.adaptationRequests);
        else setAdaptationRequests({});
        if (parsedState.proposalVersions) setProposalVersions(parsedState.proposalVersions);
      } catch {
        // Ignore malformed external updates.
      }
    }

    window.addEventListener("storage", syncProposalUpdates);
    return () => window.removeEventListener("storage", syncProposalUpdates);
  }, []);

  function isReadOnlyVersion() {
    return reviewStatus === "approved" || deliverable.locked || deliverable.status === "Approuvée" || deliverable.status === "Remplacée";
  }

  function startComment(event: React.MouseEvent<HTMLDivElement>) {
    if (isReadOnlyVersion()) return;
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = previewZoom / 100;
    const offsetX = (bounds.width - bounds.width * scale) / 2;
    const offsetY = (bounds.height - bounds.height * scale) / 2;
    setCommentDraft({
      x: Math.round(((event.clientX - bounds.left - offsetX) / (bounds.width * scale)) * 100),
      y: Math.round(((event.clientY - bounds.top - offsetY) / (bounds.height * scale)) * 100),
    });
    setGeneralComment(false);
    setCommentText("");
  }

  function trackPreviewPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
    setPreviewDragging(false);
  }

  function trackPreviewPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    if (!start) return;
    pointerMovedRef.current = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5;
    if (pointerMovedRef.current) setPreviewDragging(true);
  }

  function trackPreviewPointerUp() {
    pointerStartRef.current = null;
    setPreviewDragging(false);
  }

  function togglePreviewFullscreen() {
    if (!clientPanelRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void clientPanelRef.current.requestFullscreen();
  }

  function startGeneralComment() {
    if (isReadOnlyVersion()) return;
    setCommentDraft({ x: 0, y: 0 });
    setGeneralComment(true);
    setCommentText("");
  }

  function addComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion()) return;
    const message = commentText.trim();
    if (!commentDraft || !message) return;

    setComments((current) => [
      ...current,
      {
        id: Math.max(...current.map((comment) => comment.id), 0) + 1,
        deliverableId: reviewLink?.deliverableId ?? deliverable.id,
        author: "Claire Martin",
        initials: "CM",
        time: "À l'instant",
        message,
        location: generalComment
          ? "Commentaire général sur le livrable"
          : `Page ${pdfPage} · position ${commentDraft.x}% / ${commentDraft.y}%`,
        page: pdfPage,
        ...(generalComment ? {} : { position: commentDraft }),
      },
    ]);
    setCommentDraft(null);
    setGeneralComment(false);
    setCommentText("");
    setCommentSent(true);
    setSelectedCommentId(Math.max(...comments.map((comment) => comment.id), 0) + 1);
  }

  function addReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion()) return;
    const message = replyText.trim();
    if (replyingTo === null || !message) return;

    const reply: Reply = {
      id: Date.now(),
      author: "Claire Martin",
      initials: "CM",
      message,
      time: "À l'instant",
    };

    setComments((current) => current.map((comment) => (
      comment.id === replyingTo
        ? { ...comment, replies: [...(comment.replies ?? []), reply] }
        : comment
    )));
    setSelectedCommentId(replyingTo);
    setReplyingTo(null);
    setReplyText("");
  }

  function startEditComment(comment: ClientComment) {
    if (isReadOnlyVersion() || comment.initials !== "CM") return;
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.message);
  }

  function saveEditComment(commentId: number) {
    if (isReadOnlyVersion()) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "CM") return;
    const message = editingCommentText.trim();
    if (!message) return;

    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId ? { ...comment, message } : comment,
      ),
    );
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  function deleteComment(commentId: number) {
    if (isReadOnlyVersion()) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "CM") return;
    setComments((current) => {
      const updated = current.filter((comment) => comment.id !== commentId);
      if (selectedCommentId === commentId) {
        setSelectedCommentId(updated.length > 0 ? updated[0].id : null);
      }
      return updated;
    });
  }

  function startEditReply(commentId: number, reply: Reply) {
    if (isReadOnlyVersion() || reply.initials !== "CM") return;
    setEditingReply({ commentId, replyId: reply.id });
    setEditingReplyText(reply.message);
  }

  function saveEditReply(commentId: number, replyId: number) {
    if (isReadOnlyVersion()) return;
    const parent = comments.find((c) => c.id === commentId);
    const target = parent?.replies?.find((r) => r.id === replyId);
    if (target?.initials !== "CM") return;
    const message = editingReplyText.trim();
    if (!message) return;

    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              replies: comment.replies?.map((reply) =>
                reply.id === replyId ? { ...reply, message } : reply,
              ),
            }
          : comment,
      ),
    );
    setEditingReply(null);
    setEditingReplyText("");
  }

  function deleteReply(commentId: number, replyId: number) {
    if (isReadOnlyVersion()) return;
    const parent = comments.find((c) => c.id === commentId);
    const target = parent?.replies?.find((r) => r.id === replyId);
    if (target?.initials !== "CM") return;
    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              replies: comment.replies?.filter((reply) => reply.id !== replyId),
            }
          : comment,
      ),
    );
  }

  function decideProposal(commentId: number, decision: ProposalDecision) {
    if (isReadOnlyVersion()) return;
    setProposalDecisions((current) => ({ ...current, [commentId]: decision }));
    setSelectedCommentId(commentId);
    setProposalVersions((current) => ({
      ...current,
      [commentId]: current[commentId]?.map((proposal) =>
        proposal.status === "sent" && decision !== "none"
          ? { ...proposal, status: decision }
          : proposal,
      ) ?? current[commentId],
    }));
    if (decision !== "none") {
      const label = decision === "accepted" ? "acceptée" : "refusée";
      notifyAgency(
        "proposal.decision",
        `Proposition ${label} par le client`,
        `Le client a ${label} la proposition liée au commentaire #${commentId}`,
        commentId,
      );
    }
  }

  // Direct read-modify-write so the agency sees the event immediately, without waiting for the generic persist effect.
  function notifyAgency(type: string, auditDescription: string, notificationMessage: string, commentId?: number, nextReviewStatus?: "changes-requested" | "approved", nextApprovedAt?: string) {
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
          ...(nextReviewStatus
            ? {
                reviewStatus: nextReviewStatus,
                approved: nextReviewStatus === "approved",
                approvedAt: nextApprovedAt ?? null,
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

  function openAdaptationRequest(commentId: number) {
    if (isReadOnlyVersion()) return;
    setAdaptationCommentId(commentId);
    setAdaptationMessage("");
    setAdaptationBudget("");
    setAdaptationDeadline("");
  }

  function submitAdaptationRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion()) return;
    const message = adaptationMessage.trim();
    if (adaptationCommentId === null || !message) return;

    setAdaptationRequests((current) => ({
      ...current,
      [adaptationCommentId]: {
        message,
        budget: adaptationBudget.trim() || undefined,
        deadline: adaptationDeadline.trim() || undefined,
        requestedAt: new Date().toLocaleString("fr-FR"),
      },
    }));
    notifyAgency(
      "proposal.adaptation-requested",
      `Adaptation demandée par le client sur la proposition #${adaptationCommentId}`,
      `Le client demande une adaptation de la proposition liée au commentaire #${adaptationCommentId}`,
      adaptationCommentId,
    );
    setAdaptationCommentId(null);
    setAdaptationMessage("");
    setAdaptationBudget("");
    setAdaptationDeadline("");
  }

  const selectedComment = comments.find((comment) => comment.id === selectedCommentId);
  const sharedDeliverableId = reviewLink?.deliverableId ?? deliverable.id;
  const sharedComments = comments.filter(
    (comment) => (comment.deliverableId ?? comments[0]?.deliverableId ?? sharedDeliverableId) === sharedDeliverableId,
  );
  const sharedProposalComments = sharedComments.filter(
    (comment) => comment.decision === "Hors périmètre" && proposalStates[comment.id] === "sent",
  );

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
            <h1>Votre avis sur cette version</h1>
            <p>
              Consultez le livrable et partagez vos retours avec l'équipe.
            </p>
          </div>
          <div className="client-version-badge">
            Version {String(deliverable.version).padStart(2, "0")} · {reviewStatus === "approved" ? "Approuvée" : reviewStatus === "changes-requested" ? "Modifications demandées" : deliverable.status}
          </div>
        </div>
        <section className="client-artboard-panel" ref={clientPanelRef}>
          <div className="client-artboard-toolbar">
            <span>{deliverable.name}</span>
            <button className="client-add-comment-tool" onClick={startGeneralComment} disabled={isReadOnlyVersion()}>+ Ajouter un commentaire</button>
            <div className="client-viewer-controls">
              {deliverable.type === "PDF" && (
                <div className="client-page-controls">
                  <button className="client-viewer-button" onClick={() => setPdfPage((page) => Math.max(1, page - 1))} disabled={pdfPage <= 1} aria-label="Page précédente">‹</button>
                  <span>{pdfPage} / {pdfPageCount}</span>
                  <button className="client-viewer-button" onClick={() => setPdfPage((page) => Math.min(pdfPageCount, page + 1))} disabled={pdfPage >= pdfPageCount} aria-label="Page suivante">›</button>
                </div>
              )}
              <button className="client-viewer-button" onClick={() => transformRef.current?.zoomOut(0.1)} disabled={previewZoom <= 50} aria-label="Réduire le zoom">−</button>
              <button className="client-viewer-zoom" onClick={() => transformRef.current?.resetTransform()} aria-label="Réinitialiser le zoom">{previewZoom}%</button>
              <button className="client-viewer-button" onClick={() => transformRef.current?.zoomIn(0.1)} disabled={previewZoom >= 300} aria-label="Augmenter le zoom">+</button>
              <button className="client-viewer-button" onClick={togglePreviewFullscreen} aria-label="Plein écran">⛶</button>
            </div>
            <span>Expire le {reviewLink?.expiresAt}</span>
          </div>
          <div className="client-artboard-wrap">
            <TransformWrapper
              ref={transformRef}
              initialScale={1}
              minScale={0.5}
              maxScale={3}
              centerOnInit
              onTransform={(_, state) => setPreviewZoom(Math.round(state.scale * 100))}
            >
              <TransformComponent wrapperClass={`client-artboard-transform-wrapper ${previewDragging ? "dragging" : ""}`} contentClass="client-artboard-transform-content">
            <div className="client-artboard" onClick={startComment} onPointerDown={trackPreviewPointerDown} onPointerMove={trackPreviewPointerMove} onPointerUp={trackPreviewPointerUp} onPointerCancel={trackPreviewPointerUp}>
              {deliverable.fileData && deliverable.type === "PDF" ? (
                <PdfDocument file={deliverable.fileData} onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)} loading="Chargement du PDF...">
                  <PdfPage pageNumber={pdfPage} width={760} renderTextLayer={false} renderAnnotationLayer={false} />
                </PdfDocument>
              ) : <><div className="mock-nav">
                <b>northstar<span>.</span></b>
                <span>Solutions</span>
                <span>À propos</span>
                <span>Ressources</span>
                <button onClick={(event) => event.stopPropagation()}>Nous contacter →</button>
              </div>
              <div className="mock-hero">
                <div className="hero-copy">
                  <small>CONSTRUIRE MIEUX, ENSEMBLE</small>
                  <h2>
                    Des idées qui<br /><em>avancent.</em>
                  </h2>
                  <p>
                    Nous aidons les équipes ambitieuses à transformer leurs défis complexes en opportunités durables.
                  </p>
                  <button onClick={(event) => event.stopPropagation()}>Découvrir notre approche <span>→</span></button>
                </div>
                <div className="hero-shape">
                  <div className="shape-line line-one" />
                  <div className="shape-line line-two" />
                  <div className="shape-core">N</div>
                </div>
              </div>
              <div className="mock-footer">
                <span>Northstar Studio · 2026</span>
                <span>01 — Introduction</span>
              </div>
              </>}
              {sharedComments.filter((comment) => (!comment.page || comment.page === pdfPage) && comment.position).map((comment) => (
                <button
                  key={comment.id}
                  className={`pin pin-new client-comment-pin ${comment.initials === "AM" ? "agency-pin" : "client-pin"}`}
                  style={{ left: `${comment.position?.x}%`, top: `${comment.position?.y}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedCommentId(comment.id);
                  }}
                  aria-label={`Commentaire ${comment.id}`}
                >
                  {comment.id}
                </button>
              ))}
            </div>
              </TransformComponent>
            </TransformWrapper>
          </div>
        </section>
        <section className="client-comments-panel">
          <div className="client-comments-heading">
            <div>
              <p className="eyebrow">DISCUSSION</p>
              <h2>Retours sur cette version</h2>
            </div>
            <span>{comments.length} commentaire{comments.length > 1 ? "s" : ""}</span>
          </div>
          {comments.length === 0 ? (
            <p className="client-empty-comments">Aucun commentaire pour le moment.</p>
          ) : (
            <div className="client-comments-list">
              {sharedComments.map((comment) => (
                <article
                  className={`client-comment-card ${comment.id === selectedCommentId ? "selected-client-comment" : ""}`}
                  key={comment.id}
                  onClick={() => setSelectedCommentId(comment.id)}
                >
                  <div className="client-comment-top">
                    <span className="avatar light-avatar">{comment.initials}</span>
                    <div><b>{comment.author}</b><small>{comment.time}</small></div>
                    <span className="client-comment-number">#{comment.id}</span>
                  </div>
                  {editingCommentId === comment.id ? (
                    <form
                      className="edit-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveEditComment(comment.id);
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <textarea
                        autoFocus
                        value={editingCommentText}
                        onChange={(event) =>
                          setEditingCommentText(event.target.value)
                        }
                      />
                      <div className="edit-actions">
                        <button
                          type="button"
                          className="action-link"
                          onClick={() => setEditingCommentId(null)}
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="save-button"
                          disabled={!editingCommentText.trim()}
                        >
                          Enregistrer
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p>{comment.message}</p>
                  )}
                  <small className="client-comment-location">⌖ {comment.location}</small>
                  {comment.replies?.map((reply) => (
                    <div className="client-reply" key={reply.id}>
                      <span className="avatar reply-avatar">{reply.initials}</span>
                      <div className="reply-content">
                        <b>{reply.author}</b><small>{reply.time}</small>
                        {editingReply?.commentId === comment.id &&
                        editingReply?.replyId === reply.id ? (
                          <form
                            className="edit-reply-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveEditReply(comment.id, reply.id);
                            }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              autoFocus
                              value={editingReplyText}
                              onChange={(event) =>
                                setEditingReplyText(event.target.value)
                              }
                            />
                            <div className="edit-actions">
                              <button
                                type="button"
                                className="action-link"
                                onClick={() => setEditingReply(null)}
                              >
                                Annuler
                              </button>
                              <button
                                type="submit"
                                className="save-button"
                                disabled={!editingReplyText.trim()}
                              >
                                Enregistrer
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <p>{reply.message}</p>
                            {!isReadOnlyVersion() && reply.initials === "CM" && (
                              <div className="item-inline-actions">
                                <button
                                  className="action-link"
                                  title="Modifier"
                                  aria-label="Modifier la réponse"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startEditReply(comment.id, reply);
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                  </svg>
                                </button>
                                <button
                                  className="action-link delete-link"
                                  title="Supprimer"
                                  aria-label="Supprimer la réponse"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteReply(comment.id, reply.id);
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="comment-actions">
                    {!isReadOnlyVersion() && editingCommentId !== comment.id && comment.initials === "CM" && (
                      <>
                        <button
                          className="action-link"
                          title="Modifier"
                          aria-label="Modifier le commentaire"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditComment(comment);
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                          </svg>
                        </button>
                        <button
                          className="action-link delete-link"
                          title="Supprimer"
                          aria-label="Supprimer le commentaire"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteComment(comment.id);
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </>
                    )}
                    <button
                      className="client-reply-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCommentId(comment.id);
                        setReplyingTo(comment.id);
                        setReplyText("");
                      }}
                      disabled={isReadOnlyVersion()}
                    >
                      Répondre
                    </button>
                  </div>
                  {replyingTo === comment.id && (
                    <form className="client-reply-form" onSubmit={addReply} onClick={(event) => event.stopPropagation()}>
                      <input autoFocus value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Écrire une réponse..." />
                      <button type="submit" disabled={!replyText.trim()}>Envoyer</button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
          {selectedComment && (
            <p className="selected-comment-note">Commentaire sélectionné : {selectedComment.message}</p>
          )}
        </section>
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
                    <small>Demande liée au commentaire #{comment.id} · Version {activeProposalFor(comment.id)?.version ?? 1}</small>
                    <p>{comment.message}</p>
                    <div className="client-proposal-summary"><span>{activeProposalFor(comment.id)?.description ?? "Section témoignages"}</span><b>{activeProposalFor(comment.id)?.amount ?? "850 €"} · {activeProposalFor(comment.id)?.deadline ?? "+ 3 jours"}</b></div>
                  </div>
                  {proposalDecisions[comment.id] === "accepted" ? (
                    <span className="client-proposal-accepted">Acceptée ✓</span>
                  ) : proposalDecisions[comment.id] === "refused" ? (
                    <span className="client-proposal-refused">Refusée</span>
                  ) : adaptationRequests[comment.id] ? (
                    <span className="client-proposal-adaptation">Adaptation demandée</span>
                  ) : (
                    <div className="client-proposal-actions"><button className="client-adapt-action" onClick={() => openAdaptationRequest(comment.id)} disabled={isReadOnlyVersion()}>Demander une adaptation</button><button className="client-refuse-action" onClick={() => decideProposal(comment.id, "refused")} disabled={isReadOnlyVersion()}>Refuser</button><button className="client-accept-action" onClick={() => decideProposal(comment.id, "accepted")} disabled={isReadOnlyVersion()}>Accepter</button></div>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        <div className="client-review-actions">
          <p>{commentSent ? "Votre commentaire a été envoyé à l'équipe." : "Cliquez sur le livrable pour ajouter un commentaire."}</p>
          {reviewStatus === "changes-requested" && (
            <div className="client-status-banner"><span className="status-dot changes-dot" />Modifications demandées · en attente d'une nouvelle version de l'agence</div>
          )}
          <div className="client-action-group">
            <button className="client-secondary-action" onClick={() => setChangesRequestOpen(true)} disabled={isReadOnlyVersion() || reviewStatus === "changes-requested"}>Demander des modifications</button>
            <button className="client-primary-action" onClick={() => setApprovalOpen(true)} disabled={isReadOnlyVersion() || reviewStatus === "changes-requested"}>{reviewStatus === "approved" ? `Version approuvée${approvedAt ? ` · ${approvedAt}` : ""}` : "Approuver cette version"}</button>
          </div>
        </div>
      </section>
      {commentDraft && clientPanelRef.current && createPortal(
        <div className="modal-backdrop" role="presentation">
          <form className="project-modal comment-modal" onSubmit={addComment}>
            <div className="drawer-header">
              <div>
                <div className="eyebrow">NOUVEAU RETOUR</div>
                <h2>Ajouter un commentaire</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setCommentDraft(null)} aria-label="Fermer">×</button>
            </div>
            <p className="drawer-intro">{generalComment ? "Votre retour sera lié au livrable dans son ensemble." : `Votre commentaire sera attaché à la position ${commentDraft.x}% / ${commentDraft.y}% de la page.`}</p>
            <label>Commentaire<textarea autoFocus value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Décrivez la modification souhaitée..." /></label>
            <button className="send-proposal" type="submit" disabled={!commentText.trim()}>Ajouter le commentaire →</button>
          </form>
        </div>,
        clientPanelRef.current,
      )}
      {adaptationCommentId !== null && (
        <div className="modal-backdrop" role="presentation">
          <form className="project-modal comment-modal" onSubmit={submitAdaptationRequest}>
            <div className="drawer-header">
              <div><div className="eyebrow">PROPOSITION COMPLÉMENTAIRE</div><h2>Demander une adaptation</h2></div>
              <button type="button" className="close-button" onClick={() => setAdaptationCommentId(null)} aria-label="Fermer">×</button>
            </div>
            <p className="drawer-intro">L'agence reste responsable du chiffrage. Décrivez votre besoin ou vos contraintes, sans modifier directement le prix.</p>
            <label>Votre demande<textarea autoFocus value={adaptationMessage} onChange={(event) => setAdaptationMessage(event.target.value)} placeholder="Ex. Pouvez-vous proposer une version limitée au formulaire ?" /></label>
            <div className="field-grid"><label>Budget indicatif <input value={adaptationBudget} onChange={(event) => setAdaptationBudget(event.target.value)} placeholder="Facultatif" /></label><label>Délai souhaité <input value={adaptationDeadline} onChange={(event) => setAdaptationDeadline(event.target.value)} placeholder="Facultatif" /></label></div>
            <button className="send-proposal" type="submit" disabled={!adaptationMessage.trim()}>Envoyer la demande →</button>
          </form>
        </div>
      )}
      {changesRequestOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="project-modal comment-modal" onSubmit={submitChangesRequest}>
            <div className="drawer-header">
              <div><div className="eyebrow">RETOUR GLOBAL</div><h2>Demander des modifications</h2></div>
              <button type="button" className="close-button" onClick={() => setChangesRequestOpen(false)} aria-label="Fermer">×</button>
            </div>
            <p className="drawer-intro">Cette version ne sera pas approuvable tant que l'agence n'aura pas soumis une nouvelle version.</p>
            <label>Votre demande<textarea autoFocus value={changesRequestMessage} onChange={(event) => setChangesRequestMessage(event.target.value)} placeholder="Décrivez ce qui doit être revu avant validation..." /></label>
            <button className="send-proposal" type="submit" disabled={!changesRequestMessage.trim()}>Envoyer la demande →</button>
          </form>
        </div>
      )}
      {approvalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="project-modal approval-modal">
            <div className="drawer-header"><div><div className="eyebrow">CONFIRMATION CLIENT</div><h2>Approuver cette version ?</h2></div><button type="button" className="close-button" onClick={() => setApprovalOpen(false)} aria-label="Fermer">×</button></div>
            <p className="drawer-intro">Vous confirmez que cette version peut être considérée comme validée par Northstar Studio.</p>
            <div className="approval-actions"><button className="changes-button" onClick={() => setApprovalOpen(false)}>Annuler</button><button className="approve-button" onClick={confirmApproval}>Confirmer l'approbation</button></div>
          </section>
        </div>
      )}
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

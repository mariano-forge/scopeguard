"use client";


function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

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

type Decision = "À traiter" | "Inclus" | "Hors périmètre";

type Reply = {
  id: number;
  author: string;
  initials: string;
  message: string;
  time: string;
};

type Comment = {
  id: number;
  deliverableId?: number;
  author: string;
  initials: string;
  time: string;
  message: string;
  location: string;
  decision: Decision;
  page?: number;
  position?: { x: number; y: number };
  replies?: Reply[];
};

type ProposalState = "none" | "draft" | "sent";

type Project = {
  id: number;
  name: string;
  clientId?: number;
  client: string;
  status: "Brouillon" | "En cours";
};

type Client = {
  id: number;
  name: string;
  email: string;
};

type Deliverable = {
  id: number;
  projectId?: number;
  name: string;
  type: "PDF" | "Image";
  size: number;
  version: number;
  status: "Brouillon" | "En revue" | "Approuvée" | "Remplacée";
  importedAt: string;
  locked: boolean;
  fileData?: string;
};

type ReviewLink = {
  token: string;
  active: boolean;
  expiresAt: string;
  autoExpire?: boolean;
  deliverableId?: number;
  version?: number;
};
type ReviewLinks = Record<string, ReviewLink>;

type ReviewStatus = "pending" | "changes-requested" | "approved";
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
type CommentFilter = "all" | "pending" | "outside" | "resolved";
type ImportMode = "version" | "deliverable";
type Notification = {
  id: number;
  message: string;
  time: string;
};
type AuditEvent = {
  id: number;
  type: string;
  actor: string;
  description: string;
  timestamp: string;
  commentId?: number;
};

const storageKey = "scopeguard-review-state";

const initialProjects: Project[] = [
  {
    id: 1,
    name: "Refonte site Northstar",
    client: "Northstar Studio",
    clientId: 1,
    status: "En cours",
  },
];

const initialClients: Client[] = [
  { id: 1, name: "Northstar Studio", email: "claire@northstar.studio" },
];

const initialDeliverables: Deliverable[] = [
  {
    id: 1,
    projectId: 1,
    name: "northstar-landing-v03.pdf",
    type: "PDF",
    size: 2_400_000,
    version: 3,
    status: "En revue",
    importedAt: "Aujourd'hui à 14:32",
    locked: false,
  },
];

const initialComments: Comment[] = [];

const decisionStyles: Record<Decision, string> = {
  "À traiter": "decision-pending",
  Inclus: "decision-included",
  "Hors périmètre": "decision-outside",
};

export default function Home() {
  const [projects, setProjects] = useState(initialProjects);
  const [clients, setClients] = useState(initialClients);
  const [selectedProjectId, setSelectedProjectId] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState(1);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState(1);
  const [sidebarMenu, setSidebarMenu] = useState<"projects" | "clients" | null>(null);
  const [deliverables, setDeliverables] = useState(initialDeliverables);
  const [comments, setComments] = useState(initialComments);
  const [selectedId, setSelectedId] = useState(1);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("pending");
  const [proposalStates, setProposalStates] = useState<ProposalStates>({});
  const [proposalDecisions, setProposalDecisions] = useState<ProposalDecisions>(
    {},
  );
  const [adaptationRequests, setAdaptationRequests] = useState<AdaptationRequests>({});
  const [proposalVersions, setProposalVersions] = useState<ProposalVersions>({});
  const [newProposalVersionOpen, setNewProposalVersionOpen] = useState(false);
  const [newProposalDescription, setNewProposalDescription] = useState("");
  const [newProposalAmount, setNewProposalAmount] = useState("");
  const [newProposalDeadline, setNewProposalDeadline] = useState("");
  const [proposalCommentId, setProposalCommentId] = useState<number | null>(
    null,
  );
  const [refusalOpen, setRefusalOpen] = useState(false);
  const [refusalMessage, setRefusalMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [projectError, setProjectError] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState("");
  const [clientError, setClientError] = useState("");
  const [deliverableError, setDeliverableError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ file: File; type: "PDF" | "Image" } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"PDF" | "Image" | null>(null);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(1);
  const [previewDragging, setPreviewDragging] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const previewPanelRef = useRef<HTMLElement | null>(null);
  const [reviewLink, setReviewLink] = useState<ReviewLink | null>(null);
  const [reviewLinks, setReviewLinks] = useState<ReviewLinks>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [commentDraft, setCommentDraft] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [editingReply, setEditingReply] = useState<{ commentId: number; replyId: number } | null>(null);
  const [editingReplyText, setEditingReplyText] = useState("");
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesMessage, setChangesMessage] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const [lastReminderAt, setLastReminderAt] = useState<number | null>(null);
  const [stateHydrated, setStateHydrated] = useState(false);

  useEffect(() => {
    const savedState = window.localStorage.getItem(storageKey);

    if (!savedState) {
      setStateHydrated(true);
      return;
    }

    try {
      const parsedState = JSON.parse(savedState) as {
        projects?: Project[];
        clients?: Client[];
        selectedProjectId?: number;
        selectedClientId?: number;
        selectedDeliverableId?: number;
        deliverables?: Deliverable[];
        reviewLink?: ReviewLink | null;
        reviewLinks?: ReviewLinks;
        reviewStatus?: ReviewStatus;
        approvedAt?: string | null;
        notifications?: Notification[];
        comments?: Comment[];
        approved?: boolean;
        proposalStates?: ProposalStates;
        proposalDecisions?: ProposalDecisions;
        adaptationRequests?: AdaptationRequests;
        proposalVersions?: ProposalVersions;
        lastReminderAt?: number | null;
        auditEvents?: AuditEvent[];
      };

      if (parsedState.projects)
        setProjects(parsedState.projects.map((project) => ({
          ...project,
          clientId: project.clientId ?? clients.find((client) => client.name === project.client)?.id ?? 1,
        })));
      if (parsedState.clients) setClients(parsedState.clients);
      if (parsedState.selectedProjectId) setSelectedProjectId(parsedState.selectedProjectId);
      if (parsedState.selectedClientId) setSelectedClientId(parsedState.selectedClientId);
      if (parsedState.selectedDeliverableId) setSelectedDeliverableId(parsedState.selectedDeliverableId);
      if (parsedState.deliverables)
        setDeliverables(parsedState.deliverables.map((deliverable) => ({
          ...deliverable,
          projectId: deliverable.projectId ?? 1,
        })));
      const savedReviewLinks = { ...(parsedState.reviewLinks ?? {}) };
      if (parsedState.reviewLink) {
        const legacyKey = `${parsedState.reviewLink.deliverableId ?? 1}:${parsedState.reviewLink.version ?? 1}`;
        savedReviewLinks[legacyKey] ??= {
          ...parsedState.reviewLink,
          autoExpire: parsedState.reviewLink.autoExpire !== false,
        };
        setReviewLink({ ...parsedState.reviewLink, autoExpire: parsedState.reviewLink.autoExpire !== false });
      }
      setReviewLinks(savedReviewLinks);
      if (parsedState.reviewStatus) setReviewStatus(parsedState.reviewStatus);
      if (parsedState.approvedAt) setApprovedAt(parsedState.approvedAt);
      if (parsedState.notifications)
        setNotifications(parsedState.notifications);
      if (parsedState.comments)
        setComments(parsedState.comments.map((comment) => ({
          ...comment,
          deliverableId: comment.deliverableId ?? parsedState.deliverables?.[0]?.id ?? 1,
        })));
      if (typeof parsedState.approved === "boolean")
        setApproved(parsedState.approved || parsedState.reviewStatus === "approved");
      if (parsedState.proposalStates)
        setProposalStates(parsedState.proposalStates);
      if (parsedState.proposalDecisions)
        setProposalDecisions(parsedState.proposalDecisions);
      if (parsedState.adaptationRequests)
        setAdaptationRequests(parsedState.adaptationRequests);
      if (parsedState.proposalVersions)
        setProposalVersions(parsedState.proposalVersions);
      if (parsedState.lastReminderAt)
        setLastReminderAt(parsedState.lastReminderAt);
      if (parsedState.auditEvents) setAuditEvents(parsedState.auditEvents);
      setStateHydrated(true);
    } catch {
      window.localStorage.removeItem(storageKey);
      setStateHydrated(true);
    }
  }, []);

  useEffect(() => {
    function syncFromStorage(event: StorageEvent) {
      if (event.key !== storageKey || !event.newValue) return;

      try {
        const parsedState = JSON.parse(event.newValue) as {
          comments?: Comment[];
          proposalStates?: ProposalStates;
          proposalDecisions?: ProposalDecisions;
          adaptationRequests?: AdaptationRequests;
          proposalVersions?: ProposalVersions;
          reviewStatus?: ReviewStatus;
          approved?: boolean;
          approvedAt?: string | null;
          deliverables?: Deliverable[];
          reviewLink?: ReviewLink | null;
          reviewLinks?: ReviewLinks;
          auditEvents?: AuditEvent[];
          notifications?: Notification[];
        };
        if (parsedState.comments)
          setComments(parsedState.comments.map((comment) => ({
            ...comment,
            deliverableId: comment.deliverableId ?? deliverables[0]?.id ?? 1,
          })));
        if (parsedState.proposalStates)
          setProposalStates(parsedState.proposalStates);
        if (parsedState.proposalDecisions)
          setProposalDecisions(parsedState.proposalDecisions);
        if (parsedState.adaptationRequests)
          setAdaptationRequests(parsedState.adaptationRequests);
        if (parsedState.proposalVersions)
          setProposalVersions(parsedState.proposalVersions);
        if (parsedState.reviewStatus) {
          setReviewStatus(parsedState.reviewStatus);
          if (parsedState.reviewStatus === "changes-requested")
            setApproved(false);
        }
        if (typeof parsedState.approved === "boolean" && parsedState.reviewStatus !== "changes-requested")
          setApproved(parsedState.approved || parsedState.reviewStatus === "approved");
        if (parsedState.approvedAt) setApprovedAt(parsedState.approvedAt);
        if (parsedState.deliverables) setDeliverables(parsedState.deliverables);
        if (parsedState.reviewLinks) setReviewLinks(parsedState.reviewLinks);
        if (parsedState.reviewLink) setReviewLink(parsedState.reviewLink);
        if (parsedState.auditEvents) setAuditEvents(parsedState.auditEvents);
        if (parsedState.notifications) setNotifications(parsedState.notifications);
      } catch {
        // Ignore malformed external updates and keep the current view.
      }
    }

    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  useEffect(() => {
    if (!stateHydrated) return;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        projects,
        clients,
        selectedProjectId,
        selectedClientId,
        selectedDeliverableId,
        deliverables,
        reviewLink,
        reviewLinks,
        reviewStatus,
        comments,
        approved,
        approvedAt,
        proposalStates,
        proposalDecisions,
        adaptationRequests,
        proposalVersions,
        notifications,
        lastReminderAt,
        auditEvents,
      }),
    );
  }, [
    projects,
    clients,
    selectedProjectId,
    selectedClientId,
    selectedDeliverableId,
    deliverables,
    reviewLink,
    reviewLinks,
    reviewStatus,
    comments,
    approved,
    approvedAt,
    proposalStates,
    proposalDecisions,
    adaptationRequests,
    proposalVersions,
    notifications,
    lastReminderAt,
    auditEvents,
  ]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedComment =
    comments.find((comment) => comment.id === selectedId) ?? comments[0];
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
  const visibleProjects = projects.filter(
    (project) => (project.clientId ?? 1) === selectedClientId,
  );
  const activeDeliverables = deliverables.filter(
    (deliverable) => (deliverable.projectId ?? 1) === selectedProjectId,
  );
  const deliverableNames = [...new Set(activeDeliverables.map((deliverable) => deliverable.name))];
  const selectedDeliverableRecord = deliverables.find(
    (deliverable) => deliverable.id === selectedDeliverableId,
  );
  const activeDeliverableName = selectedDeliverableRecord?.name ?? deliverableNames[0];
  const activeVersions = activeDeliverables
    .filter((deliverable) => deliverable.name === activeDeliverableName)
    .sort((left, right) => right.version - left.version);
  const currentDeliverable =
    activeVersions.find((deliverable) => deliverable.id === selectedDeliverableId) ??
    activeVersions[0] ??
    deliverables[0];
  const isReadOnlyVersion = Boolean(
    currentDeliverable?.locked || currentDeliverable?.status === "Approuvée" || currentDeliverable?.status === "Remplacée",
  );
  const activeComments = comments.filter(
    (comment) => (comment.deliverableId ?? deliverables[0]?.id) === currentDeliverable?.id,
  );
  const activeCommentIds = new Set(activeComments.map((comment) => comment.id));
  const activeAuditEvents = auditEvents.filter(
    (event) => event.commentId === undefined || activeCommentIds.has(event.commentId),
  );
  const activeProposalCommentIds = activeComments
    .filter((comment) => comment.decision === "Hors périmètre")
    .map((comment) => comment.id);
  const selectedAdaptationRequest =
    proposalCommentId === null
      ? undefined
      : adaptationRequests[proposalCommentId];
  const resolvedComments = activeComments.filter(
    (comment) =>
      comment.decision === "Inclus" ||
      proposalDecisionFor(comment.id) !== "none",
  );
  const filteredComments =
    commentFilter === "all"
      ? activeComments
      : commentFilter === "pending"
        ? activeComments.filter((comment) => comment.decision === "À traiter")
        : commentFilter === "outside"
          ? activeComments.filter((comment) => comment.decision === "Hors périmètre")
          : resolvedComments;
  const compactComment =
    filteredComments.find((comment) => comment.id === selectedId) ??
    filteredComments[0];
  const visibleComments = showAllComments
    ? filteredComments
    : compactComment
      ? [compactComment]
      : [];
  const reminderBlocked =
    lastReminderAt !== null && Date.now() - lastReminderAt < 24 * 60 * 60 * 1000;

  useEffect(() => {
    if (visibleProjects.length > 0 && !visibleProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(visibleProjects[0].id);
    }
  }, [selectedClientId, visibleProjects, selectedProjectId]);

  useEffect(() => {
    if (activeVersions.length > 0 && !activeVersions.some((deliverable) => deliverable.id === selectedDeliverableId)) {
      setSelectedDeliverableId(activeVersions[0].id);
    }
  }, [activeVersions, selectedDeliverableId, selectedProjectId]);

  useEffect(() => {
    if (!currentDeliverable) return;
    const linkKey = `${currentDeliverable.id}:${currentDeliverable.version}`;
    const linkForVersion = reviewLinks[linkKey];
    const sameVersion =
      reviewLink?.deliverableId === currentDeliverable.id &&
      reviewLink?.version === currentDeliverable.version;
    setReviewLink(linkForVersion ?? null);
    if (!sameVersion) {
      setShareOpen(false);
      setLinkCopied(false);
    }
  }, [currentDeliverable?.id, currentDeliverable?.version, reviewLink?.deliverableId, reviewLink?.version, reviewLinks]);

  useEffect(() => {
    setPdfPage(1);
    setPdfPageCount(1);
  }, [currentDeliverable?.id]);

  function selectDeliverableName(name: string) {
    const latestVersion = activeDeliverables
      .filter((deliverable) => deliverable.name === name)
      .sort((left, right) => right.version - left.version)[0];
    if (latestVersion) setSelectedDeliverableId(latestVersion.id);
  }

  function recordAudit(type: string, description: string, commentId?: number) {
    setAuditEvents((current) => [
      {
        id: Date.now(),
        type,
        actor: "Alex Morgan",
        description,
        timestamp: new Date().toLocaleString("fr-FR"),
        commentId,
      },
      ...current,
    ]);
  }

  function classifyComment(decision: Decision) {
    if (isReadOnlyVersion) return;
    setComments((current) =>
      current.map((comment) =>
        comment.id === selectedId ? { ...comment, decision } : comment,
      ),
    );
    recordAudit("scope.classified", `Demande classée « ${decision} »`, selectedId);
  }

  function selectComment(commentId: number) {
    setSelectedId(commentId);
    setShowAllComments(false);
  }

  function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectName = newProjectName.trim();
    const clientName = newClientName.trim();

    if (!projectName || !clientName) {
      setProjectError("Renseignez le nom du projet et celui du client.");
      return;
    }

    const createdProject = {
      id: Date.now(),
      name: projectName,
      client: clientName,
      clientId: selectedClientId,
      status: "Brouillon" as const,
    };
    setProjects((current) => [
      ...current,
      createdProject,
    ]);
    setSelectedProjectId(createdProject.id);
    setNewProjectName("");
    setNewClientName("");
    setProjectError("");
    setNewProjectOpen(false);
  }

  function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientName = newClientName.trim();
    const clientEmail = newClientEmail.trim();

    if (!clientName || !clientEmail || !clientEmail.includes("@")) {
      setClientError("Renseignez un nom et une adresse e-mail valide.");
      return;
    }

    const createdClient = { id: Date.now(), name: clientName, email: clientEmail };
    setClients((current) => [
      ...current,
      createdClient,
    ]);
    setSelectedClientId(createdClient.id);
    setNewClientName("");
    setNewClientEmail("");
    setClientError("");
    setNewClientOpen(false);
  }

  function importDeliverable(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");

    if (!isPdf && !isImage) {
      setDeliverableError(
        "Format non pris en charge. Choisissez un PDF ou une image.",
      );
      return;
    }

    setPendingImport({ file, type: isPdf ? "PDF" : "Image" });
    setDeliverableError("");
  }

  async function confirmImport(mode: ImportMode) {
    if (!pendingImport) return;
    const { file, type } = pendingImport;
    const fileData = type === "PDF" ? await readFileAsDataUrl(file) : undefined;
    const activeDeliverable = currentDeliverable;
    const sameDeliverableVersions = deliverables.filter(
      (deliverable) => deliverable.projectId === selectedProjectId && deliverable.name === activeDeliverable?.name,
    );
    const nextVersion = mode === "version"
      ? Math.max(...sameDeliverableVersions.map((deliverable) => deliverable.version), 0) + 1
      : 1;
    const importedDeliverable: Deliverable = {
      id: Date.now(),
      projectId: selectedProjectId,
      name: mode === "version" ? activeDeliverable?.name ?? file.name : file.name,
      type,
      size: file.size,
      version: nextVersion,
      status: "Brouillon",
      importedAt: "À l'instant",
      locked: false,
      fileData,
    };

    setApproved(false);
    setApprovedAt(null);
    setReviewStatus("pending");
    setPreviewUrl(URL.createObjectURL(file));
    setPreviewType(type);
    setPdfPage(1);
    setPdfPageCount(1);
    setSelectedDeliverableId(importedDeliverable.id);
    setDeliverables((current) => [
      importedDeliverable,
      ...current.map((deliverable) =>
        mode === "version" &&
        deliverable.projectId === selectedProjectId &&
        deliverable.name === importedDeliverable.name &&
        deliverable.id !== importedDeliverable.id
          ? { ...deliverable, status: "Remplacée" as const, locked: true }
          : deliverable,
      ),
    ]);
    setPendingImport(null);
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function startComment(event: React.MouseEvent<HTMLDivElement>) {
    if (isReadOnlyVersion) return;
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    setCommentDraft({
      x: Math.round(((event.clientX - bounds.left) / bounds.width) * 100),
      y: Math.round(((event.clientY - bounds.top) / bounds.height) * 100),
    });
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
    pointerMovedRef.current =
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5;
    if (pointerMovedRef.current) setPreviewDragging(true);
  }

  function trackPreviewPointerUp() {
    pointerStartRef.current = null;
    setPreviewDragging(false);
  }

  function startCommentAtCenter() {
    if (isReadOnlyVersion) return;
    setCommentDraft({ x: 50, y: 50 });
    setCommentText("");
  }

  function togglePreviewFullscreen() {
    if (!previewPanelRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void previewPanelRef.current.requestFullscreen();
    }
  }

  function addComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion) return;
    const message = commentText.trim();

    if (!commentDraft || !message) return;

    const newComment: Comment = {
      id: Math.max(...comments.map((comment) => comment.id), 0) + 1,
      deliverableId: currentDeliverable.id,
      author: "Alex Morgan",
      initials: "AM",
      time: "À l'instant",
      message,
      location: `Page ${pdfPage} · position ${commentDraft.x}% / ${commentDraft.y}%`,
      decision: "À traiter",
      page: pdfPage,
      position: commentDraft,
    };

    setComments((current) => [...current, newComment]);
    recordAudit("comment.created", "Commentaire agence ajouté", newComment.id);
    setSelectedId(newComment.id);
    setCommentDraft(null);
    setCommentText("");
  }

  function addReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion) return;
    const message = replyText.trim();

    if (!replyingTo || !message) return;

    const reply: Reply = {
      id: Date.now(),
      author: "Alex Morgan",
      initials: "AM",
      message,
      time: "À l'instant",
    };

    setComments((current) =>
      current.map((comment) =>
        comment.id === replyingTo
          ? { ...comment, replies: [...(comment.replies ?? []), reply] }
          : comment,
      ),
    );
    recordAudit("reply.created", "Réponse agence ajoutée", replyingTo);
    setReplyText("");
    setReplyingTo(null);
  }

  function startEditComment(comment: Comment) {
    if (isReadOnlyVersion || comment.initials !== "AM") return;
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.message);
  }

  function saveEditComment(commentId: number) {
    if (isReadOnlyVersion) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "AM") return;
    const message = editingCommentText.trim();
    if (!message) return;

    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId ? { ...comment, message } : comment,
      ),
    );
    recordAudit("comment.edited", "Commentaire agence modifié", commentId);
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  function deleteComment(commentId: number) {
    if (isReadOnlyVersion) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "AM") return;
    setComments((current) => {
      const updated = current.filter((comment) => comment.id !== commentId);
      if (selectedId === commentId && updated.length > 0) {
        setSelectedId(updated[0].id);
      }
      return updated;
    });
    recordAudit("comment.deleted", "Commentaire agence supprimé", commentId);
  }

  function startEditReply(commentId: number, reply: Reply) {
    if (isReadOnlyVersion || reply.initials !== "AM") return;
    setEditingReply({ commentId, replyId: reply.id });
    setEditingReplyText(reply.message);
  }

  function saveEditReply(commentId: number, replyId: number) {
    if (isReadOnlyVersion) return;
    const parent = comments.find((c) => c.id === commentId);
    const target = parent?.replies?.find((r) => r.id === replyId);
    if (target?.initials !== "AM") return;
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
    recordAudit("reply.edited", "Réponse agence modifiée", commentId);
    setEditingReply(null);
    setEditingReplyText("");
  }

  function deleteReply(commentId: number, replyId: number) {
    if (isReadOnlyVersion) return;
    const parent = comments.find((c) => c.id === commentId);
    const target = parent?.replies?.find((r) => r.id === replyId);
    if (target?.initials !== "AM") return;
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
    recordAudit("reply.deleted", "Réponse agence supprimée", commentId);
  }

  function approveVersion() {
    const blockingComments = comments.filter(
      (comment) => comment.decision === "À traiter",
    );

    if (blockingComments.length > 0) {
      setApprovalOpen(true);
      return;
    }

    confirmApproval();
  }

  function confirmApproval() {
    setApproved(true);
    setApprovedAt(new Date().toLocaleString("fr-FR"));
    setReviewStatus("approved");
    setDeliverables((current) =>
      current.map((deliverable, index) =>
        index === 0
          ? { ...deliverable, status: "En revue", locked: true }
          : deliverable,
      ),
    );
    recordAudit("review.approved", "Validation client confirmée");
  }

  function requestChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changesMessage.trim()) return;
    setApproved(false);
    setReviewStatus("changes-requested");
    recordAudit("review.reopened", "Validation rouverte par l’agence");
    setChangesOpen(false);
  }

  function acceptProposal() {
    if (proposalCommentId === null) return;
    setProposalDecisions((current) => ({
      ...current,
      [proposalCommentId]: "accepted",
    }));
    recordAudit("proposal.accepted", "Proposition acceptée", proposalCommentId);
    setProposalOpen(false);
  }

  function refuseProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (proposalCommentId !== null) {
      setProposalDecisions((current) => ({
        ...current,
        [proposalCommentId]: "refused",
      }));
      recordAudit("proposal.refused", "Proposition refusée", proposalCommentId);
    }
    setRefusalOpen(false);
    setProposalOpen(false);
    setRefusalMessage("");
  }

  function openProposal(commentId: number) {
    if (isReadOnlyVersion) return;
    setProposalCommentId(commentId);
    const existingProposal = activeProposalFor(commentId);
    setNewProposalDescription(
      existingProposal?.description ??
        "Conception et intégration d'une section témoignages supplémentaire.",
    );
    setNewProposalAmount(existingProposal?.amount ?? "850 €");
    setNewProposalDeadline(existingProposal?.deadline ?? "+ 3 jours");
    setProposalOpen(true);
  }

  function sendProposal() {
    if (proposalCommentId === null) return;
    if (
      !newProposalDescription.trim() ||
      !newProposalAmount.trim() ||
      !newProposalDeadline.trim()
    )
      return;
    setProposalStates((current) => ({
      ...current,
      [proposalCommentId]: "sent",
    }));
    recordAudit("proposal.sent", "Proposition envoyée au client", proposalCommentId);
    setProposalVersions((current) => ({
      ...current,
      [proposalCommentId]: current[proposalCommentId]?.length
        ? current[proposalCommentId]
        : [{
            id: Date.now(),
            version: 1,
            commentId: proposalCommentId,
            description: newProposalDescription.trim(),
            amount: newProposalAmount.trim(),
            deadline: newProposalDeadline.trim(),
            status: "sent",
            createdAt: new Date().toLocaleString("fr-FR"),
          }],
    }));
    setProposalOpen(false);
  }

  function activeProposalFor(commentId: number) {
    return proposalVersions[commentId]?.find((proposal) => proposal.status === "sent" || proposal.status === "accepted") ?? proposalVersions[commentId]?.at(-1);
  }

  function sendNewProposalVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion) return;
    if (
      proposalCommentId === null ||
      !newProposalDescription.trim() ||
      !newProposalAmount.trim() ||
      !newProposalDeadline.trim()
    ) return;

    const currentHistory = proposalVersions[proposalCommentId] ?? [];
    const nextVersion = Math.max(...currentHistory.map((proposal) => proposal.version), 0) + 1;

    setProposalVersions((current) => {
      const history = current[proposalCommentId] ?? [];
      const supersededHistory = history.map((proposal) =>
        proposal.status === "sent" ? { ...proposal, status: "superseded" as const } : proposal,
      );

      return {
        ...current,
        [proposalCommentId]: [
          ...supersededHistory,
          {
            id: Date.now(),
            version: nextVersion,
            commentId: proposalCommentId,
            description: newProposalDescription.trim(),
            amount: newProposalAmount.trim(),
            deadline: newProposalDeadline.trim(),
            status: "sent",
            createdAt: new Date().toLocaleString("fr-FR"),
          },
        ],
      };
    });
    setProposalStates((current) => ({ ...current, [proposalCommentId]: "sent" }));
    setAdaptationRequests((current) => {
      const next = { ...current };
      delete next[proposalCommentId];
      return next;
    });
    setProposalDecisions((current) => ({ ...current, [proposalCommentId]: "none" }));
    setNewProposalVersionOpen(false);
    setNewProposalDescription("");
    setNewProposalAmount("");
    setNewProposalDeadline("");
    setProposalOpen(false);
    recordAudit("proposal.sent", `Nouvelle proposition v${nextVersion} envoyée`, proposalCommentId);
  }

  function proposalStateFor(commentId: number) {
    return proposalStates[commentId] ?? "none";
  }

  function proposalDecisionFor(commentId: number) {
    return proposalDecisions[commentId] ?? "none";
  }

  function exportProof() {
    const exportWindow = window.open("", "_blank");
    if (!exportWindow || !currentDeliverable) return;

    const status = approved
      ? `Version approuvée${approvedAt ? ` le ${approvedAt}` : ""}`
      : reviewStatus === "changes-requested"
        ? "Modifications demandées"
        : "Validation en cours";
    const commentsHtml = activeComments.length > 0
      ? activeComments.map((comment) => `
          <li>
            <strong>${escapeHtml(comment.decision)}</strong>
            <p>${escapeHtml(comment.message)}</p>
            <small>${escapeHtml(comment.author)} · ${escapeHtml(comment.time)}</small>
          </li>`).join("")
      : "<li>Aucun commentaire sur cette version.</li>";
    const proposalHtml = activeComments
      .filter((comment) => comment.decision === "Hors périmètre" && proposalDecisionFor(comment.id) !== "none")
      .map((comment) => {
        const proposal = activeProposalFor(comment.id);
        return `<li><strong>Commentaire #${comment.id} · ${proposalDecisionFor(comment.id) === "accepted" ? "Acceptée" : "Refusée"}</strong><p>${escapeHtml(proposal?.description ?? "Proposition non détaillée")}</p><small>${escapeHtml(proposal?.amount ?? "-")} · ${escapeHtml(proposal?.deadline ?? "-")}</small></li>`;
      }).join("");
    const auditHtml = activeAuditEvents.slice(0, 50).map((event) => `
      <li><strong>${escapeHtml(event.description)}</strong><small>${escapeHtml(event.actor)} · ${escapeHtml(event.timestamp)}</small></li>`).join("");

    const proofHtml = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Preuve ScopeGuard - ${escapeHtml(currentDeliverable.name)}</title><style>
      body{font-family:Arial,sans-serif;color:#1d2827;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.5}h1{font-size:26px;margin-bottom:4px}h2{font-size:16px;border-bottom:1px solid #dfe4dc;padding-bottom:8px;margin-top:28px}p{margin:4px 0}small{display:block;color:#68756e;margin-top:4px}ul{list-style:none;padding:0}li{border:1px solid #e1e6df;border-radius:5px;padding:12px;margin:8px 0}strong{font-size:12px}header{border-bottom:2px solid #e87e61;padding-bottom:18px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;color:#68756e;font-size:12px}.status{background:#f1f5ed;border-radius:5px;padding:10px;font-weight:bold;margin-top:18px}@media print{body{margin:0}.no-print{display:none}}
    </style></head><body><header><p>PREUVE DE VALIDATION</p><h1>${escapeHtml(selectedProject?.name ?? "Projet")}</h1><div class="meta"><span>Client<br><strong>${escapeHtml(selectedClient?.name ?? "-")}</strong></span><span>Livrable<br><strong>${escapeHtml(currentDeliverable.name)}</strong></span><span>Version<br><strong>V${String(currentDeliverable.version).padStart(2, "0")}</strong></span></div><div class="status">${escapeHtml(status)}</div></header><main><h2>Décisions sur les retours</h2><ul>${commentsHtml}</ul>${proposalHtml ? `<h2>Propositions complémentaires</h2><ul>${proposalHtml}</ul>` : ""}<h2>Journal d'activité</h2><ul>${auditHtml || "<li>Aucun événement enregistré.</li>"}</ul></main><p><small>Identifiant : SG-${currentDeliverable.id}-${currentDeliverable.version}</small></p><button class="no-print" onclick="window.print()">Imprimer ou enregistrer en PDF</button></body></html>`;
    const parsedDocument = new DOMParser().parseFromString(proofHtml, "text/html");
    const importedDocument = exportWindow.document.importNode(
      parsedDocument.documentElement,
      true,
    );
    exportWindow.document.documentElement.replaceWith(importedDocument);
    exportWindow.focus();
  }

  function openShareDialog() {
    const linkKey = `${currentDeliverable.id}:${currentDeliverable.version}`;
    const existingLink = reviewLinks[linkKey];

    if (!existingLink || !existingLink.active) {
      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toLocaleDateString("fr-FR");
      const newLink = {
        token,
        active: true,
        expiresAt,
        autoExpire: true,
        deliverableId: currentDeliverable.id,
        version: currentDeliverable.version,
      };
      setReviewLinks((current) => ({ ...current, [linkKey]: newLink }));
      setReviewLink(newLink);
    } else {
      setReviewLink(existingLink);
    }
    setLinkCopied(false);
    setShareOpen(true);
  }

  function updateAutoExpire(autoExpire: boolean) {
    if (!reviewLink) return;
    const linkKey = `${reviewLink.deliverableId ?? 1}:${reviewLink.version ?? 1}`;
    const updatedLink = { ...reviewLink, autoExpire };
    setReviewLink(updatedLink);
    setReviewLinks((current) => ({ ...current, [linkKey]: updatedLink }));
  }

  function getReviewUrl() {
    return `${window.location.origin}/review/${reviewLink?.token ?? ""}`;
  }

  async function copyReviewLink() {
    if (!reviewLink?.active) return;
    await navigator.clipboard.writeText(getReviewUrl());
    setLinkCopied(true);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>scopeguard</span>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-dot">N</span>
          <select className="workspace-select" value={selectedClientId} onChange={(event) => setSelectedClientId(Number(event.target.value))} aria-label="Sélectionner un client">
            {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
          </select>
          <span className="muted">⌄</span>
        </div>
        <nav className="main-nav" aria-label="Navigation principale">
          <div className="sidebar-menu-group">
            <button className={`nav-item nav-menu-trigger ${sidebarMenu === "projects" ? "active" : ""}`} onClick={() => setSidebarMenu((current) => current === "projects" ? null : "projects")} aria-expanded={sidebarMenu === "projects"}>
              <span>◈</span> Projets <strong>{visibleProjects.length}</strong><i>⌄</i>
            </button>
            {sidebarMenu === "projects" && <div className="sidebar-dropdown">{visibleProjects.map((project) => <button className={`sidebar-dropdown-item ${project.id === selectedProjectId ? "selected" : ""}`} key={project.id} onClick={() => { setSelectedProjectId(project.id); setSidebarMenu(null); }}><span className="dropdown-status" />{project.name}<small>{project.client}</small></button>)}<button className="sidebar-dropdown-action" onClick={() => { setSidebarMenu(null); setNewProjectOpen(true); }}>+ Nouveau projet</button></div>}
          </div>
          <div className="sidebar-menu-group">
            <button className={`nav-item nav-menu-trigger ${sidebarMenu === "clients" ? "active" : ""}`} onClick={() => setSidebarMenu((current) => current === "clients" ? null : "clients")} aria-expanded={sidebarMenu === "clients"}>
              <span>◌</span> Clients <strong>{clients.length}</strong><i>⌄</i>
            </button>
            {sidebarMenu === "clients" && <div className="sidebar-dropdown">{clients.map((client) => <button className={`sidebar-dropdown-item ${client.id === selectedClientId ? "selected" : ""}`} key={client.id} onClick={() => { setSelectedClientId(client.id); setSidebarMenu(null); }}><span className="client-dropdown-avatar">{client.name.charAt(0)}</span>{client.name}<small>{client.email}</small></button>)}<button className="sidebar-dropdown-action" onClick={() => { setSidebarMenu(null); setNewClientOpen(true); }}>+ Nouveau client</button></div>}
          </div>
          <a className="nav-item" href="#equipe">
            <span>♧</span> Équipe
          </a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="#aide">
            <span>?</span> Aide
          </a>
          <div className="profile">
            <span className="avatar dark-avatar">AM</span>
            <span>
              <b>Alex Morgan</b>
              <small>Administrateur</small>
            </span>
            <span className="muted">⋯</span>
          </div>
        </div>
      </aside>

      <section className="workspace" id="projet">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Projets</span>
            <b>/</b>
            <strong>{selectedProject?.name ?? "Aucun projet"}</strong>
          </div>
          <div className="top-actions">
            <button
              className="icon-button notification-trigger"
              aria-label="Notifications"
              onClick={() => setNotificationsOpen((current) => !current)}
            >
              ♧
              {notifications.length > 0 && (
                <span className="notification-count">
                  {notifications.length}
                </span>
              )}
            </button>
            <button
              className="avatar coral-avatar"
              aria-label="Profil Alex Morgan"
            >
              AM
            </button>
          </div>
          {notificationsOpen && (
            <div className="notification-panel">
              <b>Notifications</b>
              {notifications.length === 0 ? (
                <p>Aucune notification pour le moment.</p>
              ) : (
                notifications.slice(0, 5).map((notification) => (
                  <div className="notification-item" key={notification.id}>
                    <span className="notification-dot" />
                    <div>
                      <span>{notification.message}</span>
                      <small>{notification.time}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </header>
        <div className="content">
          <div className="project-heading">
            <div>
              <div className="eyebrow">PROJET · {selectedClient?.name ?? "CLIENT"}</div>
              <div className="project-selector-row"><h1>{selectedProject?.name ?? "Aucun projet sélectionné"}</h1><select className="project-select" value={selectedProjectId} onChange={(event) => setSelectedProjectId(Number(event.target.value))} aria-label="Sélectionner un projet">{visibleProjects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div>
              <div className="deliverable-selectors">
                <select className="deliverable-select" value={activeDeliverableName ?? ""} onChange={(event) => selectDeliverableName(event.target.value)} aria-label="Sélectionner un livrable">
                  {deliverableNames.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
                <select className="version-select" value={currentDeliverable?.id ?? ""} onChange={(event) => setSelectedDeliverableId(Number(event.target.value))} aria-label="Sélectionner une version">
                  {activeVersions.map((deliverable) => <option value={deliverable.id} key={deliverable.id}>Version {String(deliverable.version).padStart(2, "0")}</option>)}
                </select>
              </div>
              <p>
                {currentDeliverable.name} · Version{" "}
                {String(currentDeliverable.version).padStart(2, "0")} ·{" "}
                {currentDeliverable.status === "Brouillon"
                  ? "Importée à l'instant"
                  : "Envoyée en revue il y a 2 h"}
              </p>
            </div>
            <div className="heading-actions">
              <label className="secondary-button file-button">
                Importer un livrable +
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={importDeliverable}
                />
              </label>
              <button
                className="secondary-button"
                onClick={() => setNewClientOpen(true)}
              >
                Nouveau client +
              </button>
              <button
                className="secondary-button"
                onClick={() => setNewProjectOpen(true)}
              >
                Nouveau projet +
              </button>
              <button className="secondary-button" onClick={openShareDialog}>
                Partager la revue ↗
              </button>
            </div>
          </div>
          {deliverableError && (
            <div className="inline-error" role="alert">
              {deliverableError}
            </div>
          )}
          <div className="status-strip">
            <div>
              <span
                className={`status-dot ${reviewStatus === "changes-requested" ? "changes-dot" : approved ? "approved-dot" : ""}`}
              />{" "}
              {reviewStatus === "changes-requested"
                ? "Modifications demandées"
                : approved
                  ? "Version approuvée"
                  : "En attente de validation client"}
            </div>
            <span className="status-divider" />
            <div>
              {activeComments.length} commentaires{" "}
              <span className="strip-muted">·</span>{" "}
              {
                comments.filter(
                  (comment) => comment.decision === "Hors périmètre",
                ).length
              }{" "}
              hors périmètre
            </div>
            <div className="strip-spacer" />
            <span className="due-label">Échéance</span>
            <b>24 sept. 2026</b>
          </div>

          <div className="review-layout">
            <section className="preview-panel" ref={previewPanelRef}>
              <div className="panel-toolbar">
                <div className="toolbar-left">
                  <button className="tool-button selected">
                    ↖ <span>Commentaires</span>
                  </button>
                  <button
                    className="add-comment-tool"
                    onClick={startCommentAtCenter}
                    disabled={isReadOnlyVersion}
                    title="Ajouter un commentaire"
                    aria-label="Ajouter un commentaire"
                  >
                    + Ajouter un commentaire
                  </button>
                  <button className="tool-button">⊞</button>
                </div>
                <div className="page-counter">
                  {currentDeliverable.type === "PDF" ? (
                    <>
                      <button className="page-button" onClick={() => setPdfPage((page) => Math.max(1, page - 1))} disabled={pdfPage <= 1} aria-label="Page précédente">‹</button>
                      {pdfPage} / {pdfPageCount}
                      <button className="page-button" onClick={() => setPdfPage((page) => Math.min(pdfPageCount, page + 1))} disabled={pdfPage >= pdfPageCount} aria-label="Page suivante">›</button>
                    </>
                  ) : "1 / 1"}
                </div>
                <div className="toolbar-left">
                  <button className="tool-button" onClick={() => transformRef.current?.zoomOut(0.1)} disabled={previewZoom <= 50} title="Réduire le zoom" aria-label="Réduire le zoom">−</button>
                  <button className="zoom" onClick={() => transformRef.current?.resetTransform()} title="Réinitialiser le zoom">{previewZoom}%</button>
                  <button className="tool-button" onClick={() => transformRef.current?.zoomIn(0.1)} disabled={previewZoom >= 300} title="Augmenter le zoom" aria-label="Augmenter le zoom">+</button>
                  <button className="tool-button" onClick={togglePreviewFullscreen} title="Plein écran" aria-label="Plein écran">⛶</button>
                </div>
              </div>
              <div className="artboard-wrap">
                <TransformWrapper
                  ref={transformRef}
                  initialScale={1}
                  minScale={0.5}
                  maxScale={3}
                  centerOnInit
                  onTransform={(_, state) => setPreviewZoom(Math.round(state.scale * 100))}
                >
                  <TransformComponent wrapperClass={`artboard-transform-wrapper ${previewDragging ? "dragging" : ""}`} contentClass="artboard-transform-content">
                    <div className="artboard" onClick={startComment} onPointerDown={trackPreviewPointerDown} onPointerMove={trackPreviewPointerMove} onPointerUp={trackPreviewPointerUp} onPointerCancel={trackPreviewPointerUp}>
                  {previewUrl && previewType === "Image" ? (
                    <img className="real-deliverable-image" src={previewUrl} alt={currentDeliverable.name} />
                  ) : currentDeliverable.fileData && currentDeliverable.type === "PDF" ? (
                    <PdfDocument file={currentDeliverable.fileData} onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)} loading="Chargement du PDF...">
                      <PdfPage pageNumber={pdfPage} width={760} renderTextLayer={false} renderAnnotationLayer={false} />
                    </PdfDocument>
                  ) : previewUrl && previewType === "PDF" ? (
                    <iframe className="real-deliverable-pdf" src={previewUrl} title={currentDeliverable.name} />
                  ) : <><div className="mock-nav">
                    <b>
                      northstar<span>.</span>
                    </b>
                    <span>Solutions</span>
                    <span>À propos</span>
                    <span>Ressources</span>
                    <button onClick={(event) => event.stopPropagation()}>
                      Nous contacter →
                    </button>
                  </div>
                  <div className="mock-hero">
                    <div className="hero-copy">
                      <small>CONSTRUIRE MIEUX, ENSEMBLE</small>
                      <h2>
                        Des idées qui
                        <br />
                        <em>avancent.</em>
                      </h2>
                      <p>
                        Nous aidons les équipes ambitieuses à transformer leurs
                        défis complexes en opportunités durables.
                      </p>
                      <button onClick={(event) => event.stopPropagation()}>
                        Découvrir notre approche <span>→</span>
                      </button>
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
                  {activeComments
                    .filter((comment) => !comment.page || comment.page === pdfPage)
                    .filter((comment) => comment.position)
                    .map((comment) => (
                      <button
                        key={comment.id}
                        className={`pin pin-new ${comment.initials === "AM" ? "agency-pin" : "client-pin"}`}
                        style={{
                          left: `${comment.position?.x}%`,
                          top: `${comment.position?.y}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectComment(comment.id);
                        }}
                      >
                        {comment.id}
                      </button>
                    ))}
                    </div>
                  </TransformComponent>
                </TransformWrapper>
              </div>
              <div className="preview-footer">
                <span>
                  Dernière modification par Alex Morgan, aujourd’hui à 14:32
                </span>
                <button
                  className="text-button"
                  onClick={() => setHistoryOpen(true)}
                >
                  Voir l’historique →
                </button>
              </div>
            </section>

            <aside className="comments-panel">
              <div className="comments-heading">
                <div>
                  <h2>Retours client</h2>
                  <p>
                    {activeComments.length} commentaires ·{" "}
                    {
                      activeComments.filter(
                        (comment) => comment.decision === "À traiter",
                      ).length
                    }{" "}
                    à traiter
                  </p>
                </div>
                <button className="more-button" aria-label="Plus d'options">
                  •••
                </button>
              </div>
              <div className="filter-row">
                <button
                  className={`filter ${commentFilter === "all" ? "active-filter" : ""}`}
                  onClick={() => {
                    setCommentFilter("all");
                    setShowAllComments(false);
                  }}
                >
                  Tous <span>{activeComments.length}</span>
                </button>
                <button
                  className={`filter ${commentFilter === "pending" ? "active-filter" : ""}`}
                  onClick={() => {
                    setCommentFilter("pending");
                    setShowAllComments(false);
                  }}
                >
                  À traiter{" "}
                  <span>
                    {
                        activeComments.filter(
                        (comment) => comment.decision === "À traiter",
                      ).length
                    }
                  </span>
                </button>
                <button
                  className={`filter ${commentFilter === "outside" ? "active-filter" : ""}`}
                  onClick={() => {
                    setCommentFilter("outside");
                    setShowAllComments(false);
                  }}
                >
                  Hors périmètre{" "}
                  <span>
                    {
                      activeComments.filter(
                        (comment) => comment.decision === "Hors périmètre",
                      ).length
                    }
                  </span>
                </button>
                <button
                  className={`filter ${commentFilter === "resolved" ? "active-filter" : ""}`}
                  onClick={() => {
                    setCommentFilter("resolved");
                    setShowAllComments(false);
                  }}
                >
                  Résolus <span>{resolvedComments.length}</span>
                </button>
              </div>
              <div className={`comment-list ${showAllComments ? "expanded-comment-list" : ""}`}>
                {visibleComments.map(
                  (comment) => (
                    <article
                      className={`comment-card ${comment.initials === "AM" ? "agency-comment" : "client-comment"} ${comment.id === selectedId ? "selected-card" : ""}`}
                      key={comment.id}
                      onClick={() => selectComment(comment.id)}
                    >
                      <div className="comment-top">
                      <span className={`avatar light-avatar ${comment.initials === "AM" ? "agency-avatar" : "client-avatar"}`}>
                          {comment.initials}
                        </span>
                        <div>
                          <b>{comment.author}</b>
                          <small>{comment.time}</small>
                        </div>
                        <span className="comment-number">{comment.id}</span>
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
                      <div className="comment-location">
                        ⌖ {comment.location}
                      </div>
                      {comment.replies?.map((reply) => (
                        <div className="reply" key={reply.id}>
                          <span className={`avatar reply-avatar ${reply.initials === "AM" ? "agency-avatar" : "client-avatar"}`}>
                            {reply.initials}
                          </span>
                          <div>
                            <b>{reply.author}</b>
                            <small>{reply.time}</small>
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
                                {!isReadOnlyVersion && reply.initials === "AM" && (
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
                      <div className="comment-decision">
                        <span className={`decision-badge ${decisionStyles[comment.decision]}`}>
                          {comment.decision}
                        </span>
                        <div className="comment-actions">
                              {comment.decision === "Hors périmètre" && (proposalDecisionFor(comment.id) === "accepted" ? (
                                <span className="proposal-accepted">Proposition acceptée ✓</span>
                              ) : proposalDecisionFor(comment.id) === "refused" ? (
                                <span className="proposal-refused">Proposition refusée</span>
                              ) : proposalStateFor(comment.id) === "sent" ? (
                                <button className="proposal-link" onClick={(event) => { event.stopPropagation(); openProposal(comment.id); }} disabled={isReadOnlyVersion}>Voir la proposition →</button>
                              ) : (
                                <button className="proposal-link" onClick={(event) => { event.stopPropagation(); openProposal(comment.id); }} disabled={isReadOnlyVersion}>Créer une proposition →</button>
                              ))}
                          {!isReadOnlyVersion && editingCommentId !== comment.id && comment.initials === "AM" && (
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
                            className="reply-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              setReplyingTo(comment.id);
                              setReplyText("");
                            }}
                          >
                            Répondre
                          </button>
                        </div>
                      </div>
                      {replyingTo === comment.id && (
                        <form
                          className="reply-form"
                          onSubmit={addReply}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            autoFocus
                            value={replyText}
                            onChange={(event) =>
                              setReplyText(event.target.value)
                            }
                            placeholder="Écrire une réponse..."
                          />
                          <button type="submit" disabled={!replyText.trim()}>
                            Envoyer
                          </button>
                        </form>
                      )}
                    </article>
                  ),
                )}
              </div>
              {filteredComments.length > 1 && (
                <button
                  className="show-comments-button"
                  onClick={() => setShowAllComments((current) => !current)}
                >
                  {showAllComments
                    ? "Réduire les commentaires ↑"
                    : `Voir les ${filteredComments.length - 1} autres commentaires ↓`}
                </button>
              )}
              <div className="comments-footer">
                <div className={`agency-validation-status ${approved && reviewStatus !== "changes-requested" ? "is-approved" : ""}`}>
                  <span className="status-dot" />
                    {reviewStatus === "changes-requested"
                      ? "Modifications demandées par le client"
                      : approved
                    ? `Version approuvée par le client${approvedAt ? ` · ${approvedAt}` : ""}`
                    : "En attente de validation client"}
                </div>
                <button
                  className="changes-button"
                  onClick={() => {
                    setChangesMessage("");
                    setChangesOpen(true);
                  }}
                >
                  Rouvrir la validation
                </button>
                <button
                  className="proof-button"
                  onClick={() => setProofOpen(true)}
                >
                  Voir la preuve de validation ↗
                </button>
              </div>
            </aside>
          </div>

          {selectedComment && (
            <div className="decision-bar">
              <div>
                <span className="selected-indicator" /> Demande sélectionnée :{" "}
                <b>{selectedComment.message}</b>
              </div>
              <div className="decision-actions">
                <span>Qualifier :</span>
                <button
                  className={
                    selectedComment.decision === "Inclus"
                      ? "active-decision"
                      : ""
                  }
                  onClick={() => classifyComment("Inclus")}
                >
                  Incluse
                </button>
                <button
                  className={
                    selectedComment.decision === "Hors périmètre"
                      ? "active-decision outside"
                      : ""
                  }
                  onClick={() => classifyComment("Hors périmètre")}
                >
                  Hors périmètre
                </button>
                <button
                  className={
                    selectedComment.decision === "À traiter"
                      ? "active-decision"
                      : ""
                  }
                  onClick={() => classifyComment("À traiter")}
                >
                  À clarifier
                </button>
              </div>
            </div>
          )}
          {proposalOpen && (
            <div className="proposal-drawer">
              <div className="drawer-header">
                <div>
                  <div className="eyebrow">DEMANDE HORS PÉRIMÈTRE</div>
                  <h2>
                    {proposalStateFor(proposalCommentId ?? 0) === "sent"
                      ? "Proposition complémentaire"
                      : "Créer une proposition"}
                  </h2>
                </div>
                <button
                  className="close-button"
                  onClick={() => setProposalOpen(false)}
                >
                  ×
                </button>
              </div>
              {proposalStateFor(proposalCommentId ?? 0) === "sent" ? (
                <>
                  <p className="drawer-intro">
                    {selectedAdaptationRequest
                      ? "Le client demande une adaptation. Répondez avec une nouvelle proposition réaliste."
                      : "Le client doit accepter ce montant avant que le studio commence le travail."}
                  </p>
                  {selectedAdaptationRequest && (
                    <div className="adaptation-request-summary">
                      <span>Demande du client · {selectedAdaptationRequest.requestedAt}</span>
                      <p>{selectedAdaptationRequest.message}</p>
                      {(selectedAdaptationRequest.budget || selectedAdaptationRequest.deadline) && (
                        <div>
                          {selectedAdaptationRequest.budget && <b>Budget indicatif : {selectedAdaptationRequest.budget}</b>}
                          {selectedAdaptationRequest.deadline && <b>Délai souhaité : {selectedAdaptationRequest.deadline}</b>}
                        </div>
                      )}
                    </div>
                  )}
                  {activeProposalFor(proposalCommentId ?? 0) && (
                    <p className="proposal-version-label">
                      Version {activeProposalFor(proposalCommentId ?? 0)?.version} · envoyée le {activeProposalFor(proposalCommentId ?? 0)?.createdAt}
                    </p>
                  )}
                  <div className="proposal-summary">
                    <div>
                      <span>Prestation</span>
                      <b>{activeProposalFor(proposalCommentId ?? 0)?.description ?? "Section témoignages"}</b>
                    </div>
                    <div>
                      <span>Montant</span>
                      <b>{activeProposalFor(proposalCommentId ?? 0)?.amount ?? "850 €"}</b>
                    </div>
                    <div>
                      <span>Impact planning</span>
                      <b>{activeProposalFor(proposalCommentId ?? 0)?.deadline ?? "+ 3 jours"}</b>
                    </div>
                  </div>
                  <button className="send-proposal" onClick={acceptProposal}>
                    Accepter la proposition
                  </button>
                  {selectedAdaptationRequest && (
                    <button
                      className="new-version-button"
                      onClick={() => {
                        setNewProposalDescription(activeProposalFor(proposalCommentId ?? 0)?.description ?? "");
                        setNewProposalAmount(activeProposalFor(proposalCommentId ?? 0)?.amount ?? "");
                        setNewProposalDeadline(activeProposalFor(proposalCommentId ?? 0)?.deadline ?? "");
                        setNewProposalVersionOpen(true);
                      }}
                    >
                      Répondre avec une nouvelle proposition
                    </button>
                  )}
                  <button
                    className="refuse-proposal"
                    onClick={() => {
                      setRefusalMessage("");
                      setRefusalOpen(true);
                    }}
                  >
                    Refuser la proposition
                  </button>
                </>
              ) : (
                <>
                  <p className="drawer-intro">
                    Transformez ce retour en accord clair avant de commencer le
                    travail.
                  </p>
                  <label>
                    Description de la prestation
                    <textarea
                      value={newProposalDescription}
                      onChange={(event) => setNewProposalDescription(event.target.value)}
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      Montant
                      <input
                        value={newProposalAmount}
                        onChange={(event) => setNewProposalAmount(event.target.value)}
                      />
                    </label>
                    <label>
                      Impact planning
                      <input
                        value={newProposalDeadline}
                        onChange={(event) => setNewProposalDeadline(event.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    className="send-proposal"
                    onClick={sendProposal}
                    disabled={
                      !newProposalDescription.trim() ||
                      !newProposalAmount.trim() ||
                      !newProposalDeadline.trim()
                    }
                  >
                    Envoyer au client ↗
                  </button>
                </>
              )}
            </div>
          )}
          {activeProposalCommentIds.length > 0 && (
            <div className="proposal-queue">
              <div>
                <b>Demandes hors périmètre</b>
                <small>
                  Une proposition peut être créée pour chaque demande.
                </small>
              </div>
              {activeComments
                .filter((comment) => comment.decision === "Hors périmètre")
                .map((comment) => (
                  <div className="proposal-queue-item" key={comment.id}>
                    <span>
                      #{comment.id} {comment.message}
                    </span>
                    {proposalDecisionFor(comment.id) === "accepted" ? (
                      <span className="proposal-accepted">Acceptée ✓</span>
                    ) : proposalDecisionFor(comment.id) === "refused" ? (
                      <span className="proposal-refused">Refusée</span>
                    ) : (
                      <button
                        className="proposal-link"
                        onClick={() => openProposal(comment.id)}
                      >
                        {proposalStateFor(comment.id) === "sent"
                          ? "Voir la proposition →"
                          : "Créer une proposition →"}
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
          {refusalOpen && (
            <div className="modal-backdrop" role="presentation">
              <form
                className="project-modal comment-modal"
                onSubmit={refuseProposal}
              >
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">DÉCISION CLIENT</div>
                    <h2>Refuser la proposition</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setRefusalOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Le motif est facultatif, mais il aidera l'agence à comprendre
                  votre décision.
                </p>
                <label>
                  Motif du refus
                  <textarea
                    autoFocus
                    value={refusalMessage}
                    onChange={(event) => setRefusalMessage(event.target.value)}
                    placeholder="Ex. Nous préférons reporter cette prestation..."
                  />
                </label>
                <button className="refuse-submit" type="submit">
                  Confirmer le refus
                </button>
              </form>
            </div>
          )}
          {approvalOpen && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal approval-modal">
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">CONFIRMATION REQUISE</div>
                    <h2>Approuver cette version ?</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setApprovalOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  {
                    comments.filter(
                      (comment) => comment.decision === "À traiter",
                    ).length
                  }{" "}
                  demande(s) n'ont pas encore été qualifiée(s). L'approbation
                  verrouillera cette version.
                </p>
                <div className="blocking-list">
                  {comments
                    .filter((comment) => comment.decision === "À traiter")
                    .map((comment) => (
                      <div className="blocking-item" key={comment.id}>
                        <span className="blocking-dot" />
                        <span>{comment.message}</span>
                      </div>
                    ))}
                </div>
                <div className="approval-actions">
                  <button
                    className="changes-button"
                    onClick={() => {
                      setApprovalOpen(false);
                      setShowAllComments(true);
                    }}
                  >
                    Revenir aux retours
                  </button>
                  <button
                    className="approve-button"
                    onClick={() => {
                      setApprovalOpen(false);
                      confirmApproval();
                    }}
                  >
                    Approuver quand même
                  </button>
                </div>
              </section>
            </div>
          )}
          {proofOpen && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal proof-modal">
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">PREUVE DE VALIDATION</div>
                    <h2>Récapitulatif du projet</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setProofOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <button className="proof-export-button" onClick={exportProof}>
                  Exporter la preuve
                </button>
                <div className="proof-header">
                  <div>
                    <span>Projet</span>
                    <b>Refonte site Northstar</b>
                  </div>
                  <div>
                    <span>Client</span>
                    <b>Northstar Studio</b>
                  </div>
                  <div>
                    <span>Version</span>
                    <b>
                      V{String(currentDeliverable.version).padStart(2, "0")}
                    </b>
                  </div>
                </div>
                <div className="proof-status">
                  <span
                    className={`status-dot ${approved ? "approved-dot" : ""}`}
                  />{" "}
                  {approved ? "Version approuvée" : "Validation en cours"}
                  {approvedAt && <small> le {approvedAt}</small>}
                </div>
                <h3>Décisions sur les retours</h3>
                <div className="proof-comments">
                  {comments.map((comment) => (
                    <div className="proof-comment" key={comment.id}>
                      <span
                        className={`decision-badge ${decisionStyles[comment.decision]}`}
                      >
                        {comment.decision}
                      </span>
                      <p>{comment.message}</p>
                    </div>
                  ))}
                </div>
                {activeComments
                  .filter(
                    (comment) =>
                      comment.decision === "Hors périmètre" &&
                      proposalDecisionFor(comment.id) !== "none",
                  )
                  .map((comment) => (
                    <div className="proof-proposal" key={comment.id}>
                      <b>Proposition #{comment.id}</b>
                      <span>
                        {proposalDecisionFor(comment.id) === "accepted"
                          ? `Acceptée · ${activeProposalFor(comment.id)?.amount ?? ""} · ${activeProposalFor(comment.id)?.deadline ?? ""}`
                          : "Refusée par le client"}
                      </span>
                    </div>
                  ))}
                <div className="proof-footer">
                  <span>Validé par Alex Morgan</span>
                  <span>
                    Identifiant : SG-{currentDeliverable.id}-
                    {currentDeliverable.version}
                  </span>
                </div>
              </section>
            </div>
          )}
          {pendingImport && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal import-choice-modal">
                <div className="drawer-header"><div><div className="eyebrow">NOUVEL IMPORT</div><h2>Que souhaitez-vous ajouter ?</h2></div><button type="button" className="close-button" onClick={() => setPendingImport(null)} aria-label="Fermer">×</button></div>
                <p className="drawer-intro">{pendingImport.file.name} est prêt à être ajouté au projet.</p>
                <div className="import-choice-list"><button className="import-choice" onClick={() => confirmImport("version")}><b>Nouvelle version</b><small>Conserver le livrable « {currentDeliverable?.name} » et créer V{(currentDeliverable?.version ?? 0) + 1}.</small></button><button className="import-choice" onClick={() => confirmImport("deliverable")}><b>Nouveau livrable</b><small>Créer un document indépendant en version 01.</small></button></div>
              </section>
            </div>
          )}
          {newProjectOpen && (
            <div className="modal-backdrop" role="presentation">
              <form className="project-modal" onSubmit={createProject}>
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">NOUVEAU PROJET</div>
                    <h2>Créer un projet</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setNewProjectOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Commencez par définir le projet et le client à associer.
                </p>
                <label>
                  Nom du projet
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Ex. Refonte du site vitrine"
                  />
                </label>
                <label>
                  Nom du client
                  <input
                    value={newClientName}
                    onChange={(event) => setNewClientName(event.target.value)}
                    placeholder="Ex. Atelier Horizon"
                  />
                </label>
                {projectError && (
                  <p className="form-error" role="alert">
                    {projectError}
                  </p>
                )}
                <button className="send-proposal" type="submit">
                  Créer le projet →
                </button>
              </form>
            </div>
          )}
          {newClientOpen && (
            <div className="modal-backdrop" role="presentation">
              <form className="project-modal" onSubmit={createClient}>
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">NOUVEAU CLIENT</div>
                    <h2>Ajouter un client</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setNewClientOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Ces informations serviront à rattacher les projets et les
                  validations.
                </p>
                <label>
                  Nom du client
                  <input
                    autoFocus
                    value={newClientName}
                    onChange={(event) => setNewClientName(event.target.value)}
                    placeholder="Ex. Atelier Horizon"
                  />
                </label>
                <label>
                  Adresse e-mail
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(event) => setNewClientEmail(event.target.value)}
                    placeholder="contact@atelier-horizon.fr"
                  />
                </label>
                {clientError && (
                  <p className="form-error" role="alert">
                    {clientError}
                  </p>
                )}
                <button className="send-proposal" type="submit">
                  Ajouter le client →
                </button>
              </form>
            </div>
          )}
          {historyOpen && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal history-modal">
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">HISTORIQUE DU LIVRABLE</div>
                    <h2>Versions</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setHistoryOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Chaque version reste consultable et une version approuvée ne
                  peut plus être modifiée.
                </p>
                <div className="version-list">
                  {deliverables.map((deliverable, index) => (
                    <div
                      className={`version-row ${index === 0 ? "current-version" : ""}`}
                      key={deliverable.id}
                    >
                      <div>
                        <b>
                          Version {String(deliverable.version).padStart(2, "0")}
                        </b>
                        <small>
                          {deliverable.name} · {deliverable.importedAt}
                        </small>
                      </div>
                      <span
                        className={`version-status ${deliverable.locked ? "locked-status" : "draft-status"}`}
                      >
                        {deliverable.locked
                          ? "Verrouillée"
                          : deliverable.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="audit-section">
                  <div className="audit-section-heading"><b>Journal d'activité</b><span>{activeAuditEvents.length} événement{activeAuditEvents.length > 1 ? "s" : ""}</span></div>
                  {activeAuditEvents.length === 0 ? (
                    <p className="audit-empty">Les décisions et actions importantes apparaîtront ici.</p>
                  ) : (
                    <div className="audit-list">{activeAuditEvents.slice(0, 12).map((event) => <div className="audit-event" key={event.id}><span className="audit-dot" /><div><b>{event.description}</b><small>{event.actor} · {event.timestamp}</small></div></div>)}</div>
                  )}
                </div>
              </section>
            </div>
          )}
          {shareOpen && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal share-modal">
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">LIEN DE REVUE CLIENT</div>
                    <h2>Partager la revue</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setShareOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Le client pourra consulter la version actuelle et déposer ses
                  retours depuis ce lien.
                </p>
                {reviewLink?.active ? (
                  <>
                    <label>
                      Lien sécurisé
                      <input
                        className="share-url"
                        readOnly
                        value={getReviewUrl()}
                      />
                    </label>
                    <div className="share-meta">
                      <span>
                        {reviewLink.autoExpire !== false
                          ? `Expire le ${reviewLink.expiresAt}`
                          : "Aucune expiration automatique"}
                      </span>
                      <span className="active-link">
                        <i /> Lien actif
                      </span>
                    </div>
                    <label className="share-expiration-toggle">
                      <input
                        type="checkbox"
                        checked={reviewLink.autoExpire !== false}
                        onChange={(event) => updateAutoExpire(event.target.checked)}
                      />
                      Révoquer automatiquement après 7 jours
                    </label>
                    <button className="send-proposal" onClick={copyReviewLink}>
                      {linkCopied ? "Lien copié ✓" : "Copier le lien"}
                    </button>
                    <button className="notify-button" onClick={notifyClient} disabled={isReadOnlyVersion}>
                      {notificationSent
                        ? "Client notifié ✓"
                        : "Notifier le client par e-mail"}
                    </button>
                    <div className="reminder-row">
                      <button
                        className="reminder-button"
                        onClick={remindClient}
                        disabled={reminderBlocked || isReadOnlyVersion}
                      >
                        {reminderBlocked
                          ? "Relance déjà envoyée"
                          : "Relancer le client"}
                      </button>
                      {lastReminderAt && (
                        <span>
                          Dernière relance : {new Date(lastReminderAt).toLocaleString("fr-FR")}
                        </span>
                      )}
                    </div>
                    <button
                      className="revoke-button"
                      onClick={() => {
                        const revokedLink = { ...reviewLink, active: false };
                        const linkKey = `${reviewLink.deliverableId ?? 1}:${reviewLink.version ?? 1}`;
                        setReviewLink(revokedLink);
                        setReviewLinks((current) => ({ ...current, [linkKey]: revokedLink }));
                        setShareOpen(false);
                      }}
                    >
                      Révoquer ce lien
                    </button>
                  </>
                ) : (
                  <p className="form-error">
                    Ce lien a été révoqué. Fermez cette fenêtre pour en générer
                    un nouveau.
                  </p>
                )}
              </section>
            </div>
          )}
          {commentDraft && previewPanelRef.current && createPortal(
            <div className="modal-backdrop" role="presentation">
              <form
                className="project-modal comment-modal"
                onSubmit={addComment}
              >
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">NOUVEAU RETOUR</div>
                    <h2>Ajouter un commentaire</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setCommentDraft(null)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Votre commentaire sera attaché à la position {commentDraft.x}%
                  / {commentDraft.y}% de la page.
                </p>
                <label>
                  Commentaire
                  <textarea
                    autoFocus
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Décrivez la modification souhaitée..."
                  />
                </label>
                <button
                  className="send-proposal"
                  type="submit"
                  disabled={!commentText.trim()}
                >
                  Ajouter le commentaire →
                </button>
              </form>
            </div>,
            previewPanelRef.current,
          )}
          {changesOpen && (
            <div className="modal-backdrop" role="presentation">
              <form
                className="project-modal comment-modal"
                onSubmit={requestChanges}
              >
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">RETOUR GLOBAL</div>
                    <h2>Rouvrir la validation</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setChangesOpen(false)}
                    aria-label="Fermer"
                  >
                    ×
                  </button>
                </div>
                <p className="drawer-intro">
                  Expliquez au client pourquoi cette validation doit être rouverte.
                </p>
                <label>
                  Message au studio
                  <textarea
                    autoFocus
                    value={changesMessage}
                    onChange={(event) => setChangesMessage(event.target.value)}
                    placeholder="Ex. La hiérarchie du bloc principal doit être revue..."
                  />
                </label>
                <button
                  className="send-proposal"
                  type="submit"
                  disabled={!changesMessage.trim()}
                >
                  Envoyer la demande →
                </button>
              </form>
            </div>
          )}
          {newProposalVersionOpen && (
            <div className="modal-backdrop" role="presentation">
              <form className="project-modal comment-modal" onSubmit={sendNewProposalVersion}>
                <div className="drawer-header">
                  <div><div className="eyebrow">NOUVELLE VERSION</div><h2>Répondre à la demande d'adaptation</h2></div>
                  <button type="button" className="close-button" onClick={() => setNewProposalVersionOpen(false)} aria-label="Fermer">×</button>
                </div>
                <p className="drawer-intro">La proposition actuelle deviendra remplacée. Cette nouvelle version sera la seule proposition active pour le client.</p>
                {selectedAdaptationRequest && <div className="adaptation-request-summary"><span>Demande du client · {selectedAdaptationRequest.requestedAt}</span><p>{selectedAdaptationRequest.message}</p></div>}
                <label>Description de la prestation<textarea autoFocus value={newProposalDescription} onChange={(event) => setNewProposalDescription(event.target.value)} /></label>
                <div className="field-grid"><label>Montant<input value={newProposalAmount} onChange={(event) => setNewProposalAmount(event.target.value)} /></label><label>Impact planning<input value={newProposalDeadline} onChange={(event) => setNewProposalDeadline(event.target.value)} /></label></div>
                <button className="send-proposal" type="submit" disabled={!newProposalDescription.trim() || !newProposalAmount.trim() || !newProposalDeadline.trim()}>Envoyer la nouvelle proposition →</button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
  function notifyClient() {
    if (isReadOnlyVersion) return;
    setNotifications((current) => [
      {
        id: Date.now(),
        message: "Revue envoyée à Claire Martin",
        time: "À l'instant",
      },
      ...current,
    ]);
    setNotificationSent(true);
  }

  function remindClient() {
    if (isReadOnlyVersion) return;
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    if (lastReminderAt && now - lastReminderAt < cooldown) return;

    setLastReminderAt(now);
    setNotifications((current) => [
      {
        id: now,
        message: "Relance envoyée à Claire Martin",
        time: "À l'instant",
      },
      ...current,
    ]);
  }
}

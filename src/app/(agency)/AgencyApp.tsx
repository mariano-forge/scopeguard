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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Crosshair,
  FileText,
  Hourglass,
  House,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Maximize,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Scale,
  RotateCcw,
  ScrollText,
  Share2,
  ShieldCheck,
  FileCheck,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import { BrowserView, type HomeOverview } from "./BrowserView";
import { TabBar, type TabInfo, type TabStatus } from "./TabBar";
import { isAgencyAction, todoOrder, type TodoItem } from "./TodoList";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { HomeSidebar, ProjectSidebar, type PanelMode, type SidebarFavorite, type SidebarLivrable, type SidebarVersion } from "./Sidebars";
import { href, hrefForRecord, livrableIdOf, parseAgencyPath, versionsOfLivrable } from "./routes";
import { DeliverableContent } from "@/components/DeliverableContent";
import { MAX_FILE_BYTES, formatBytes, kindFromFile, type DeliverableType } from "@/components/deliverableKinds";
import { NewDeliverableDialog, type NewDeliverable } from "./NewDeliverableDialog";


type Decision = "À qualifier" | "Inclus" | "Hors périmètre";

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
  type: DeliverableType;
  size: number;
  version: number;
  status: "Brouillon" | "En attente client" | "En revue" | "Approuvée" | "Remplacée";
  importedAt: string;
  locked: boolean;
  fileData?: string;
  /** Web page address (type "Link"). */
  url?: string;
  /** Optional cover image shown on cards instead of the default template. */
  coverData?: string;
  /** Client decision on this version (each version has its own review). */
  reviewStatus?: ReviewStatus;
  approvedAt?: string;
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
type CommentFilter = "all" | "pending" | "outside" | "included" | "refused";
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
/** Deleted items stay restorable this long, then are purged on load. */
const TRASH_DAYS = 30;
const recentsKey = "kora-recent-deliverables";
const tabsKey = "kora-open-tabs";
const maxTabs = 12;
const sidebarKey = "kora-sidebar";
/** Import date stored on a version, e.g. "14 oct. 2026, 10:32". */
const nowLabel = () =>
  new Date().toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const favoritesKey = "kora-favorites";
const mobileQuery = "(max-width: 680px)";
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

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
    status: "En attente client",
    importedAt: "Aujourd'hui à 14:32",
    locked: false,
  },
];

const initialComments: Comment[] = [];

const decisionStyles: Record<string, string> = {
  "À qualifier": "decision-pending",
  "À traiter": "decision-pending",
  Inclus: "decision-included",
  "Hors périmètre": "decision-outside",
};

/** Everything a deletion removed, so it can be restored as it was. */
type TrashSnapshot = {
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  comments: Comment[];
  proposalStates: ProposalStates;
  proposalDecisions: ProposalDecisions;
  proposalVersions: ProposalVersions;
  adaptationRequests: AdaptationRequests;
  reviewLinks: ReviewLinks;
};
export type TrashItem = {
  id: number;
  kind: "space" | "project" | "livrable";
  name: string;
  /** Where it was: space name for a project, "space / project" for a deliverable. */
  origin?: string;
  deletedAt: number;
  data: TrashSnapshot;
};

/**
 * Older saves kept one review status for the whole app. Move it onto the versions:
 * an "Approuvée" version is approved; a pending "changes requested" goes to the shared version.
 */
function migrateReviewStatus(saved: {
  deliverables?: Deliverable[];
  reviewStatus?: ReviewStatus;
  approvedAt?: string | null;
  reviewLink?: ReviewLink | null;
}): Deliverable[] {
  return (saved.deliverables ?? []).map((deliverable) => {
    if (deliverable.reviewStatus) return deliverable;
    if (deliverable.status === "Approuvée")
      return { ...deliverable, reviewStatus: "approved", approvedAt: deliverable.approvedAt ?? saved.approvedAt ?? undefined };
    const shared = saved.reviewLink?.deliverableId === deliverable.id;
    return saved.reviewStatus === "changes-requested" && shared
      ? { ...deliverable, reviewStatus: "changes-requested" }
      : deliverable;
  });
}

export function AgencyApp() {
  const router = useRouter();
  const pathname = usePathname();
  const view = parseAgencyPath(pathname);
  const focusedCommentId = Number(useSearchParams().get("demande")) || null;
  const [projects, setProjects] = useState(initialProjects);
  const [clients, setClients] = useState(initialClients);
  const [deliverables, setDeliverables] = useState(initialDeliverables);
  const [recentLivrableIds, setRecentLivrableIds] = useState<number[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newDeliverableOpen, setNewDeliverableOpen] = useState(false);
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false);
  const [sidebarPanel, setSidebarPanel] = useState<PanelMode | null>("demandes");
  // Last open mode, read by the Ctrl+\ handler (a ref, so the listener never sees a stale value).
  const lastPanelRef = useRef<PanelMode>("demandes");
  /** Starred items, "p:<projectId>" or "l:<livrableId>" (per browser for now). */
  const [favorites, setFavorites] = useState<string[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [openTabs, setOpenTabs] = useState<{ livrableId: number; href: string }[]>([]);

  // Selection comes from the URL (see routes.ts); outside a project the first project is the fallback.
  const viewProjectId = "projectId" in view ? view.projectId : null;
  const selectedProjectId =
    viewProjectId ??
    (view.kind === "client" ? projects.find((project) => (project.clientId ?? 1) === view.clientId)?.id : undefined) ??
    projects[0]?.id ??
    0;
  const selectedClientId =
    view.kind === "client"
      ? view.clientId
      : (projects.find((project) => project.id === selectedProjectId)?.clientId ?? clients[0]?.id ?? 0);
  const viewVersions =
    view.kind === "deliverable" || view.kind === "dashboard" ? versionsOfLivrable(view.livrableId, deliverables) : [];
  const viewRecord =
    view.kind === "dashboard"
      ? viewVersions[0]
      : view.kind === "deliverable"
      ? view.version
        ? viewVersions.find((record) => record.version === view.version)
        : viewVersions[0]
      : undefined;
  const selectedDeliverableId =
    viewRecord?.id ??
    deliverables
      .filter((deliverable) => (deliverable.projectId ?? 1) === selectedProjectId)
      .sort((left, right) => right.version - left.version)[0]?.id ??
    0;
  const activeTab = view.kind === "dashboard" ? "dashboard" : "review";
  const isBrowserView =
    view.kind === "home" ||
    view.kind === "todo" ||
    view.kind === "recents" ||
    view.kind === "shared" ||
    view.kind === "trash" ||
    view.kind === "spaces" || view.kind === "client" || view.kind === "project" || view.kind === "not-found";

  function openRecord(recordId: number) {
    const record = deliverables.find((deliverable) => deliverable.id === recordId);
    if (record) router.push(hrefForRecord(record, deliverables));
  }

  const [comments, setComments] = useState(initialComments);
  const [selectedId, setSelectedId] = useState(1);
  const [proposalOpen, setProposalOpen] = useState(false);
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
  const [proposalPreviewCommentId, setProposalPreviewCommentId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newProjectClientId, setNewProjectClientId] = useState<number | null>(null);
  const [projectError, setProjectError] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState("");
  const [clientError, setClientError] = useState("");
  const [deliverableError, setDeliverableError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ file: File; type: DeliverableType } | null>(null);
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
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesMessage, setChangesMessage] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
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
        trash?: TrashItem[];
      };

      if (parsedState.projects)
        setProjects(parsedState.projects.map((project) => ({
          ...project,
          clientId: project.clientId ?? clients.find((client) => client.name === project.client)?.id ?? 1,
        })));
      if (parsedState.clients) setClients(parsedState.clients);
      if (parsedState.deliverables)
        setDeliverables(migrateReviewStatus(parsedState).map((deliverable) => ({
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
      if (parsedState.notifications)
        setNotifications(parsedState.notifications);
      if (parsedState.comments)
        setComments(parsedState.comments.map((comment) => ({
          ...comment,
          deliverableId: comment.deliverableId ?? parsedState.deliverables?.[0]?.id ?? 1,
          decision: ((comment.decision as string) === "À traiter" ? "À qualifier" : comment.decision) ?? "À qualifier",
        })));
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
      if (parsedState.trash) {
        const limit = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
        setTrash(parsedState.trash.filter((item) => item.deletedAt >= limit));
      }
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
          projects?: Project[];
          clients?: Client[];
          trash?: TrashItem[];
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
            decision: ((comment.decision as string) === "À traiter" ? "À qualifier" : comment.decision) ?? "À qualifier",
          })));
        if (parsedState.proposalStates)
          setProposalStates(parsedState.proposalStates);
        if (parsedState.proposalDecisions)
          setProposalDecisions(parsedState.proposalDecisions);
        if (parsedState.adaptationRequests)
          setAdaptationRequests(parsedState.adaptationRequests);
        if (parsedState.proposalVersions)
          setProposalVersions(parsedState.proposalVersions);
        // Spaces and projects too: a tab left open must not write back an older list and drop another tab’s new project.
        if (parsedState.clients) setClients(parsedState.clients);
        if (parsedState.trash) setTrash(parsedState.trash);
        if (parsedState.projects) setProjects(parsedState.projects);
        if (parsedState.deliverables) setDeliverables(migrateReviewStatus(parsedState));
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

    const newSerialized = JSON.stringify({
      projects,
      clients,
      deliverables,
      reviewLink,
      reviewLinks,
      comments,
      proposalStates,
      proposalDecisions,
      adaptationRequests,
      proposalVersions,
      notifications,
      lastReminderAt,
      auditEvents,
      trash,
    });

    if (window.localStorage.getItem(storageKey) === newSerialized) return;
    try {
      window.localStorage.setItem(storageKey, newSerialized);
    } catch {
      // Browser storage is full (files are kept as data URLs in this prototype).
      setDeliverableError("Le stockage du navigateur est plein : les derniers changements ne seront pas conservés. Retirez des fichiers lourds.");
    }
  }, [
    projects,
    clients,
    deliverables,
    reviewLink,
    reviewLinks,
    comments,
    proposalStates,
    proposalDecisions,
    adaptationRequests,
    proposalVersions,
    notifications,
    lastReminderAt,
    auditEvents,
    trash,
    stateHydrated,
  ]);


  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0];
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
  const reviewStatus: ReviewStatus = currentDeliverable?.reviewStatus ?? "pending";
  const approved = reviewStatus === "approved";
  const approvedAt = currentDeliverable?.approvedAt ?? null;
  const isReadOnlyVersion = Boolean(
    currentDeliverable?.locked || currentDeliverable?.status === "Approuvée" || currentDeliverable?.status === "Remplacée",
  );
  const activeComments = comments.filter(
    (comment) => (comment.deliverableId ?? deliverables[0]?.id) === currentDeliverable?.id,
  );
  const selectedComment =
    activeComments.find((comment) => comment.id === selectedId) ??
    activeComments[0];
  const activeCommentIds = new Set(activeComments.map((comment) => comment.id));
  const activeAuditEvents = auditEvents.filter(
    (event) => event.commentId === undefined || activeCommentIds.has(event.commentId),
  );
  const selectedAdaptationRequest =
    proposalCommentId === null
      ? undefined
      : adaptationRequests[proposalCommentId];
  const previewProposalComment =
    proposalPreviewCommentId === null
      ? undefined
      : activeComments.find((comment) => comment.id === proposalPreviewCommentId);
  const previewProposal =
    proposalPreviewCommentId === null
      ? undefined
      : activeProposalFor(proposalPreviewCommentId);
  const previewAdaptationRequest =
    proposalPreviewCommentId === null
      ? undefined
      : adaptationRequests[proposalPreviewCommentId];
  const activeIncludedComments = activeComments.filter(
    (comment) => comment.decision === "Inclus",
  );
  const activeRefusedComments = activeComments.filter(
    (comment) =>
      comment.decision === "Hors périmètre" &&
      proposalDecisionFor(comment.id) === "refused",
  );
  const filteredComments = (() => {
    const commentsForFilter =
      commentFilter === "all"
        ? [...activeComments].sort((a, b) => b.id - a.id)
        : commentFilter === "pending"
          ? activeComments.filter((comment) => comment.decision === "À qualifier" || !comment.decision)
          : commentFilter === "outside"
            ? activeComments.filter((comment) => comment.decision === "Hors périmètre")
            : commentFilter === "included"
              ? activeIncludedComments
              : activeRefusedComments;
    const selectedCommentIndex = commentsForFilter.findIndex((comment) => comment.id === selectedId);
    if (selectedCommentIndex <= 0) return commentsForFilter;
    return [commentsForFilter[selectedCommentIndex], ...commentsForFilter.slice(0, selectedCommentIndex), ...commentsForFilter.slice(selectedCommentIndex + 1)];
  })();
  const reminderBlocked =
    lastReminderAt !== null && Date.now() - lastReminderAt < 24 * 60 * 60 * 1000;

  // Dashboard figures: every version of the deliverable being looked at.
  const projectDeliverables = viewVersions;
  const projectDeliverableIds = new Set(projectDeliverables.map((d) => d.id));
  const projectComments = comments.filter((comment) =>
    projectDeliverableIds.has(comment.deliverableId ?? deliverables[0]?.id ?? 1),
  );
  const totalProjectDemands = projectComments.length;
  const includedDemands = projectComments.filter((c) => c.decision === "Inclus");
  const outsideDemands = projectComments.filter((c) => c.decision === "Hors périmètre");
  const pendingDemands = projectComments.filter((c) => c.decision === "À qualifier" || !c.decision);

  let totalQuotedEuros = 0;
  let totalAcceptedEuros = 0;
  let totalQuotedDays = 0;
  let totalAcceptedDays = 0;

  outsideDemands.forEach((comment) => {
    const proposal = activeProposalFor(comment.id);
    const decision = proposalDecisionFor(comment.id);
    if (proposal) {
      const numAmount = parseNumericAmount(proposal.amount);
      totalQuotedEuros += numAmount;
      if (decision === "accepted") {
        totalAcceptedEuros += numAmount;
      }

      const numDays = parseNumericDays(proposal.deadline);
      totalQuotedDays += numDays;
      if (decision === "accepted") {
        totalAcceptedDays += numDays;
      }
    }
  });

  const outsideRate =
    totalProjectDemands > 0
      ? Math.round((outsideDemands.length / totalProjectDemands) * 100)
      : 0;
  const acceptedProposalsCount = outsideDemands.filter(
    (c) => proposalDecisionFor(c.id) === "accepted",
  ).length;
  const refusedProposalsCount = outsideDemands.filter(
    (c) => proposalDecisionFor(c.id) === "refused",
  ).length;
  const pendingProposalsCount = outsideDemands.filter(
    (c) =>
      proposalDecisionFor(c.id) === "none" && proposalStateFor(c.id) === "sent",
  ).length;

  // A deliverable URL that no longer matches the data (deleted, wrong project, unknown version)
  // falls back to its project page, or to its latest version when only the version is wrong.
  useEffect(() => {
    if (!stateHydrated || view.kind !== "deliverable") return;
    const root = deliverables.find((deliverable) => deliverable.id === view.livrableId);
    if (!root || (root.projectId ?? 1) !== view.projectId) router.replace(href.project(view.projectId));
    else if (!viewRecord) router.replace(href.deliverable(view.projectId, view.livrableId));
  }, [stateHydrated, view, deliverables, viewRecord, router]);

  // Recently opened deliverables, most recent first (per browser, like Figma's "Recents").
  // Always the deliverable root id (the URL may point at any of its versions), so recents and tabs never list it twice.
  const viewLivrableId = view.kind === "deliverable" && viewRecord ? livrableIdOf(viewRecord, deliverables) : null;
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(recentsKey) ?? "[]");
      if (Array.isArray(saved)) setRecentLivrableIds(saved.filter((value) => typeof value === "number"));
    } catch {
      // Recents are a convenience: ignore unreadable storage.
    }
  }, []);
  useEffect(() => {
    if (viewLivrableId === null) return;
    setRecentLivrableIds((current) => {
      const next = [viewLivrableId, ...current.filter((value) => value !== viewLivrableId)].slice(0, 8);
      try {
        window.localStorage.setItem(recentsKey, JSON.stringify(next));
      } catch {
        // Ignore storage failures (private mode, quota).
      }
      return next;
    });
  }, [viewLivrableId]);

  // Project panel mode (or collapsed) is remembered per browser; Ctrl+\ toggles it like in Figma.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(sidebarKey);
      if (saved === "collapsed") setSidebarPanel(null);
      else if (saved === "livrables" || saved === "demandes") {
        setSidebarPanel(saved);
        lastPanelRef.current = saved;
      }
    } catch {
      // Keep the default panel when storage is unavailable.
    }
  }, []);
  function savePanel(mode: PanelMode | null) {
    try {
      window.localStorage.setItem(sidebarKey, mode ?? "collapsed");
    } catch {
      // Ignore storage failures (private mode, quota).
    }
  }
  function showPanel(mode: PanelMode | null) {
    setSidebarPanel(mode);
    if (mode) lastPanelRef.current = mode;
    savePanel(mode);
  }
  function toggleSidebar() {
    setSidebarPanel((current) => {
      const next = current ? null : lastPanelRef.current;
      savePanel(next);
      return next;
    });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(favoritesKey) ?? "[]");
      if (Array.isArray(saved)) setFavorites(saved.filter((key) => typeof key === "string"));
    } catch {
      // Favorites are a convenience: ignore unreadable storage.
    }
  }, []);
  function toggleFavorite(key: string) {
    setFavorites((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      try {
        window.localStorage.setItem(favoritesKey, JSON.stringify(next));
      } catch {
        // Ignore storage failures (private mode, quota).
      }
      return next;
    });
  }

  // Open tabs (per browser). Opening a deliverable adds its tab; a tab remembers the version last viewed.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(tabsKey) ?? "[]");
      if (Array.isArray(saved))
        setOpenTabs(saved.filter((tab) => typeof tab?.livrableId === "number" && typeof tab?.href === "string"));
    } catch {
      // Tabs are a convenience: ignore unreadable storage.
    }
  }, []);
  function saveTabs(next: { livrableId: number; href: string }[]) {
    try {
      window.localStorage.setItem(tabsKey, JSON.stringify(next));
    } catch {
      // Ignore storage failures (private mode, quota).
    }
    return next;
  }
  useEffect(() => {
    if (viewLivrableId === null) return;
    setOpenTabs((current) =>
      saveTabs(
        current.some((tab) => tab.livrableId === viewLivrableId)
          ? current.map((tab) => (tab.livrableId === viewLivrableId ? { ...tab, href: pathname } : tab))
          : [...current, { livrableId: viewLivrableId, href: pathname }].slice(-maxTabs),
      ),
    );
  }, [viewLivrableId, pathname]);
  function closeTab(livrableId: number) {
    const index = openTabs.findIndex((tab) => tab.livrableId === livrableId);
    const remaining = openTabs.filter((tab) => tab.livrableId !== livrableId);
    setOpenTabs(saveTabs(remaining));
    if (livrableId === viewLivrableId) {
      const neighbour = remaining[index] ?? remaining[index - 1];
      router.push(neighbour ? neighbour.href : href.home());
    }
  }

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

  useEffect(() => {
    if (activeComments.length > 0 && !activeComments.some((c) => c.id === selectedId)) {
      setSelectedId(activeComments[0].id);
    }
  }, [currentDeliverable?.id, activeComments, selectedId]);

  // ?demande=ID (from "À traiter"): select that comment once, then drop the param so clicks work normally.
  useEffect(() => {
    if (focusedCommentId === null || !activeComments.some((comment) => comment.id === focusedCommentId)) return;
    setSelectedId(focusedCommentId);
    router.replace(pathname, { scroll: false });
    requestAnimationFrame(() => document.querySelector(".selected-card")?.scrollIntoView({ block: "nearest" }));
  }, [focusedCommentId, activeComments, pathname, router]);

  function selectDeliverableName(name: string) {
    const latestVersion = activeDeliverables
      .filter((deliverable) => deliverable.name === name)
      .sort((left, right) => right.version - left.version)[0];
    if (latestVersion) openRecord(latestVersion.id);
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
    if (isReadOnlyVersion || !selectedComment || isDecisionLocked(selectedComment.id)) return;
    setComments((current) =>
      current.map((comment) =>
        comment.id === selectedComment.id ? { ...comment, decision } : comment,
      ),
    );
    recordAudit("scope.classified", `Demande classée « ${decision} »`, selectedComment.id);
  }

  function selectComment(commentId: number) {
    setSelectedId(commentId);
  }

  function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectName = newProjectName.trim();
    const projectClient = clients.find((client) => client.id === (newProjectClientId ?? selectedClientId));

    if (!projectName || !projectClient) {
      setProjectError("Renseignez le nom du projet et choisissez un espace.");
      return;
    }

    const createdProject = {
      id: Date.now(),
      name: projectName,
      client: projectClient.name,
      clientId: projectClient.id,
      status: "Brouillon" as const,
    };
    setProjects((current) => [
      ...current,
      createdProject,
    ]);
    router.push(href.project(createdProject.id));
    setNewProjectName("");
    setNewProjectClientId(null);
    setProjectError("");
    setNewProjectOpen(false);
  }

  function createClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clientName = newClientName.trim();
    const clientEmail = newClientEmail.trim();

    if (!clientName) {
      setClientError("Donnez un nom à l’espace.");
      return;
    }
    // Inviting a collaborator is optional; when filled in, the address must look like one.
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      setClientError("Cette adresse e-mail ne semble pas valide.");
      return;
    }

    const createdClient = { id: Date.now(), name: clientName, email: clientEmail };
    setClients((current) => [
      ...current,
      createdClient,
    ]);
    router.push(href.client(createdClient.id));
    setNewClientName("");
    setNewClientEmail("");
    setClientError("");
    setNewClientOpen(false);
  }

  function renameClient(clientId: number, name: string) {
    setClients((current) => current.map((client) => (client.id === clientId ? { ...client, name } : client)));
    // Projects keep a copy of their client name (used by the proof export).
    setProjects((current) => current.map((project) => ((project.clientId ?? 1) === clientId ? { ...project, client: name } : project)));
  }

  /** Takes version records out with their requests, proposals, adaptations and review links; returns what was taken. */
  function takeRecords(recordIds: Set<number>): Omit<TrashSnapshot, "clients" | "projects"> {
    const takenComments = comments.filter((comment) => recordIds.has(comment.deliverableId ?? -1));
    const commentIds = new Set(takenComments.map((comment) => comment.id));
    const pick = <T,>(map: Record<number, T>, keep: boolean) =>
      Object.fromEntries(Object.entries(map).filter(([key]) => commentIds.has(Number(key)) === keep)) as Record<number, T>;
    const pickLinks = (map: ReviewLinks, keep: boolean) =>
      Object.fromEntries(Object.entries(map).filter(([, link]) => recordIds.has(link.deliverableId ?? -1) === keep));
    const taken = {
      deliverables: deliverables.filter((record) => recordIds.has(record.id)),
      comments: takenComments,
      proposalStates: pick(proposalStates, true),
      proposalDecisions: pick(proposalDecisions, true),
      proposalVersions: pick(proposalVersions, true),
      adaptationRequests: pick(adaptationRequests, true),
      reviewLinks: pickLinks(reviewLinks, true),
    };
    setDeliverables((current) => current.filter((record) => !recordIds.has(record.id)));
    setComments((current) => current.filter((comment) => !commentIds.has(comment.id)));
    setProposalStates((current) => pick(current, false));
    setProposalDecisions((current) => pick(current, false));
    setProposalVersions((current) => pick(current, false));
    setAdaptationRequests((current) => pick(current, false));
    setReviewLinks((current) => pickLinks(current, false));
    return taken;
  }

  function putInTrash(kind: TrashItem["kind"], name: string, origin: string | undefined, data: TrashSnapshot) {
    setTrash((current) => [{ id: Date.now(), kind, name, origin, deletedAt: Date.now(), data }, ...current]);
  }

  function deleteProject(projectId: number) {
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const taken = takeRecords(new Set(deliverables.filter((record) => (record.projectId ?? 1) === projectId).map((record) => record.id)));
    setProjects((current) => current.filter((candidate) => candidate.id !== projectId));
    putInTrash("project", project.name, clients.find((client) => client.id === (project.clientId ?? 1))?.name, { ...taken, clients: [], projects: [project] });
    recordAudit("project.deleted", `Projet « ${project.name} » placé dans la corbeille`);
    router.push(href.client(project.clientId ?? 1));
  }

  function deleteClient(clientId: number) {
    const client = clients.find((candidate) => candidate.id === clientId);
    if (!client) return;
    const spaceProjects = projects.filter((project) => (project.clientId ?? 1) === clientId);
    const projectIds = new Set(spaceProjects.map((project) => project.id));
    const taken = takeRecords(new Set(deliverables.filter((record) => projectIds.has(record.projectId ?? 1)).map((record) => record.id)));
    setProjects((current) => current.filter((project) => !projectIds.has(project.id)));
    setClients((current) => current.filter((candidate) => candidate.id !== clientId));
    putInTrash("space", client.name, undefined, { ...taken, clients: [client], projects: spaceProjects });
    recordAudit("space.deleted", `Espace « ${client.name} » placé dans la corbeille`);
    router.push(href.spaces());
  }

  function deleteLivrable(livrableId: number) {
    const versions = versionsOfLivrable(livrableId, deliverables);
    if (!versions[0]) return;
    const project = projects.find((candidate) => candidate.id === (versions[0].projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    const taken = takeRecords(new Set(versions.map((record) => record.id)));
    putInTrash("livrable", versions[0].name, project ? [client?.name, project.name].filter(Boolean).join(" / ") : undefined, { ...taken, clients: [], projects: [] });
  }

  /** Puts everything back as it was (merging by id, so a partial restore never duplicates). */
  function restoreFromTrash(itemId: number) {
    const item = trash.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const merge = <T extends { id: number }>(current: T[], back: T[]) => [...current, ...back.filter((entry) => !current.some((other) => other.id === entry.id))];
    const { data } = item;
    setClients((current) => merge(current, data.clients));
    setProjects((current) => merge(current, data.projects));
    setDeliverables((current) => merge(current, data.deliverables));
    setComments((current) => merge(current, data.comments));
    setProposalStates((current) => ({ ...data.proposalStates, ...current }));
    setProposalDecisions((current) => ({ ...data.proposalDecisions, ...current }));
    setProposalVersions((current) => ({ ...data.proposalVersions, ...current }));
    setAdaptationRequests((current) => ({ ...data.adaptationRequests, ...current }));
    setReviewLinks((current) => ({ ...data.reviewLinks, ...current }));
    setTrash((current) => current.filter((candidate) => candidate.id !== itemId));
    recordAudit("trash.restored", `« ${item.name} » restauré depuis la corbeille`);
  }

  function purgeFromTrash(itemId?: number) {
    setTrash((current) => (itemId === undefined ? [] : current.filter((candidate) => candidate.id !== itemId)));
  }

  function moveProject(projectId: number, clientId: number) {
    const client = clients.find((candidate) => candidate.id === clientId);
    if (!client) return;
    setProjects((current) =>
      current.map((project) => (project.id === projectId ? { ...project, clientId, client: client.name } : project)),
    );
  }

  /** Re-attach a deliverable (every version) to another project; refused if that project has the same name. */
  function moveLivrable(livrableId: number, projectId: number) {
    const versions = versionsOfLivrable(livrableId, deliverables);
    const name = versions[0]?.name;
    if (!name) return false;
    if (deliverables.some((record) => (record.projectId ?? 1) === projectId && record.name === name)) return false;
    const ids = new Set(versions.map((record) => record.id));
    setDeliverables((current) => current.map((record) => (ids.has(record.id) ? { ...record, projectId } : record)));
    return true;
  }


  function renameProject(projectId: number, name: string) {
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, name } : project)));
  }

  function importDeliverable(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const type = kindFromFile(file);
    if (!type) {
      setDeliverableError("Format non pris en charge. Choisissez une image, un PDF, une vidéo ou un document.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDeliverableError(`Fichier trop lourd pour la démo : ${formatBytes(file.size)} (maximum ${formatBytes(MAX_FILE_BYTES)}).`);
      return;
    }

    setPendingImport({ file, type });
    setDeliverableError("");
  }

  /** "Nouveau livrable" dialog: a new deliverable (version 1) in the current project. */
  async function createDeliverable(input: NewDeliverable) {
    const [fileData, coverData] = await Promise.all([
      input.file ? readFileAsDataUrl(input.file) : Promise.resolve(undefined),
      input.cover ? readFileAsDataUrl(input.cover) : Promise.resolve(undefined),
    ]);
    const created: Deliverable = {
      id: Date.now(),
      projectId: selectedProjectId,
      name: input.name,
      type: input.type,
      size: input.file?.size ?? 0,
      version: 1,
      status: "En attente client",
      importedAt: nowLabel(),
      locked: false,
      fileData,
      url: input.url,
      coverData,
    };
    setDeliverables((current) => [created, ...current]);
    setNewDeliverableOpen(false);
    setDeliverableError("");
    router.push(hrefForRecord(created, [created, ...deliverables]));
  }

  async function confirmImport(mode: ImportMode, source = pendingImport) {
    if (!source) return;
    const { file, type } = source;
    const fileData = await readFileAsDataUrl(file);
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
      status: "En attente client",
      importedAt: nowLabel(),
      locked: false,
      fileData,
    };

    setPdfPage(1);
    setPdfPageCount(1);
    router.push(hrefForRecord(importedDeliverable, [importedDeliverable, ...deliverables]));
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
      decision: "À qualifier",
      page: pdfPage,
      position: commentDraft,
    };

    setComments((current) => [...current, newComment]);
    recordAudit("comment.created", "Remarque agence ajoutée", newComment.id);
    setSelectedId(newComment.id);
    setCommentDraft(null);
    setCommentText("");
  }

  function addReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion) return;
    const message = replyText.trim();

    if (!replyingTo || isDecisionLocked(replyingTo) || !message) return;

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
    if (isReadOnlyVersion || isDecisionLocked(comment.id) || comment.initials !== "AM") return;
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.message);
  }

  function saveEditComment(commentId: number) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "AM") return;
    const message = editingCommentText.trim();
    if (!message) return;

    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId ? { ...comment, message } : comment,
      ),
    );
    recordAudit("comment.edited", "Remarque agence modifiée", commentId);
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  function deleteComment(commentId: number) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    const target = comments.find((c) => c.id === commentId);
    if (target?.initials !== "AM") return;
    setComments((current) => {
      const updated = current.filter((comment) => comment.id !== commentId);
      if (selectedId === commentId && updated.length > 0) {
        setSelectedId(updated[0].id);
      }
      return updated;
    });
    recordAudit("comment.deleted", "Remarque agence supprimée", commentId);
  }

  function startEditReply(commentId: number, reply: Reply) {
    if (isReadOnlyVersion || isDecisionLocked(commentId) || reply.initials !== "AM") return;
    setEditingReply({ commentId, replyId: reply.id });
    setEditingReplyText(reply.message);
  }

  function saveEditReply(commentId: number, replyId: number) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
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
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
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
      (comment) => comment.decision === "À qualifier" || !comment.decision,
    );

    if (blockingComments.length > 0) {
      setApprovalOpen(true);
      return;
    }

    confirmApproval();
  }

  function confirmApproval() {
    const approvalTimestamp = new Date().toLocaleString("fr-FR");
    setDeliverables((current) =>
      current.map((deliverable) =>
        deliverable.id === currentDeliverable.id
          ? { ...deliverable, status: "Approuvée", locked: true, reviewStatus: "approved", approvedAt: approvalTimestamp }
          : deliverable,
      ),
    );
    recordAudit("review.approved", "Validation client confirmée");
  }

  function requestChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changesMessage.trim()) return;
    setDeliverables((current) =>
      current.map((deliverable) =>
        deliverable.id === currentDeliverable.id ? { ...deliverable, reviewStatus: "changes-requested" } : deliverable,
      ),
    );
    recordAudit("review.reopened", "Validation rouverte par l’agence");
    setChangesOpen(false);
  }

  function openProposal(commentId: number) {
    if (isReadOnlyVersion) return;
    setProposalCommentId(commentId);
    const existingProposal = activeProposalFor(commentId);
    setNewProposalDescription(
      existingProposal?.description ??
        "Conception et intégration d'une section témoignages supplémentaire.",
    );
    setNewProposalAmount(
      existingProposal
        ? String(parseNumericAmount(existingProposal.amount))
        : "850",
    );
    setNewProposalDeadline(
      existingProposal
        ? String(parseNumericDays(existingProposal.deadline))
        : "3",
    );
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
    const numericAmount = parseNumericAmount(newProposalAmount);
    const numericDays = parseNumericDays(newProposalDeadline);

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
            amount: numericAmount,
            deadline: numericDays,
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

    const numericAmount = parseNumericAmount(newProposalAmount);
    const numericDays = parseNumericDays(newProposalDeadline);
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
            amount: numericAmount,
            deadline: numericDays,
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

  function isDecisionLocked(commentId: number) {
    return proposalDecisionFor(commentId) !== "none" || Boolean(adaptationRequests[commentId]?.decision);
  }

  function decideAdaptation(commentId: number, decision: "accepted" | "refused") {
    if (isReadOnlyVersion || !adaptationRequests[commentId]) return;
    const decisionAt = new Date().toLocaleString("fr-FR");
    setAdaptationRequests((current) => ({
      ...current,
      [commentId]: { ...current[commentId], decision, decisionBy: "Alex Morgan", decisionAt },
    }));
    recordAudit(
      "proposal.adaptation-decision",
      `Demande d'adaptation ${decision === "accepted" ? "acceptée" : "refusée"}`,
      commentId,
    );
  }

  function exportProof() {
    const exportWindow = window.open("", "_blank");
    if (!exportWindow || !currentDeliverable) return;

    const status = approved
      ? `Version approuvée${approvedAt ? ` le ${approvedAt}` : ""}`
      : reviewStatus === "changes-requested"
        ? "Modifications demandées"
        : "En attente client";
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
        const amountDisplay = proposal ? formatProposalAmount(proposal.amount) : "-";
        const deadlineDisplay = proposal ? formatProposalDeadline(proposal.deadline) : "-";
        return `<li><strong>Demande #${comment.id} · ${proposalDecisionFor(comment.id) === "accepted" ? "Acceptée" : "Refusée"}</strong><p>${escapeHtml(proposal?.description ?? "Proposition non détaillée")}</p><small>${escapeHtml(amountDisplay)} · ${escapeHtml(deadlineDisplay)}</small></li>`;
      }).join("");
    const auditHtml = activeAuditEvents.slice(0, 50).map((event) => `
      <li><strong>${escapeHtml(event.description)}</strong><small>${escapeHtml(event.actor)} · ${escapeHtml(event.timestamp)}</small></li>`).join("");

    // Opened in a separate window where tokens.css is not loaded: Kora token values are inlined (ink, border, graphite, action-ui, status-resolved-bg).
    const proofHtml = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Preuve Kora - ${escapeHtml(currentDeliverable.name)}</title><style>
      body{font-family:Arial,sans-serif;color:#111111;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.5}h1{font-size:26px;margin-bottom:4px}h2{font-size:16px;border-bottom:1px solid #ddd9d1;padding-bottom:8px;margin-top:28px}p{margin:4px 0}small{display:block;color:#4c4c48;margin-top:4px}ul{list-style:none;padding:0}li{border:1px solid #ddd9d1;border-radius:5px;padding:12px;margin:8px 0}strong{font-size:12px}header{border-bottom:2px solid #0079d1;padding-bottom:18px}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;color:#4c4c48;font-size:12px}.status{background:#ddf4e4;border-radius:5px;padding:10px;font-weight:bold;margin-top:18px}@media print{body{margin:0}.no-print{display:none}}
    </style></head><body><header><p>PREUVE DE VALIDATION</p><h1>${escapeHtml(selectedProject?.name ?? "Projet")}</h1><div class="meta"><span>Client<br><strong>${escapeHtml(selectedClient?.name ?? "-")}</strong></span><span>Livrable<br><strong>${escapeHtml(currentDeliverable.name)}</strong></span><span>Version<br><strong>V${String(currentDeliverable.version).padStart(2, "0")}</strong></span></div><div class="status">${escapeHtml(status)}</div></header><main><h2>Décisions sur les retours</h2><ul>${commentsHtml}</ul>${proposalHtml ? `<h2>Propositions complémentaires</h2><ul>${proposalHtml}</ul>` : ""}<h2>Journal d'activité</h2><ul>${auditHtml || "<li>Aucun événement enregistré.</li>"}</ul></main><p><small>Identifiant : KR-${currentDeliverable.id}-${currentDeliverable.version}</small></p><button class="no-print" onclick="window.print()">Imprimer ou enregistrer en PDF</button></body></html>`;
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

  // Deliverable status = its latest version: what needs the agency first, then what waits on the client.
  function statusOf(latest: Deliverable): TabStatus {
    const latestComments = comments.filter((comment) => comment.deliverableId === latest.id);
    const toQualify = latestComments.filter((comment) => comment.decision === "À qualifier" || !comment.decision).length;
    const awaitingClient = latestComments.filter(
      (comment) =>
        comment.decision === "Hors périmètre" &&
        proposalStateFor(comment.id) === "sent" &&
        proposalDecisionFor(comment.id) === "none",
    ).length;
    return latest.reviewStatus === "changes-requested"
        ? { kind: "changes-requested" }
        : toQualify > 0
          ? { kind: "to-qualify", count: toQualify }
          : awaitingClient > 0
            ? { kind: "awaiting-client", count: awaitingClient }
            : latest.reviewStatus === "approved"
              ? { kind: "approved" }
              : { kind: "none" };
  }

  const tabInfos: TabInfo[] = openTabs.flatMap((tab) => {
    const latest = versionsOfLivrable(tab.livrableId, deliverables)[0];
    if (!latest) return [];
    const project = projects.find((candidate) => candidate.id === (latest.projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    return [
      {
        livrableId: tab.livrableId,
        href: tab.href,
        name: latest.name,
        type: latest.type,
        context: [client?.name, project?.name].filter(Boolean).join(" / "),
        status: statusOf(latest),
      },
    ];
  });

  // Pending decisions across all projects, on the latest version of each deliverable.
  const todoItems: TodoItem[] = [];
  for (const record of deliverables) {
    const latest = versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0];
    if (latest?.id !== record.id) continue;
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    const version = `V${String(record.version).padStart(2, "0")}`;
    const context = [client?.name, project?.name, `${record.name} ${version}`].filter(Boolean).join(" / ");
    const recordHref = hrefForRecord(record, deliverables);
    if (record.reviewStatus === "changes-requested")
      todoItems.push({ key: `changes-${record.id}`, kind: "changes-requested", title: "Modifications demandées par le client", context, meta: "Préparez une nouvelle version", href: recordHref });
    for (const comment of comments.filter((candidate) => candidate.deliverableId === record.id)) {
      const commentHref = `${recordHref}?demande=${comment.id}`;
      const adaptation = adaptationRequests[comment.id];
      if (comment.decision === "À qualifier" || !comment.decision)
        todoItems.push({ key: `qualify-${comment.id}`, kind: "to-qualify", title: "Demande à qualifier", excerpt: comment.message, context, meta: [comment.author, comment.time].filter(Boolean).join(" · "), href: commentHref });
      else if (comment.decision === "Hors périmètre" && adaptation && !adaptation.decision)
        todoItems.push({ key: `adapt-${comment.id}`, kind: "adaptation", title: "Adaptation de proposition demandée", excerpt: adaptation.message, context, meta: `Demandée le ${adaptation.requestedAt}`, href: commentHref });
      else if (comment.decision === "Hors périmètre" && proposalStateFor(comment.id) === "sent" && proposalDecisionFor(comment.id) === "none") {
        const proposal = activeProposalFor(comment.id);
        todoItems.push({
          key: `awaiting-${comment.id}`,
          kind: "awaiting-client",
          title: "Proposition sans réponse du client",
          excerpt: proposal?.description,
          context,
          meta: [proposal ? formatProposalAmount(proposal.amount) : null, proposal?.createdAt ? `envoyée le ${proposal.createdAt}` : null].filter(Boolean).join(" · "),
          href: commentHref,
        });
      }
    }
  }
  todoItems.sort((left, right) => todoOrder.indexOf(left.kind) - todoOrder.indexOf(right.kind));
  const agencyActionCount = todoItems.filter(isAgencyAction).length;

  // Home overview: figures across every space (proposals count whatever version they were raised on).
  const outsideComments = comments.filter((comment) => comment.decision === "Hors périmètre");
  const sumAmounts = (list: Comment[]) =>
    list.reduce((total, comment) => total + parseNumericAmount(activeProposalFor(comment.id)?.amount), 0);
  const acceptedComments = outsideComments.filter((comment) => proposalDecisionFor(comment.id) === "accepted");
  const pendingComments = outsideComments.filter(
    (comment) => proposalStateFor(comment.id) === "sent" && proposalDecisionFor(comment.id) === "none",
  );
  const latestIds = new Set(
    deliverables
      .filter((record) => versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0]?.id === record.id)
      .map((record) => record.id),
  );
  const latestComments = comments.filter((comment) => latestIds.has(comment.deliverableId ?? -1));
  const qualified = latestComments.filter((comment) => comment.decision && comment.decision !== "À qualifier");
  const projectsOfClient = (clientId: number) => projects.filter((project) => (project.clientId ?? 1) === clientId);
  const overview: HomeOverview = {
    acceptedEuros: sumAmounts(acceptedComments),
    acceptedCount: acceptedComments.length,
    acceptedDays: acceptedComments.reduce((total, comment) => total + parseNumericDays(activeProposalFor(comment.id)?.deadline), 0),
    pendingEuros: sumAmounts(pendingComments),
    pendingCount: pendingComments.length,
    toQualify: latestComments.length - qualified.length,
    outsideRate: qualified.length ? Math.round((qualified.filter((comment) => comment.decision === "Hors périmètre").length / qualified.length) * 100) : null,
    approved: deliverables.filter((record) => latestIds.has(record.id) && record.reviewStatus === "approved").length,
    livrables: latestIds.size,
    spaces: clients.map((client) => {
      const projectIds = new Set(projectsOfClient(client.id).map((project) => project.id));
      const recordIds = new Set(deliverables.filter((record) => projectIds.has(record.projectId ?? 1)).map((record) => record.id));
      const spaceComments = comments.filter((comment) => recordIds.has(comment.deliverableId ?? -1));
      return {
        client,
        projects: projectIds.size,
        livrables: [...latestIds].filter((id) => recordIds.has(id)).length,
        toQualify: latestComments.filter((comment) => recordIds.has(comment.deliverableId ?? -1) && (comment.decision === "À qualifier" || !comment.decision)).length,
        outside: spaceComments.filter((comment) => comment.decision === "Hors périmètre").length,
        acceptedEuros: sumAmounts(acceptedComments.filter((comment) => recordIds.has(comment.deliverableId ?? -1))),
      };
    }),
    activity: auditEvents.slice(0, 5).map((event) => ({ id: event.id, description: event.description, actor: event.actor, timestamp: event.timestamp })),
  };

  // ⌘K palette index: everything reachable, plus a few actions.
  const contextOf = (record: Deliverable) => {
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    return [client?.name, project?.name].filter(Boolean).join(" / ");
  };
  const latestRecords = deliverables.filter(
    (record) => versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0]?.id === record.id,
  );
  const paletteActions: PaletteItem[] = [
    { id: "action-todo", group: "Actions", label: "À traiter", hint: `${agencyActionCount} décision${agencyActionCount > 1 ? "s" : ""} en attente`, href: href.todo(), icon: Inbox },
    { id: "action-home", group: "Actions", label: "Accueil", href: href.home(), icon: House },
    { id: "action-client", group: "Actions", label: "Nouvel espace", run: () => setNewClientOpen(true) },
    { id: "action-project", group: "Actions", label: "Nouveau projet", run: () => setNewProjectOpen(true) },
  ];
  const paletteItems: PaletteItem[] = [
    ...paletteActions,
    ...latestRecords.map((record) => ({
      id: `livrable-${record.id}`,
      group: "Livrables" as const,
      label: record.name,
      hint: `${contextOf(record)} · V${String(record.version).padStart(2, "0")}`,
      href: hrefForRecord(record, deliverables),
    })),
    ...projects.map((project) => ({
      id: `project-${project.id}`,
      group: "Projets" as const,
      label: project.name,
      hint: clients.find((client) => client.id === (project.clientId ?? 1))?.name,
      href: href.project(project.id),
    })),
    ...clients.map((client) => ({ id: `client-${client.id}`, group: "Espaces" as const, label: client.name, hint: client.email, href: href.client(client.id) })),
    ...latestRecords.flatMap((record) =>
      comments
        .filter((comment) => comment.deliverableId === record.id)
        .map((comment) => ({
          id: `comment-${comment.id}`,
          group: "Demandes" as const,
          label: comment.message,
          hint: `#${comment.id} · ${comment.decision} · ${record.name}`,
          href: `${hrefForRecord(record, deliverables)}?demande=${comment.id}`,
        })),
    ),
  ];
  const paletteSuggestions: PaletteItem[] = [
    paletteActions[0],
    ...tabInfos.map((tab) => ({ id: `tab-${tab.livrableId}`, group: "Livrables" as const, label: tab.name, hint: tab.context, href: tab.href })),
    ...paletteActions.slice(2),
  ];

  // Full thread of a request (inspector): message, replies, proposal state, edit/reply actions.
  const renderCommentThread = (comment: Comment) => (
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
            <Crosshair /> {comment.location}
          </div>
          {(expandedReplies[comment.id] ? (comment.replies ?? []) : (comment.replies ?? []).slice(0, 2)).map((reply) => (
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
                    {!isReadOnlyVersion && !isDecisionLocked(comment.id) && reply.initials === "AM" && (
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
                          <Pencil />
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
                          <Trash2 />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {(comment.replies?.length ?? 0) > 2 && (
            <button
              type="button"
              className="replies-toggle"
              onClick={(event) => {
                event.stopPropagation();
                setExpandedReplies((current) => ({ ...current, [comment.id]: !current[comment.id] }));
              }}
            >
              {expandedReplies[comment.id] ? <><ChevronUp /> Réduire les réponses</> : <><ChevronDown /> Afficher les {(comment.replies?.length ?? 0) - 2} autres réponses</>}
            </button>
          )}
          <div className="comment-decision">
            <span className={`decision-badge ${decisionStyles[comment.decision]}`}>
              {comment.decision}
            </span>
            <div className="comment-actions">
                  {comment.decision === "Hors périmètre" && (proposalDecisionFor(comment.id) === "accepted" || adaptationRequests[comment.id]?.decision === "accepted" ? (
                    <span className="proposal-accepted">Proposition acceptée <Check /></span>
                  ) : proposalDecisionFor(comment.id) === "refused" || adaptationRequests[comment.id]?.decision === "refused" ? (
                    <span className="proposal-refused">Proposition refusée</span>
                  ) : proposalStateFor(comment.id) === "sent" ? (
                    <button className="proposal-link" onClick={(event) => { event.stopPropagation(); openProposal(comment.id); }} disabled={isReadOnlyVersion}>Voir la proposition <ArrowRight /></button>
                  ) : (
                    <button className="proposal-link" onClick={(event) => { event.stopPropagation(); openProposal(comment.id); }} disabled={isReadOnlyVersion}>Créer une proposition <ArrowRight /></button>
                  ))}
              {!isReadOnlyVersion && !isDecisionLocked(comment.id) && editingCommentId !== comment.id && comment.initials === "AM" && (
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
                    <Pencil />
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
                    <Trash2 />
                  </button>
                </>
              )}
              {!isDecisionLocked(comment.id) && <button
                className="reply-link"
                onClick={(event) => {
                  event.stopPropagation();
                  setReplyingTo(comment.id);
                  setReplyText("");
                }}
              >
                Répondre
              </button>}
            </div>
          </div>
          {replyingTo === comment.id && !isDecisionLocked(comment.id) && (
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
  );

  const proposalLabel = (comment: Comment) =>
    comment.decision !== "Hors périmètre"
      ? null
      : proposalDecisionFor(comment.id) === "accepted" || adaptationRequests[comment.id]?.decision === "accepted"
        ? "Proposition acceptée"
        : proposalDecisionFor(comment.id) === "refused" || adaptationRequests[comment.id]?.decision === "refused"
          ? "Proposition refusée"
          : adaptationRequests[comment.id] && !adaptationRequests[comment.id].decision
            ? "Adaptation demandée"
            : proposalStateFor(comment.id) === "sent"
              ? "Proposition envoyée"
              : "Proposition à créer";

  // Requests of the open version, in the left panel (and in the inspector on mobile).
  const demandesList =
    view.kind === "deliverable" ? (
      <div className="demandes">
        <div className="filter-row">
          <button
            className={`filter ${commentFilter === "all" ? "active-filter" : ""}`}
            onClick={() => {
              setCommentFilter("all");
            }}
          >
            Toutes <span>{activeComments.length}</span>
          </button>
          <button
            className={`filter ${commentFilter === "pending" ? "active-filter" : ""}`}
            onClick={() => {
              setCommentFilter("pending");
            }}
          >
            À qualifier{" "}
            <span>
              {
                  activeComments.filter(
                  (comment) => comment.decision === "À qualifier" || !comment.decision,
                ).length
              }
            </span>
          </button>
          <button
            className={`filter ${commentFilter === "outside" ? "active-filter" : ""}`}
            onClick={() => {
              setCommentFilter("outside");
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
            className={`filter ${commentFilter === "included" ? "active-filter" : ""}`}
            onClick={() => {
              setCommentFilter("included");
            }}
          >
            Incluses <span>{activeIncludedComments.length}</span>
          </button>
          <button
            className={`filter ${commentFilter === "refused" ? "active-filter" : ""}`}
            onClick={() => {
              setCommentFilter("refused");
            }}
          >
            Refusées <span>{activeRefusedComments.length}</span>
          </button>
        </div>
        {filteredComments.length === 0 ? (
          <p className="panel-empty">
            {activeComments.length === 0 ? "Aucune demande sur cette version." : "Aucune demande pour ce filtre."}
          </p>
        ) : (
          <ul className="demande-list">
            {filteredComments.map((comment) => (
              <li key={comment.id}>
                <button
                  type="button"
                  className={`demande-row ${comment.id === selectedId ? "selected-card" : ""}`}
                  aria-current={comment.id === selectedId ? "true" : undefined}
                  onClick={() => selectComment(comment.id)}
                >
                  <span className={`demande-number ${comment.initials === "AM" ? "agency-pin" : "client-pin"}`}>{comment.id}</span>
                  <span className="demande-body">
                    <span className="demande-meta">
                      <b>{comment.author}</b>
                      <small>{comment.time}</small>
                    </span>
                    <span className="demande-excerpt">{comment.message}</span>
                    <span className="demande-tags">
                      <span className={`decision-badge ${decisionStyles[comment.decision]}`}>{comment.decision}</span>
                      {proposalLabel(comment) && <small>{proposalLabel(comment)}</small>}
                      {(comment.replies?.length ?? 0) > 0 && (
                        <small>
                          {comment.replies?.length} réponse{(comment.replies?.length ?? 0) > 1 ? "s" : ""}
                        </small>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    ) : undefined;

  const sidebarFavorites = favorites.flatMap((key): SidebarFavorite[] => {
    const [kind, rawId] = key.split(":");
    const itemId = Number(rawId);
    if (kind === "p") {
      const project = projects.find((candidate) => candidate.id === itemId);
      return project ? [{ key, label: project.name, href: href.project(project.id), kind: "project" as const }] : [];
    }
    const latest = versionsOfLivrable(itemId, deliverables)[0];
    return latest ? [{ key, label: latest.name, href: hrefForRecord(latest, deliverables), kind: "livrable" as const }] : [];
  });

  // Project workspace panel: deliverables of the project, versions of the open one.
  const inProject = (view.kind === "deliverable" || view.kind === "dashboard") && Boolean(selectedProject);
  const sidebarLivrables: SidebarLivrable[] = latestRecords
    .filter((record) => (record.projectId ?? 1) === selectedProjectId)
    .map((record) => {
      const livrableId = livrableIdOf(record, deliverables);
      return {
        livrableId,
        name: record.name,
        type: record.type,
        href: openTabs.find((tab) => tab.livrableId === livrableId)?.href ?? hrefForRecord(record, deliverables),
        status: statusOf(record),
        active: livrableId === viewLivrableId,
      };
    });
  const sidebarVersions: SidebarVersion[] =
    view.kind === "deliverable"
      ? viewVersions.map((record) => ({
          id: record.id,
          label: `V${String(record.version).padStart(2, "0")}`,
          meta: [record.importedAt, record.reviewStatus === "approved" ? "approuvée" : record.status === "Remplacée" ? "remplacée" : null]
            .filter(Boolean)
            .join(" · "),
          href: hrefForRecord(record, deliverables),
          active: record.id === viewRecord?.id,
        }))
      : [];
  const versionChip =
    view.kind !== "deliverable" || !viewRecord
      ? undefined
      : viewRecord.reviewStatus === "approved"
        ? { label: "Approuvée", tone: "resolved" as const }
        : viewRecord.reviewStatus === "changes-requested"
          ? { label: "Modifications demandées", tone: "high" as const }
          : viewRecord.status === "Remplacée"
            ? { label: "Remplacée · lecture seule", tone: "neutral" as const }
            : { label: "En attente client", tone: "medium" as const };

  return (
    <div className="app-frame">
    {newDeliverableOpen && (
      <NewDeliverableDialog
        existingNames={deliverables.filter((record) => (record.projectId ?? 1) === selectedProjectId).map((record) => record.name)}
        onClose={() => setNewDeliverableOpen(false)}
        onCreate={createDeliverable}
      />
    )}
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} suggestions={paletteSuggestions} />
    <TabBar
      tabs={tabInfos}
      activeLivrableId={viewLivrableId}
      homeActive={view.kind !== "deliverable"}
      onClose={closeTab}
      onOpen={() => setPaletteOpen(true)}
    />
    <main className="app-shell">
      {inProject && selectedProject ? (
        <ProjectSidebar
          project={selectedProject}
          client={clients.find((client) => client.id === (selectedProject.clientId ?? 1))}
          livrables={sidebarLivrables}
          versions={sidebarVersions}
          versionChip={versionChip}
          view={view}
          panel={view.kind === "dashboard" && sidebarPanel === "demandes" ? "livrables" : sidebarPanel}
          dashboardHref={view.kind === "deliverable" || view.kind === "dashboard" ? href.dashboard(view.projectId, view.livrableId) : undefined}
          onPanel={showPanel}
          demandes={demandesList}
          demandesBadge={activeComments.filter((comment) => comment.decision === "À qualifier" || !comment.decision).length}
          onSearch={() => setPaletteOpen(true)}
          onNewDeliverable={() => setNewDeliverableOpen(true)}
          agencyActionCount={agencyActionCount}
          notifications={notifications}
        />
      ) : (
        <HomeSidebar
          view={view}
          clients={clients}
          favorites={sidebarFavorites}
          notifications={notifications}
          onSearch={() => setPaletteOpen(true)}
          onNewClient={() => setNewClientOpen(true)}
        />
      )}

      <section className="workspace" id="projet">
        <div className={`content ${view.kind === "deliverable" ? "is-editor" : ""}`}>
          {isBrowserView ? (
            <BrowserView
              view={view}
              clients={clients}
              projects={projects}
              deliverables={deliverables}
              comments={comments}
              recentLivrableIds={recentLivrableIds}
              todoItems={todoItems}
              error={deliverableError}
              onNewClient={() => setNewClientOpen(true)}
              onNewProject={() => setNewProjectOpen(true)}
              onNewDeliverable={() => setNewDeliverableOpen(true)}
              onRenameClient={renameClient}
              onRenameProject={renameProject}
              onDeleteClient={deleteClient}
              onDeleteProject={deleteProject}
              onMoveProject={moveProject}
              onMoveLivrable={moveLivrable}
              onDeleteLivrable={deleteLivrable}
              trash={trash}
              onRestore={restoreFromTrash}
              onPurge={purgeFromTrash}
              overview={overview}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              livrableStatus={(livrableId) => {
                const latest = versionsOfLivrable(livrableId, deliverables)[0];
                return latest ? statusOf(latest) : { kind: "none" };
              }}
            />
          ) : activeTab === "dashboard" ? (
            <div className="dashboard-view">
              <div className="project-heading">
                <div>
                  <div className="eyebrow">PILOTAGE COMMERCIAL · {selectedProject?.name ?? "PROJET"}</div>
                  <div className="project-selector-row">
                    <h1>Tableau de bord : {viewRecord?.name ?? "Livrable"}</h1>
                  </div>
                  <p>
                    Indicateurs de dérive de périmètre (scope creep), revenus supplémentaires contractualisés et registre des décisions.
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="secondary-button"
                    onClick={() => view.kind === "dashboard" && router.push(href.deliverable(view.projectId, view.livrableId))}
                  >
                    <ArrowLeft /> Revenir à la revue
                  </button>
                  <button className="secondary-button" onClick={() => setProofOpen(true)}>
                    Synthèse & export <ArrowUpRight />
                  </button>
                </div>
              </div>

              <div className="dashboard-kpi-grid">
                <div className="kpi-card highlight-green">
                  <div className="kpi-header">
                    <span className="kpi-icon"><Coins /></span>
                    <span className="kpi-title">Revenu supplémentaire accepté</span>
                  </div>
                  <div className="kpi-value">{totalAcceptedEuros.toLocaleString("fr-FR")} €</div>
                  <div className="kpi-sub">
                    Sur <b>{totalQuotedEuros.toLocaleString("fr-FR")} €</b> de propositions chiffrées
                  </div>
                </div>

                <div className="kpi-card highlight-coral">
                  <div className="kpi-header">
                    <span className="kpi-icon"><ShieldCheck /></span>
                    <span className="kpi-title">Scope creep évité (Planning)</span>
                  </div>
                  <div className="kpi-value">+{totalAcceptedDays} jours</div>
                  <div className="kpi-sub">
                    Délai supplémentaire formalisé et accepté par le client
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-icon"><FileText /></span>
                    <span className="kpi-title">Total des demandes</span>
                  </div>
                  <div className="kpi-value">{totalProjectDemands}</div>
                  <div className="kpi-sub">
                    Dont <b>{outsideDemands.length}</b> hors périmètre ({outsideRate}%)
                  </div>
                </div>

                <div className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-icon"><Scale /></span>
                    <span className="kpi-title">Taux de conversion devis</span>
                  </div>
                  <div className="kpi-value">
                    {outsideDemands.length > 0
                      ? Math.round((acceptedProposalsCount / outsideDemands.length) * 100)
                      : 0}%
                  </div>
                  <div className="kpi-sub">
                    <b>{acceptedProposalsCount}</b> acceptée{acceptedProposalsCount > 1 ? "s" : ""}, <b>{refusedProposalsCount}</b> refusée{refusedProposalsCount > 1 ? "s" : ""}, <b>{pendingProposalsCount}</b> en cours
                  </div>
                </div>
              </div>

              <div className="dashboard-sections-grid">
                <div className="dashboard-section-card">
                  <div className="section-card-header">
                    <h3>Répartition des arbitrages de périmètre</h3>
                    <span>Sur {projectDeliverables.length} version{projectDeliverables.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="scope-bar-wrap">
                    <div className="scope-progress-bar">
                      {totalProjectDemands > 0 ? (
                        <>
                          <div
                            className="bar-segment included"
                            style={{ width: `${(includedDemands.length / totalProjectDemands) * 100}%` }}
                            title={`Incluses: ${includedDemands.length}`}
                          />
                          <div
                            className="bar-segment outside"
                            style={{ width: `${(outsideDemands.length / totalProjectDemands) * 100}%` }}
                            title={`Hors périmètre: ${outsideDemands.length}`}
                          />
                          <div
                            className="bar-segment pending"
                            style={{ width: `${(pendingDemands.length / totalProjectDemands) * 100}%` }}
                            title={`À qualifier: ${pendingDemands.length}`}
                          />
                        </>
                      ) : (
                        <div className="bar-segment empty" style={{ width: "100%" }} />
                      )}
                    </div>
                    <div className="scope-legend">
                      <span className="legend-item"><i className="legend-dot included" /> Incluses ({includedDemands.length})</span>
                      <span className="legend-item"><i className="legend-dot outside" /> Hors périmètre ({outsideDemands.length})</span>
                      <span className="legend-item"><i className="legend-dot pending" /> À qualifier ({pendingDemands.length})</span>
                    </div>
                  </div>

                  <div className="kpi-mini-stats">
                    <div className="mini-stat">
                      <small>Temps non facturé évité</small>
                      <b>~{totalAcceptedDays * 7}h</b>
                    </div>
                    <div className="mini-stat">
                      <small>Montant moyen / devis</small>
                      <b>{outsideDemands.length > 0 ? Math.round(totalQuotedEuros / outsideDemands.length) : 0} €</b>
                    </div>
                    <div className="mini-stat">
                      <small>Versions</small>
                      <b>{projectDeliverables.length}</b>
                    </div>
                  </div>
                </div>

                <div className="dashboard-section-card">
                  <div className="section-card-header">
                    <h3>Statut des propositions commerciales</h3>
                    <span>{outsideDemands.length} proposition{outsideDemands.length > 1 ? "s" : ""} au total</span>
                  </div>
                  <div className="proposals-status-list">
                    <div className="status-row">
                      <span className="status-label"><span className="status-dot approved-dot" /> Acceptées par le client</span>
                      <b>{acceptedProposalsCount} ({totalAcceptedEuros.toLocaleString("fr-FR")} €)</b>
                    </div>
                    <div className="status-row">
                      <span className="status-label"><span className="status-dot changes-dot" /> Refusées par le client</span>
                      <b>{refusedProposalsCount}</b>
                    </div>
                    <div className="status-row">
                      <span className="status-label"><span className="status-dot" /> En attente de décision / adaptation</span>
                      <b>{pendingProposalsCount}</b>
                    </div>
                    <div className="status-row highlight">
                      <span className="status-label"><b>Total valeur commerciale capturée</b></span>
                      <b>+{totalAcceptedEuros.toLocaleString("fr-FR")} €</b>
                    </div>
                  </div>
                </div>
              </div>

              <div className="dashboard-table-card">
                <div className="section-card-header">
                  <div>
                    <h3>Registre des demandes et décisions de périmètre</h3>
                    <p>Historique complet des arbitrages du projet, versions et montants associés.</p>
                  </div>
                </div>
                {projectComments.length === 0 ? (
                  <p className="empty-table-note">Aucune demande enregistrée sur ce projet pour le moment.</p>
                ) : (
                  <div className="arbitrage-table-wrap">
                    <table className="arbitrage-table">
                      <thead>
                        <tr>
                          <th>Livrable</th>
                          <th>Demande / Remarque</th>
                          <th>Auteur</th>
                          <th>Qualification</th>
                          <th>Chiffrage & Planning</th>
                          <th>Accord Client</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectComments.map((comment) => {
                          const deliverableRecord = deliverables.find((d) => d.id === comment.deliverableId);
                          const proposal = activeProposalFor(comment.id);
                          const decision = proposalDecisionFor(comment.id);
                          return (
                            <tr key={comment.id}>
                              <td>
                                <b>{deliverableRecord?.name ?? "Livrable"}</b>
                                <small>V{deliverableRecord ? String(deliverableRecord.version).padStart(2, "0") : "01"}</small>
                              </td>
                              <td className="demand-cell">
                                <p>{comment.message}</p>
                                <small>#{comment.id} · {comment.location}</small>
                              </td>
                              <td>
                                <span className={`avatar light-avatar ${comment.initials === "AM" ? "agency-avatar" : "client-avatar"}`}>
                                  {comment.initials}
                                </span>
                              </td>
                              <td>
                                <span className={`decision-badge ${decisionStyles[comment.decision]}`}>
                                  {comment.decision}
                                </span>
                              </td>
                              <td>
                                {comment.decision === "Hors périmètre" && proposal ? (
                                  <div>
                                    <b>{formatProposalAmount(proposal.amount)}</b>
                                    <small>{formatProposalDeadline(proposal.deadline)}</small>
                                  </div>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td>
                                {comment.decision === "Hors périmètre" ? (
                                  <span
                                    className={`decision-badge ${
                                      decision === "accepted"
                                        ? "decision-included"
                                        : decision === "refused"
                                          ? "decision-outside"
                                          : "decision-pending"
                                    }`}
                                  >
                                    {decision === "accepted" ? <>Acceptée <Check /></> : decision === "refused" ? "Refusée" : "En attente"}
                                  </span>
                                ) : (
                                  <span className="text-muted">Inclus au devis</span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="action-link"
                                  onClick={() => {
                                    setSelectedId(comment.id);
                                    if (comment.deliverableId) openRecord(comment.deliverableId);
                                  }}
                                >
                                  Ouvrir <ArrowUpRight />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
          <div className="editor">
            <section className="preview-panel canvas" ref={previewPanelRef} aria-label="Canevas">
              <div className="artboard-wrap">
                <TransformWrapper
                  ref={transformRef}
                  initialScale={1}
                  minScale={0.5}
                  maxScale={3}
                  centerOnInit
                  smooth={false}
                  wheel={{ step: 0.1 }}
                  onTransform={(_, state) => setPreviewZoom(Math.round(state.scale * 100))}
                >
                  <TransformComponent wrapperClass={`artboard-transform-wrapper ${previewDragging ? "dragging" : ""}`} contentClass="artboard-transform-content">
                    <div className="artboard" onClick={startComment} onPointerDown={trackPreviewPointerDown} onPointerMove={trackPreviewPointerMove} onPointerUp={trackPreviewPointerUp} onPointerCancel={trackPreviewPointerUp}>
                  <DeliverableContent deliverable={currentDeliverable} pdfPage={pdfPage} onPdfLoad={setPdfPageCount} />
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
              <div className="panel-toolbar canvas-toolbar" role="toolbar" aria-label="Outils du canevas">
                <div className="toolbar-left">
                  <button className="tool-button selected" aria-label="Demandes" title="Demandes">
                    <MousePointer2 /> <span>Demandes</span>
                  </button>
                  <button
                    className="add-comment-tool"
                    onClick={startCommentAtCenter}
                    disabled={isReadOnlyVersion}
                    title="Ajouter une remarque"
                    aria-label="Ajouter une remarque"
                  >
                    <Plus /> <span>Ajouter une remarque</span>
                  </button>
                  <button className="tool-button" aria-label="Grille"><LayoutGrid /></button>
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
                  <button className="tool-button" onClick={() => transformRef.current?.zoomOut(0.1)} disabled={previewZoom <= 50} title="Réduire le zoom" aria-label="Réduire le zoom"><Minus /></button>
                  <button className="zoom" onClick={() => transformRef.current?.resetTransform()} title="Réinitialiser le zoom">{previewZoom}%</button>
                  <button className="tool-button" onClick={() => transformRef.current?.zoomIn(0.1)} disabled={previewZoom >= 300} title="Augmenter le zoom" aria-label="Augmenter le zoom"><Plus /></button>
                  <button className="tool-button" onClick={togglePreviewFullscreen} title="Plein écran" aria-label="Plein écran"><Maximize /></button>
                </div>
              </div>
            </section>

            <aside className="inspector" aria-label="Version et demande sélectionnée">
              <section className="inspector-section">
                <div className="inspector-heading">
                  <h2>Version {String(currentDeliverable.version).padStart(2, "0")}</h2>
                  {versionChip && <span className={`chip chip-${versionChip.tone}`}>{versionChip.label}</span>}
                </div>
                <p className="inspector-meta">
                  Importée {currentDeliverable.importedAt} · Échéance 24 sept. 2026
                </p>
                {/* Mobile only: on desktop the project panel lists deliverables and versions. */}
                <div className="deliverable-selectors mobile-only">
                <select className="deliverable-select" value={activeDeliverableName ?? ""} onChange={(event) => selectDeliverableName(event.target.value)} aria-label="Sélectionner un livrable">
                  {deliverableNames.map((name) => <option value={name} key={name}>{name}</option>)}
                </select>
                <select className="version-select" value={currentDeliverable?.id ?? ""} onChange={(event) => openRecord(Number(event.target.value))} aria-label="Sélectionner une version">
                  {activeVersions.map((deliverable) => <option value={deliverable.id} key={deliverable.id}>Version {String(deliverable.version).padStart(2, "0")}</option>)}
                </select>
                </div>
                {deliverableError && (
                  <div className="inline-error" role="alert">
                    {deliverableError}
                  </div>
                )}
                <button className="inspector-primary" onClick={openShareDialog}>
                  <Share2 /> Partager la revue
                </button>
                <div className="inspector-actions">
                  <label className="inspector-action">
                    <Upload /> Importer un fichier
                    <input type="file" accept="application/pdf,image/*" onChange={importDeliverable} />
                  </label>
                  <button className="inspector-action" onClick={() => setProofOpen(true)}>
                    <FileCheck /> Synthèse & export
                  </button>
                  {view.kind === "deliverable" && (
                    <Link className="inspector-action" href={href.dashboard(view.projectId, view.livrableId)}>
                      <LayoutDashboard /> Tableau de bord du livrable
                    </Link>
                  )}
                  <button className="inspector-action" onClick={() => setHistoryOpen(true)}>
                    <ScrollText /> Historique et journal
                  </button>
                  <button
                    className="inspector-action"
                    onClick={() => {
                      setChangesMessage("");
                      setChangesOpen(true);
                    }}
                  >
                    <RotateCcw /> Rouvrir la validation
                  </button>
                </div>
                <p className={`agency-validation-status ${approved ? "is-approved" : ""}`}>
                  <span className="status-dot" />
                  {reviewStatus === "changes-requested"
                    ? "Modifications demandées par le client"
                    : approved
                      ? `Version approuvée par le client${approvedAt ? ` · ${approvedAt}` : ""}`
                      : "En attente de validation client"}
                </p>
              </section>

              <section className="inspector-section">
                {selectedComment ? (
                  <>
                    <h2>Demande #{selectedComment.id}</h2>
                    <div className="decision-actions" role="group" aria-label="Qualifier la demande">
                      <button
                        className={selectedComment.decision === "Inclus" ? "active-decision" : ""}
                        aria-pressed={selectedComment.decision === "Inclus"}
                        onClick={() => classifyComment("Inclus")}
                      >
                        Incluse
                      </button>
                      <button
                        className={selectedComment.decision === "Hors périmètre" ? "active-decision outside" : ""}
                        aria-pressed={selectedComment.decision === "Hors périmètre"}
                        onClick={() => classifyComment("Hors périmètre")}
                      >
                        Hors périmètre
                      </button>
                      <button
                        className={selectedComment.decision === "À qualifier" || !selectedComment.decision ? "active-decision" : ""}
                        aria-pressed={selectedComment.decision === "À qualifier" || !selectedComment.decision}
                        onClick={() => classifyComment("À qualifier")}
                      >
                        À qualifier
                      </button>
                    </div>
                    {renderCommentThread(selectedComment)}
                  </>
                ) : (
                  <>
                    <h2>Demande</h2>
                    <p className="inspector-empty">
                      Cliquez sur le livrable pour ajouter une remarque, ou choisissez une demande dans la liste.
                    </p>
                  </>
                )}
              </section>

              {/* On mobile the side panel is hidden, so the requests list lives here. */}
              {isMobile && <section className="inspector-section">{demandesList}</section>}
            </aside>
          </div>
          </>
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
                  aria-label="Fermer"
                >
                  <X />
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
                      {(selectedAdaptationRequest.budget !== undefined || selectedAdaptationRequest.deadline !== undefined) && (
                        <div>
                          {selectedAdaptationRequest.budget !== undefined && <b>Budget indicatif : {formatProposalAmount(selectedAdaptationRequest.budget)}</b>}
                          {selectedAdaptationRequest.deadline !== undefined && <b>Délai souhaité : {formatProposalDeadline(selectedAdaptationRequest.deadline)}</b>}
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
                      <b>{formatProposalAmount(activeProposalFor(proposalCommentId ?? 0)?.amount ?? 850)}</b>
                    </div>
                    <div>
                      <span>Impact planning</span>
                      <b>{formatProposalDeadline(activeProposalFor(proposalCommentId ?? 0)?.deadline ?? 3)}</b>
                    </div>
                  </div>
                  {proposalDecisionFor(proposalCommentId ?? 0) === "accepted" ? (
                    <div className="proposal-status-banner accepted">
                      <span><Check /> Proposition acceptée par le client</span>
                    </div>
                  ) : proposalDecisionFor(proposalCommentId ?? 0) === "refused" ? (
                    <div className="proposal-status-banner refused">
                      <span><X /> Proposition refusée par le client</span>
                    </div>
                  ) : selectedAdaptationRequest?.decision ? (
                    <div className={`proposal-status-banner ${selectedAdaptationRequest.decision}`}>
                      <span>{selectedAdaptationRequest.decision === "accepted" ? <><Check /> {"Adaptation acceptée par l'agence"}</> : <><X /> {"Adaptation refusée par l'agence"}</>}</span>
                    </div>
                  ) : selectedAdaptationRequest ? (
                    <>
                      {selectedAdaptationRequest.budget !== undefined && (
                        <div className="proposal-action-row">
                          <button className="approve-button" onClick={() => decideAdaptation(proposalCommentId ?? 0, "accepted")} disabled={isReadOnlyVersion}>Accepter l'adaptation</button>
                          <button className="refuse-submit" onClick={() => decideAdaptation(proposalCommentId ?? 0, "refused")} disabled={isReadOnlyVersion}>Refuser l'adaptation</button>
                        </div>
                      )}
                      <button
                        className="new-version-button"
                        onClick={() => {
                          const existing = activeProposalFor(proposalCommentId ?? 0);
                          setNewProposalDescription(existing?.description ?? "");
                          setNewProposalAmount(existing ? String(parseNumericAmount(existing.amount)) : "");
                          setNewProposalDeadline(existing ? String(parseNumericDays(existing.deadline)) : "");
                          setNewProposalVersionOpen(true);
                        }}
                      >
                        Répondre avec une nouvelle proposition
                      </button>
                    </>
                  ) : (
                    <div className="proposal-status-banner pending">
                      <span><Hourglass /> Transmise au client · En attente de décision</span>
                    </div>
                  )}
                  {!isReadOnlyVersion && proposalDecisionFor(proposalCommentId ?? 0) !== "accepted" && !selectedAdaptationRequest && (
                    <button
                      className="new-version-button"
                      onClick={() => {
                        const existing = activeProposalFor(proposalCommentId ?? 0);
                        setNewProposalDescription(existing?.description ?? "");
                        setNewProposalAmount(existing ? String(parseNumericAmount(existing.amount)) : "");
                        setNewProposalDeadline(existing ? String(parseNumericDays(existing.deadline)) : "");
                        setNewProposalVersionOpen(true);
                      }}
                    >
                      Modifier la proposition (nouvelle version)
                    </button>
                  )}
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
                      <div className="input-with-addon">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          placeholder="850"
                          value={newProposalAmount}
                          onChange={(event) => setNewProposalAmount(event.target.value)}
                        />
                        <span className="input-addon">€</span>
                      </div>
                    </label>
                    <label>
                      Impact planning
                      <div className="input-with-addon">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="3"
                          value={newProposalDeadline}
                          onChange={(event) => setNewProposalDeadline(event.target.value)}
                        />
                        <span className="input-addon">jours</span>
                      </div>
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
                    Envoyer au client <ArrowUpRight />
                  </button>
                </>
              )}
            </div>
          )}
          {proposalPreviewCommentId !== null && previewProposal && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal proposal-preview-modal">
                <div className="drawer-header">
                  <div>
                    <div className="eyebrow">PROPOSITION COMPLÉMENTAIRE</div>
                    <h2>Résumé de la proposition</h2>
                  </div>
                  <button type="button" className="close-button" onClick={() => setProposalPreviewCommentId(null)} aria-label="Fermer"><X /></button>
                </div>
                <p className="drawer-intro">Demande #{previewProposalComment?.id} · Version {previewProposal.version}</p>
                <div className={`proposal-preview-status ${previewAdaptationRequest?.decision === "refused" || proposalDecisionFor(previewProposal.commentId) === "refused" ? "refused" : "accepted"}`}>
                  {previewAdaptationRequest?.decision === "accepted" ? `Acceptée par l'agence${previewAdaptationRequest.decisionBy ? ` · ${previewAdaptationRequest.decisionBy}` : ""}` : previewAdaptationRequest?.decision === "refused" ? `Refusée par l'agence${previewAdaptationRequest.decisionBy ? ` · ${previewAdaptationRequest.decisionBy}` : ""}` : proposalDecisionFor(previewProposal.commentId) === "accepted" ? "Acceptée par le client" : "Refusée par le client"}
                </div>
                <div className="proposal-summary">
                  <div><span>Prestation</span><b>{previewProposal.description}</b></div>
                  <div><span>Montant</span><b>{formatProposalAmount(previewProposal.amount)}</b></div>
                  <div><span>Impact planning</span><b>{formatProposalDeadline(previewProposal.deadline)}</b></div>
                </div>
                {previewAdaptationRequest && <div className="adaptation-request-summary"><span>Demande d'adaptation · {previewAdaptationRequest.requestedAt}</span><p>{previewAdaptationRequest.message}</p></div>}
              </section>
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
                    <X />
                  </button>
                </div>
                <p className="drawer-intro">
                  {
                    comments.filter(
                      (comment) => comment.decision === "À qualifier" || !comment.decision,
                    ).length
                  }{" "}
                  demande(s) n'ont pas encore été qualifiée(s). L'approbation
                  verrouillera cette version.
                </p>
                <div className="blocking-list">
                  {comments
                    .filter((comment) => comment.decision === "À qualifier" || !comment.decision)
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
                      showPanel("demandes");
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
                    <div className="eyebrow">REGISTRE D'ARBITRAGE & PREUVE</div>
                    <h2>Synthèse du périmètre & décisions</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setProofOpen(false)}
                    aria-label="Fermer"
                  >
                    <X />
                  </button>
                </div>
                <button className="proof-export-button" onClick={exportProof}>
                  Exporter la preuve
                </button>
                <div className="proof-header">
                  <div>
                    <span>Projet</span>
                    <b>{selectedProject?.name ?? "Projet"}</b>
                  </div>
                  <div>
                    <span>Client</span>
                    <b>{selectedClient?.name ?? "Client"}</b>
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
                  {approved ? "Version approuvée" : "En attente client"}
                  {approvedAt && <small> le {approvedAt}</small>}
                </div>

                <div className="scope-summary-grid">
                  <div className="scope-summary-card">
                    <span className="scope-card-label">Demandes incluses</span>
                    <b>
                      {activeComments.filter((c) => c.decision === "Inclus").length}
                    </b>
                    <small>0 € (compris au forfait)</small>
                  </div>
                  <div className="scope-summary-card">
                    <span className="scope-card-label">Hors périmètre</span>
                    <b>
                      {activeComments.filter((c) => c.decision === "Hors périmètre").length}
                    </b>
                    <small>
                      {activeComments.filter(
                        (c) =>
                          c.decision === "Hors périmètre" &&
                          proposalDecisionFor(c.id) === "accepted",
                      ).length}{" "}
                      acceptée(s)
                    </small>
                  </div>
                  <div className="scope-summary-card highlight">
                    <span className="scope-card-label">À qualifier</span>
                    <b>
                      {activeComments.filter((c) => c.decision === "À qualifier" || !c.decision).length}
                    </b>
                    <small>en attente d'arbitrage</small>
                  </div>
                </div>

                <h3>Décisions et qualifications sur les demandes</h3>
                <div className="proof-comments">
                  {activeComments.map((comment) => (
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
                {activeComments.some(
                  (comment) =>
                    comment.decision === "Hors périmètre" &&
                    proposalStateFor(comment.id) === "sent",
                ) && (
                  <>
                    <h3>Propositions commerciales associées</h3>
                    <div className="proof-proposals-list">
                      {activeComments
                        .filter(
                          (comment) =>
                            comment.decision === "Hors périmètre" &&
                            proposalStateFor(comment.id) === "sent",
                        )
                        .map((comment) => {
                          const proposal = activeProposalFor(comment.id);
                          const decision = proposalDecisionFor(comment.id);
                          return (
                            <div className="proof-proposal-item" key={comment.id}>
                              <div>
                                <b>Demande #{comment.id} : {proposal?.description || comment.message}</b>
                                <small>{proposal ? `${formatProposalAmount(proposal.amount)} · ${formatProposalDeadline(proposal.deadline)}` : "Montant et délai à définir"}</small>
                              </div>
                              <span
                                className={`decision-badge ${
                                  decision === "accepted"
                                    ? "decision-included"
                                    : decision === "refused"
                                      ? "decision-outside"
                                      : "decision-pending"
                                }`}
                              >
                                {decision === "accepted"
                                  ? <>Acceptée <Check /></>
                                  : decision === "refused"
                                    ? "Refusée"
                                    : "En attente"}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </>
                )}
                <div className="proof-footer">
                  <span>Validé par Alex Morgan</span>
                  <span>
                    Identifiant : KR-{currentDeliverable.id}-
                    {currentDeliverable.version}
                  </span>
                </div>
              </section>
            </div>
          )}
          {pendingImport && (
            <div className="modal-backdrop" role="presentation">
              <section className="project-modal import-choice-modal">
                <div className="drawer-header"><div><div className="eyebrow">NOUVEL IMPORT</div><h2>Que souhaitez-vous ajouter ?</h2></div><button type="button" className="close-button" onClick={() => setPendingImport(null)} aria-label="Fermer"><X /></button></div>
                <p className="drawer-intro">{pendingImport.file.name} est prêt à être ajouté au projet.</p>
                <div className="import-choice-list"><button className="import-choice" onClick={() => confirmImport("version")}><b>Nouvelle version</b><small>Conserver le livrable « {currentDeliverable?.name} » et créer V{(currentDeliverable?.version ?? 0) + 1}.</small></button><button className="import-choice" onClick={() => confirmImport("deliverable")}><b>Nouveau livrable</b><small>Créer un document indépendant en version 01.</small></button></div>
              </section>
            </div>
          )}
          {newProjectOpen && (
            <div className="modal-backdrop" role="presentation">
              <form className="project-modal" onSubmit={createProject}>
                <div className="drawer-header">
                  <h2>Créer un projet</h2>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setNewProjectOpen(false)}
                    aria-label="Fermer"
                  >
                    <X />
                  </button>
                </div>
                <p className="drawer-intro">
                  {view.kind === "client"
                    ? `Le projet sera créé dans l’espace ${clients.find((client) => client.id === view.clientId)?.name ?? ""}.`
                    : "Un projet regroupe les livrables d’une même mission."}
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
                {/* Inside a space the space is implied; elsewhere, pick it. */}
                {view.kind !== "client" && (
                <label>
                  Espace
                  <select
                    value={newProjectClientId ?? selectedClientId}
                    onChange={(event) => setNewProjectClientId(Number(event.target.value))}
                  >
                    {clients.map((client) => (
                      <option value={client.id} key={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
                )}
                {projectError && (
                  <p className="form-error" role="alert">
                    {projectError}
                  </p>
                )}
                <button className="send-proposal" type="submit">
                  Créer le projet <ArrowRight />
                </button>
              </form>
            </div>
          )}
          {newClientOpen && (
            <div className="modal-backdrop" role="presentation">
              <form className="project-modal" onSubmit={createClient} noValidate>
                <div className="drawer-header">
                  <div>
                    <h2>Créer un espace</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setNewClientOpen(false)}
                    aria-label="Fermer"
                  >
                    <X />
                  </button>
                </div>
                <p className="drawer-intro">
                  Un espace regroupe des projets. Vous pourrez y inviter vos collaborateurs, et votre client.
                </p>
                <label>
                  Nom de l’espace
                  <input
                    autoFocus
                    value={newClientName}
                    onChange={(event) => setNewClientName(event.target.value)}
                    placeholder="Ex. Atelier Horizon"
                  />
                </label>
                <label>
                  <span>
                    Inviter un collaborateur <span className="field-optional">(facultatif)</span>
                  </span>
                  <input
                    type="email"
                    value={newClientEmail}
                    onChange={(event) => setNewClientEmail(event.target.value)}
                    placeholder="prenom@votre-agence.fr"
                  />
                </label>
                {clientError && (
                  <p className="form-error" role="alert">
                    {clientError}
                  </p>
                )}
                <button className="send-proposal" type="submit">
                  Créer l’espace <ArrowRight />
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
                    <X />
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
                    <X />
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
                      {linkCopied ? <>Lien copié <Check /></> : "Copier le lien"}
                    </button>
                    <button className="notify-button" onClick={notifyClient} disabled={isReadOnlyVersion}>
                      {notificationSent
                        ? <>Client notifié <Check /></>
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
                    <div className="eyebrow">NOUVELLE REMARQUE</div>
                    <h2>Ajouter une remarque</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    onClick={() => setCommentDraft(null)}
                    aria-label="Fermer"
                  >
                    <X />
                  </button>
                </div>
                <p className="drawer-intro">
                  Votre remarque sera attachée à la position {commentDraft.x}%
                  / {commentDraft.y}% de la page.
                </p>
                <label>
                  Remarque interne
                  <textarea
                    autoFocus
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Décrivez la consigne ou le point à qualifier..."
                  />
                </label>
                <button
                  className="send-proposal"
                  type="submit"
                  disabled={!commentText.trim()}
                >
                  Ajouter la remarque <ArrowRight />
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
                    <X />
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
                  Envoyer la demande <ArrowRight />
                </button>
              </form>
            </div>
          )}
          {newProposalVersionOpen && (
            <div className="modal-backdrop" role="presentation">
              <form className="project-modal comment-modal" onSubmit={sendNewProposalVersion}>
                <div className="drawer-header">
                  <div><div className="eyebrow">NOUVELLE VERSION</div><h2>Répondre à la demande d'adaptation</h2></div>
                  <button type="button" className="close-button" onClick={() => setNewProposalVersionOpen(false)} aria-label="Fermer"><X /></button>
                </div>
                <p className="drawer-intro">La proposition actuelle deviendra remplacée. Cette nouvelle version sera la seule proposition active pour le client.</p>
                {selectedAdaptationRequest && <div className="adaptation-request-summary"><span>Demande du client · {selectedAdaptationRequest.requestedAt}</span><p>{selectedAdaptationRequest.message}</p></div>}
                <label>Description de la prestation<textarea autoFocus value={newProposalDescription} onChange={(event) => setNewProposalDescription(event.target.value)} /></label>
                <div className="field-grid">
                  <label>
                    Montant
                    <div className="input-with-addon">
                      <input
                        type="number"
                        min="0"
                        step="10"
                        placeholder="850"
                        value={newProposalAmount}
                        onChange={(event) => setNewProposalAmount(event.target.value)}
                      />
                      <span className="input-addon">€</span>
                    </div>
                  </label>
                  <label>
                    Impact planning
                    <div className="input-with-addon">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="3"
                        value={newProposalDeadline}
                        onChange={(event) => setNewProposalDeadline(event.target.value)}
                      />
                      <span className="input-addon">jours</span>
                    </div>
                  </label>
                </div>
                <button className="send-proposal" type="submit" disabled={!newProposalDescription.trim() || !newProposalAmount.trim() || !newProposalDeadline.trim()}>Envoyer la nouvelle proposition <ArrowRight /></button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
    </div>
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

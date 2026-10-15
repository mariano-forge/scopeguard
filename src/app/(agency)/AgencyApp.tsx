"use client";



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
import { ViewTransition, useEffect, useRef, useState } from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Users,
  FolderPlus,
  ArrowRight,
  Copy,
  Download,
  FileDown,
  Check,
  CircleHelp,
  Eye,
  FilePlus,
  FolderClosed,
  Keyboard,
  Lock,
  Search,
  Settings,
  Star,
  House,
  Pencil,
  RotateCcw,
  ScrollText,
  Share2,
  FileCheck,
  Upload,
  X,
} from "lucide-react";
import { BrowserView, type HomeOverview } from "./BrowserView";
import { TabBar, type TabInfo, type TabStatus } from "./TabBar";
import { todoOrder, type TodoItem } from "./TodoList";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { HomeSidebar, ProjectSidebar, type ClientFeedback, type PanelMode, type SidebarLivrable, type SidebarFavorite, type SidebarVersion } from "./Sidebars";
import { href, hrefForRecord, livrableIdOf, parseAgencyPath, versionsOfLivrable } from "./routes";
import { MAX_FILE_BYTES, formatBytes, kindFromFile, type DeliverableType } from "@/components/deliverableKinds";
import { NewDeliverableDialog, type NewDeliverable } from "./NewDeliverableDialog";
import {
  Composer,
  ThreadPopover,
  requestKind,
  type ProposalStage,
  type Qualification,
  type Qualified,
  type Area,
  } from "./editor/CanvasComments";
import { EditorInspector, threadsToMarkdown, type InspectorTab } from "./editor/EditorInspector";
import { NewRequestDialog } from "./editor/NewRequestDialog";
import { ReviewCanvas, type CanvasComposer, type CanvasTool } from "./editor/ReviewCanvas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AddonInput, Field, FormError, Modal, selectClassName } from "@/components/modal";
import { MenuButton, type MenuEntry } from "./editor/MenuButton";
import { RenameDialog } from "./EntitySettings";
import { Hint } from "@/components/hint";
import type { HomeAnalyticsData } from "./HomeAnalytics";
import type { LivrableGroup } from "./LivrableFilter";
import { useCurrentUser } from "./CurrentUser";
import { proofHtml } from "./proofDocument";
import { flushSharedState, loadSharedState, refreshSharedState, subscribeSharedState, writeSharedState } from "@/lib/stateSync";


type Decision = "À qualifier" | "Inclus" | "Hors périmètre";

type Reply = {
  id: number;
  author: string;
  initials: string;
  message: string;
  time: string;
  /** When it was written (ms); older data only has `time`. */
  createdAt?: number;
  edited?: boolean;
};

type Comment = {
  id: number;
  deliverableId?: number;
  author: string;
  initials: string;
  time: string;
  /** When it was written (ms); older data only has `time`. */
  createdAt?: number;
  message: string;
  edited?: boolean;
  location: string;
  decision: Decision;
  /** "request" = correction (title, description, qualification); otherwise a remark (conversation only). */
  kind?: "remark" | "request";
  /** Set when qualified (correction or hors scope): what has to be done; `message` keeps the comment. */
  title?: string;
  description?: string;
  /** Remark a correction was written from. */
  sourceId?: number;
  /** Area drawn on the page, in %. */
  area?: Area;
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
  /** People invited by e-mail to this review; `id` makes their personal address (?invitation=<id>). */
  invites?: { email: string; at: string; id?: string }[];
  /** Last reminder mailed to the invited clients (ms); the server allows one a day. */
  lastReminderAt?: number;
};
type ReviewLinks = Record<string, ReviewLink>;
/** Someone with a review link, not invited, asking for access (read-only here, decided through the API). */
type AccessRequest = { linkKey: string; email: string; message: string | null; requestedAt: string };
const linkKeyOf = (link: ReviewLink) => `${link.deliverableId ?? 1}:${link.version ?? 1}`;

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
  /** Closed by a refused adaptation: what the client had asked. */
  adaptation?: string;
  /** The client may counter-propose (ask for an adaptation); absent on older data = allowed. */
  allowCounter?: boolean;
};
type ProposalVersions = Record<number, ProposalVersion[]>;
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
  /** Version the event is about, for its proof. */
  deliverableId?: number;
};

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
/** Widths of the side panels, set by dragging their edge (per browser). */
const panelWidthsKey = "kora-panel-widths";
/** Comments the agency has opened (per browser): the tab alert only counts the others. */
const seenKey = "kora-seen-comments";
const defaultWidths = { panel: 248, inspector: 340 };

// A new agency starts empty: its first space, project and deliverable are created from the home page.
const initialProjects: Project[] = [];
const initialClients: Client[] = [];
const initialDeliverables: Deliverable[] = [];
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

/** New client review link for a version, valid 7 days. */
function createReviewLink(deliverableId: number, version: number): ReviewLink {
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-FR");
  return { token, active: true, expiresAt, autoExpire: true, deliverableId, version };
}

export function AgencyApp() {
  const currentUser = useCurrentUser();
  /** Browser-kept lists hold ids of this agency's records: one entry per agency. */
  const scoped = (key: string) => `${key}:${currentUser.organizationId}`;
  /**
   * Owners and administrators make the commercial decisions and what cannot be undone (sending a quote,
   * answering a counter-proposal, revoking a link, deleting a space or a project, emptying the trash).
   * The server refuses them from members too (src/db/agencyPermissions.ts).
   */
  const canManage = currentUser.role === "owner" || currentUser.role === "admin";
  function adminOnly() {
    if (!canManage) toast.error("Réservé aux administrateurs de l’agence.");
    return canManage;
  }
  const router = useRouter();
  const pathname = usePathname();
  const view = parseAgencyPath(pathname);
  const searchParams = useSearchParams();
  const focusedCommentId = Number(searchParams.get("demande")) || null;
  /** ?chiffrer=1 with ?demande= opens that request on its quote form. */
  const quoteOnFocus = searchParams.get("chiffrer") === "1";
  const [projects, setProjects] = useState(initialProjects);
  const [clients, setClients] = useState(initialClients);
  const [deliverables, setDeliverables] = useState(initialDeliverables);
  const [recentLivrableIds, setRecentLivrableIds] = useState<number[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newDeliverableOpen, setNewDeliverableOpen] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<PanelMode | null>("livrables");
  // Last open mode, read by the Ctrl+\ handler (a ref, so the listener never sees a stale value).
  const lastPanelRef = useRef<PanelMode>("livrables");
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
    view.kind === "deliverable" ? versionsOfLivrable(view.livrableId, deliverables) : [];
  const viewRecord =
    view.kind === "deliverable"
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
  const isBrowserView =
    view.kind === "home" ||
    view.kind === "todo" ||
    view.kind === "recents" ||
    view.kind === "shared" ||
    view.kind === "trash" ||
    view.kind === "spaces" || view.kind === "client" || view.kind === "project" || view.kind === "not-found";

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
  /** The version form re-quotes a refused proposal: it saves a draft, sent later after confirmation. */
  const [requoting, setRequoting] = useState(false);
  /** "Nouvelle demande" form, opened on that qualification. */
  const [newRequestKind, setNewRequestKind] = useState<Qualification | null>(null);
  const [newProposalCounter, setNewProposalCounter] = useState(false);
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
  const [canvasTool, setCanvasTool] = useState<CanvasTool>("remark");
  /** The selected thread is open on the canvas. */
  const [threadOpen, setThreadOpen] = useState(false);
  const [composer, setComposer] = useState<CanvasComposer | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("comment");
  const [panelWidths, setPanelWidths] = useState(defaultWidths);
  const [seenIds, setSeenIds] = useState<number[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(scoped(seenKey)) ?? "[]");
      if (Array.isArray(saved)) setSeenIds(saved.filter((value) => typeof value === "number"));
    } catch {
      // Everything unread when storage is unavailable.
    }
  }, []);
  /** Comment and reply ids the agency has read (client messages leave the notifications). */
  function markSeen(ids: number[]) {
    setSeenIds((current) => {
      const fresh = ids.filter((id) => !current.includes(id));
      if (fresh.length === 0) return current;
      const next = [...current, ...fresh];
      try {
        window.localStorage.setItem(scoped(seenKey), JSON.stringify(next));
      } catch {
        // Ignore storage failures (private mode, quota).
      }
      return next;
    });
  }
  /** Request whose bubble opens on the quote form ("Chiffrer" from the panel). */
  const [quotingId, setQuotingId] = useState<number | null>(null);
  /** Proposal waiting for the "send to the client?" confirmation. */
  const [confirmSendId, setConfirmSendId] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(panelWidthsKey) ?? "null");
      if (saved && typeof saved.panel === "number" && typeof saved.inspector === "number") setPanelWidths(saved);
    } catch {
      // Default widths when storage is unavailable.
    }
  }, []);
  function resizePanel(which: keyof typeof defaultWidths, width: number) {
    setPanelWidths((current) => {
      const next = { ...current, [which]: width };
      try {
        window.localStorage.setItem(panelWidthsKey, JSON.stringify(next));
      } catch {
        // Ignore storage failures (private mode, quota).
      }
      return next;
    });
  }
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [reviewLink, setReviewLink] = useState<ReviewLink | null>(null);
  const [reviewLinks, setReviewLinks] = useState<ReviewLinks>({});
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesMessage, setChangesMessage] = useState("");
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  /** Share dialog: e-mail addresses being typed for a manual invitation. */
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [stateHydrated, setStateHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSharedState().then((savedState) => {
      if (cancelled) return;
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
          auditEvents?: AuditEvent[];
          trash?: TrashItem[];
          accessRequests?: AccessRequest[];
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
        setAccessRequests(parsedState.accessRequests ?? []);
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
        if (parsedState.auditEvents) setAuditEvents(parsedState.auditEvents);
        if (parsedState.trash) {
          const limit = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
          // Expired items are purged by an administrator's page (members may not delete for good).
        setTrash(canManage ? parsedState.trash.filter((item) => item.deletedAt >= limit) : parsedState.trash);
        }
        setStateHydrated(true);
      } catch {
        setStateHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function syncFromStorage(newValue: string) {
      try {
        const parsedState = JSON.parse(newValue) as {
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
          accessRequests?: AccessRequest[];
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
        // The link open in the share dialog follows too (invitations made by the server).
        if (parsedState.reviewLinks) setReviewLink((current) => (current ? (parsedState.reviewLinks?.[linkKeyOf(current)] ?? current) : current));
        setAccessRequests(parsedState.accessRequests ?? []);
        if (parsedState.auditEvents) setAuditEvents(parsedState.auditEvents);
        if (parsedState.notifications) setNotifications(parsedState.notifications);
      } catch {
        // Ignore malformed external updates and keep the current view.
      }
    }

    return subscribeSharedState(syncFromStorage);
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
      auditEvents,
      trash,
    });

    writeSharedState(newSerialized);
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
  const lastReminderAt = reviewLink?.lastReminderAt ?? null;
  // eslint-disable-next-line react-hooks/purity -- a 24-hour window: a render-time clock is precise enough.
  const reminderBlocked = lastReminderAt !== null && Date.now() - lastReminderAt < 24 * 60 * 60 * 1000;
  const nobodyInvited = !(reviewLink?.invites?.length);

  // The deliverable dashboard is gone (its analytics are on the home page): old links open the deliverable.
  useEffect(() => {
    if (view.kind === "dashboard") router.replace(href.deliverable(view.projectId, view.livrableId));
  }, [view, router]);

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
  // The canvas belongs to the deliverable's tab.
  const viewLivrableId =
    view.kind === "deliverable" && viewRecord
      ? livrableIdOf(viewRecord, deliverables)
      : null;
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(scoped(recentsKey)) ?? "[]");
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
        window.localStorage.setItem(scoped(recentsKey), JSON.stringify(next));
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
      else if (saved) setSidebarPanel("livrables");
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

  // Canvas tools from the keyboard (as in Figma): V move, C remark, D request, Escape closes and goes back to move.
  const editorOpen = view.kind === "deliverable";
  useEffect(() => {
    if (!editorOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (key === "v") setCanvasTool("move");
      else if (key === "c" && !isReadOnlyVersion) setCanvasTool("remark");
      else if (event.key === "Escape") {
        setComposer(null);
        setThreadOpen(false);
        setCanvasTool(isReadOnlyVersion ? "move" : "remark");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen, isReadOnlyVersion]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(scoped(favoritesKey)) ?? "[]");
      if (Array.isArray(saved)) setFavorites(saved.filter((key) => typeof key === "string"));
    } catch {
      // Favorites are a convenience: ignore unreadable storage.
    }
  }, []);
  function toggleFavorite(key: string) {
    setFavorites((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      try {
        window.localStorage.setItem(scoped(favoritesKey), JSON.stringify(next));
      } catch {
        // Ignore storage failures (private mode, quota).
      }
      return next;
    });
  }

  // Open tabs (per browser). Opening a deliverable adds its tab; a tab remembers the version last viewed.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(scoped(tabsKey)) ?? "[]");
      if (Array.isArray(saved))
        setOpenTabs(
          saved
            .filter((tab) => typeof tab?.livrableId === "number" && typeof tab?.href === "string")
            // Tabs saved on the removed dashboard reopen the deliverable.
            .map((tab) => ({ ...tab, href: tab.href.replace(/\/(tableau-de-bord|propositions)$/, "") })),
        );
    } catch {
      // Tabs are a convenience: ignore unreadable storage.
    }
  }, []);
  function saveTabs(next: { livrableId: number; href: string }[]) {
    try {
      window.localStorage.setItem(scoped(tabsKey), JSON.stringify(next));
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
    setComposer(null);
    setThreadOpen(false);
  }, [currentDeliverable?.id]);

  useEffect(() => {
    if (activeComments.length > 0 && !activeComments.some((c) => c.id === selectedId)) {
      setSelectedId(activeComments[0].id);
    }
  }, [currentDeliverable?.id, activeComments, selectedId]);

  // A comment counts as read once its thread has been opened.
  const openThreadId = threadOpen ? (selectedComment?.id ?? null) : null;
  const openReplyIds = threadOpen ? (selectedComment?.replies ?? []).map((reply) => reply.id).join(",") : "";
  useEffect(() => {
    if (openThreadId !== null) markSeen([openThreadId, ...openReplyIds.split(",").filter(Boolean).map(Number)]);
  }, [openThreadId, openReplyIds]);

  // ?demande=ID (from "À traiter"): select that comment once, then drop the param so clicks work normally.
  useEffect(() => {
    if (focusedCommentId === null || !activeComments.some((comment) => comment.id === focusedCommentId)) return;
    const focused = activeComments.find((comment) => comment.id === focusedCommentId);
    setSelectedId(focusedCommentId);
    setThreadOpen(true);
    if (quoteOnFocus) setQuotingId(focusedCommentId);
    if (focused) setInspectorTab(requestKind(focused));
    router.replace(pathname, { scroll: false });
    // Bring its pin into view once the canvas has laid out the pages.
    window.setTimeout(() => {
      const pin = document.querySelector<HTMLElement>(`[data-pin="${focusedCommentId}"]`);
      const zoom = transformRef.current;
      if (pin && zoom) void zoom.zoomToElement(pin, zoom.state.scale, 300);
    }, 400);
  }, [focusedCommentId, quoteOnFocus, activeComments, pathname, router]);

  function recordAudit(type: string, description: string, commentId?: number) {
    // The version it is about: the request's one, else the version open in the editor (for its proof).
    const deliverableId =
      (commentId !== undefined ? comments.find((comment) => comment.id === commentId)?.deliverableId : undefined) ??
      (view.kind === "deliverable" ? currentDeliverable?.id : undefined);
    setAuditEvents((current) => [
      {
        id: Date.now(),
        type,
        actor: currentUser.name,
        description,
        timestamp: new Date().toLocaleString("fr-FR"),
        commentId,
        deliverableId,
      },
      ...current,
    ]);
  }

  /**
   * Qualifies a comment as a correction (in scope) or an addition (hors scope), with a clear title;
   * also used to change a qualification or send the request back to clarify.
   */
  function qualifyComment(commentId: number, qualified: Qualified) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    const back = qualified.decision === "À qualifier";
    setComments((current) =>
      current.map((comment) =>
        comment.id !== commentId
          ? comment
          : back
            ? { ...comment, decision: "À qualifier", kind: "remark" }
            : { ...comment, decision: qualified.decision, kind: "request", title: qualified.title, description: qualified.description || undefined },
      ),
    );
    recordAudit(
      "scope.classified",
      back ? "Demande remise à clarifier" : `Demande qualifiée « ${qualified.decision === "Inclus" ? "À traiter" : "Hors scope"} » : ${qualified.title}`,
      commentId,
    );
    setInspectorTab(back ? "comment" : qualified.decision === "Inclus" ? "correction" : "outside");
    if (qualified.quote && qualified.decision === "Hors périmètre" && proposalStateFor(commentId) !== "sent") {
      const quote = qualified.quote;
      setProposalStates((current) => ({ ...current, [commentId]: "draft" }));
      setProposalVersions((current) => {
        const history = (current[commentId] ?? []).filter((proposal) => proposal.status !== "draft");
        return {
          ...current,
          [commentId]: [
            ...history,
            {
              id: Date.now(),
              version: Math.max(...history.map((proposal) => proposal.version), 0) + 1,
              commentId,
              description: qualified.title,
              amount: quote.amount,
              deadline: quote.days,
              allowCounter: quote.counter,
              status: "draft",
              createdAt: new Date().toLocaleString("fr-FR"),
            },
          ],
        };
      });
      recordAudit("proposal.drafted", `Chiffrage préparé : ${quote.amount} € · ${quote.days} j`, commentId);
    }
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
    if (!adminOnly()) return;
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const taken = takeRecords(new Set(deliverables.filter((record) => (record.projectId ?? 1) === projectId).map((record) => record.id)));
    setProjects((current) => current.filter((candidate) => candidate.id !== projectId));
    putInTrash("project", project.name, clients.find((client) => client.id === (project.clientId ?? 1))?.name, { ...taken, clients: [], projects: [project] });
    recordAudit("project.deleted", `Projet « ${project.name} » placé dans la corbeille`);
    router.push(href.client(project.clientId ?? 1));
  }

  function deleteClient(clientId: number) {
    if (!adminOnly()) return;
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
    if (!adminOnly()) return;
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
  /** Renames every version of a deliverable; refused when its project already has that name. */
  function renameLivrable(livrableId: number, name: string): string | null {
    const versions = versionsOfLivrable(livrableId, deliverables);
    if (!versions[0]) return "Livrable introuvable.";
    const projectId = versions[0].projectId ?? 1;
    const ids = new Set(versions.map((record) => record.id));
    if (deliverables.some((record) => !ids.has(record.id) && (record.projectId ?? 1) === projectId && record.name.toLowerCase() === name.toLowerCase()))
      return "Un autre livrable porte déjà ce nom dans ce projet.";
    setDeliverables((current) => current.map((record) => (ids.has(record.id) ? { ...record, name } : record)));
    return null;
  }

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

  /**
   * Imports a file into the agency's storage (POST /api/files), under its place in the project;
   * returns its address, or null once the error is shown.
   */
  async function uploadFile(
    file: File,
    placement: { kind: "version"; projectId: number; livrableId: number; version: number } | { kind: "cover"; projectId: number; livrableId: number },
  ) {
    const form = new FormData();
    form.set("file", file);
    for (const [key, value] of Object.entries(placement)) form.set(key, String(value));
    const progress = toast.loading(`Import de « ${file.name} »…`);
    const response = await fetch("/api/files", { method: "POST", body: form }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { href?: string; error?: string } | null;
    toast.dismiss(progress);
    if (!response?.ok || !body?.href) {
      toast.error(body?.error ?? "L’import n’a pas abouti. Réessayez.");
      return null;
    }
    return body.href;
  }

  /** "Nouveau livrable" dialog: a new deliverable (version 1) in the current project. */
  async function createDeliverable(input: NewDeliverable) {
    const id = Date.now();
    const projectId = input.projectId ?? selectedProjectId;
    const [fileData, coverData] = await Promise.all([
      input.file ? uploadFile(input.file, { kind: "version", projectId, livrableId: id, version: 1 }) : Promise.resolve(undefined),
      input.cover ? uploadFile(input.cover, { kind: "cover", projectId, livrableId: id }) : Promise.resolve(undefined),
    ]);
    if (fileData === null || coverData === null) return;
    const created: Deliverable = {
      id,
      projectId,
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
    const activeDeliverable = currentDeliverable;
    const sameDeliverableVersions = deliverables.filter(
      (deliverable) => deliverable.projectId === selectedProjectId && deliverable.name === activeDeliverable?.name,
    );
    const nextVersion = mode === "version"
      ? Math.max(...sameDeliverableVersions.map((deliverable) => deliverable.version), 0) + 1
      : 1;
    const id = Date.now();
    // A new version is stored with its deliverable (the id of its first version); a new deliverable is its own.
    const livrableId = mode === "version" && activeDeliverable ? livrableIdOf(activeDeliverable, deliverables) : id;
    const fileData = await uploadFile(file, { kind: "version", projectId: selectedProjectId, livrableId, version: nextVersion });
    if (!fileData) return;
    const importedDeliverable: Deliverable = {
      id,
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

  /** Brings a pin to the middle of the canvas, keeping the zoom. */
  function centerOnPin(commentId: number) {
    const pin = document.querySelector<HTMLElement>(`[data-pin="${commentId}"]`);
    const zoom = transformRef.current;
    if (!pin || !zoom) return;
    void zoom.zoomToElement(pin, zoom.state.scale, 300);
  }

  /** Opens a thread from the inspector list: its pin comes into view with the conversation. */
  function focusThread(commentId: number) {
    setSelectedId(commentId);
    setComposer(null);
    setThreadOpen(true);
    requestAnimationFrame(() => centerOnPin(commentId));
  }

  /** A request created directly, already qualified (from the panel's ▾), with its optional quote. */
  function addRequest(request: Qualified) {
    if (isReadOnlyVersion || !currentDeliverable) return;
    const id = Math.max(...comments.map((comment) => comment.id), 0) + 1;
    const created: Comment = {
      id,
      deliverableId: currentDeliverable.id,
      author: currentUser.name,
      initials: "AM",
      time: "À l'instant",
      createdAt: Date.now(),
      message: request.description || request.title,
      location: "Livrable (général)",
      decision: request.decision,
      kind: "request",
      title: request.title,
      description: request.description || undefined,
      page: 1,
    };
    setComments((current) => [...current, created]);
    recordAudit("scope.classified", `Demande créée « ${request.decision === "Inclus" ? "À traiter" : "Hors scope"} » : ${request.title}`, id);
    if (request.quote && request.decision === "Hors périmètre") {
      const quote = request.quote;
      setProposalStates((current) => ({ ...current, [id]: "draft" }));
      setProposalVersions((current) => ({
        ...current,
        [id]: [{ id: Date.now(), version: 1, commentId: id, description: request.title, amount: quote.amount, deadline: quote.days, allowCounter: quote.counter, status: "draft", createdAt: new Date().toLocaleString("fr-FR") }],
      }));
    }
    setNewRequestKind(null);
    setInspectorTab(request.decision === "Inclus" ? "correction" : "outside");
    setSelectedId(id);
    toast(`Demande « ${request.title} » créée`);
  }

  /** Publishes a comment written on the canvas, or by hand (no position) from the panel. */
  function addComment(message: string, spot: CanvasComposer | null) {
    if (isReadOnlyVersion) return;
    const created: Comment = {
      id: Math.max(...comments.map((comment) => comment.id), 0) + 1,
      deliverableId: currentDeliverable.id,
      author: currentUser.name,
      initials: "AM",
      time: "À l'instant",
      createdAt: Date.now(),
      message,
      location: spot?.target ?? "Livrable (général)",
      decision: "À qualifier",
      kind: "remark",
      page: spot?.page ?? 1,
      position: spot ? { x: spot.x, y: spot.y } : undefined,
      area: spot?.area,
    };
    setComments((current) => [...current, created]);
    recordAudit("comment.created", "Commentaire agence ajouté", created.id);
    setSelectedId(created.id);
    setInspectorTab("comment");
    setComposer(null);
    setThreadOpen(true);
  }

  /** "Livrable — V03": title of copied / exported requests. */
  const exportTitle = currentDeliverable ? `${currentDeliverable.name} — V${String(currentDeliverable.version).padStart(2, "0")}` : "Demandes";
  function exportRequests() {
    const url = URL.createObjectURL(new Blob([threadsToMarkdown(exportTitle, activeComments)], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportTitle.replace(/[^\p{L}\p{N}]+/gu, "-")}-demandes.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function replyTo(commentId: number, message: string) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    const reply: Reply = { id: Date.now(), author: currentUser.name, initials: "AM", message, time: "À l'instant", createdAt: Date.now() };
    setComments((current) =>
      current.map((comment) => (comment.id === commentId ? { ...comment, replies: [...(comment.replies ?? []), reply] } : comment)),
    );
    recordAudit("reply.created", "Réponse agence ajoutée", commentId);
  }

  /** "Nouvelle version" from the menus: the previous version is frozen. */
  function importVersionFile(file: File) {
    const type = kindFromFile(file);
    if (!type) {
      setDeliverableError("Format non pris en charge. Choisissez une image, un PDF, une vidéo ou un document.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDeliverableError(`Fichier trop lourd : ${formatBytes(file.size)} (maximum ${formatBytes(MAX_FILE_BYTES)}).`);
      return;
    }
    setDeliverableError("");
    void confirmImport("version", { file, type });
  }

  /** A dropped / picked file becomes a new deliverable of the project. */
  function importLivrableFile(file: File) {
    const type = kindFromFile(file);
    if (!type) {
      toast("Format non pris en charge", { description: "Choisissez une image, un PDF, une vidéo ou un document." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast("Fichier trop lourd", { description: `${formatBytes(file.size)} (maximum ${formatBytes(MAX_FILE_BYTES)}).` });
      return;
    }
    void confirmImport("deliverable", { file, type });
  }

  /** Edits one of the agency's messages (0 = the comment itself). */
  function editMessage(commentId: number, messageId: number, message: string) {
    setComments((current) =>
      current.map((comment) =>
        comment.id !== commentId
          ? comment
          : messageId === 0
            ? { ...comment, message, edited: true }
            : { ...comment, replies: comment.replies?.map((reply) => (reply.id === messageId ? { ...reply, message, edited: true } : reply)) },
      ),
    );
  }

  /** Deletes one of the agency's replies. */
  function deleteMessage(commentId: number, replyId: number) {
    setComments((current) =>
      current.map((comment) => (comment.id === commentId ? { ...comment, replies: comment.replies?.filter((reply) => reply.id !== replyId) } : comment)),
    );
    toast("Message supprimé");
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
    toast("Commentaire supprimé", { action: { label: "Annuler", onClick: () => restoreComment(target) } });
    recordAudit("comment.deleted", "Commentaire agence supprimé", commentId);
  }

  /** Double-click a pin, then click: the comment moves there (its drawn area follows). */
  function moveComment(commentId: number, page: number, x: number, y: number) {
    if (isReadOnlyVersion) return;
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
  function restoreComment(removed: Comment) {
    setComments((current) => (current.some((comment) => comment.id === removed.id) ? current : [...current, removed].sort((a, b) => a.id - b.id)));
  }


  /** What still needs the agency: every comment still to clarify (not yet a correction or hors scope). */
  function needsQualification(comment: Comment) {
    return requestKind(comment) === "comment";
  }

  function approveVersion() {
    const blockingComments = comments.filter(
      (comment) => needsQualification(comment),
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
    const source = comments.find((comment) => comment.id === commentId);
    setNewProposalDescription(existingProposal?.description ?? source?.title ?? source?.message ?? "");
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
    if (proposalCommentId === null || !adminOnly()) return;
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
      [proposalCommentId]: current[proposalCommentId]?.some((proposal) => proposal.status !== "draft")
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

  /** Sends the quoted proposal after confirmation: the draft becomes version 1, sent to the client. */
  function sendQuotedProposal(commentId: number) {
    const draft = proposalVersions[commentId]?.find((proposal) => proposal.status === "draft");
    if (!draft || isReadOnlyVersion || !adminOnly()) return;
    setProposalVersions((current) => ({
      ...current,
      [commentId]: (current[commentId] ?? []).map((proposal) =>
        proposal.id === draft.id ? { ...proposal, status: "sent" as const, createdAt: new Date().toLocaleString("fr-FR") } : proposal,
      ),
    }));
    setProposalStates((current) => ({ ...current, [commentId]: "sent" }));
    setProposalDecisions((current) => ({ ...current, [commentId]: "none" }));
    recordAudit("proposal.sent", `Proposition envoyée au client : ${formatProposalAmount(draft.amount)} · ${formatProposalDeadline(draft.deadline)}`, commentId);
    setConfirmSendId(null);
  }

  function activeProposalFor(commentId: number) {
    return proposalVersions[commentId]?.find((proposal) => proposal.status === "sent" || proposal.status === "accepted") ?? proposalVersions[commentId]?.at(-1);
  }

  /** Opens the quote form on a refused proposal. */
  function openRequote(commentId: number) {
    if (isReadOnlyVersion) return;
    const existing = activeProposalFor(commentId);
    const source = comments.find((comment) => comment.id === commentId);
    setProposalCommentId(commentId);
    setNewProposalDescription(existing?.description ?? source?.title ?? source?.message ?? "");
    setNewProposalAmount(existing ? String(parseNumericAmount(existing.amount)) : "");
    setNewProposalDeadline(existing ? String(parseNumericDays(existing.deadline)) : "");
    setNewProposalCounter(existing?.allowCounter ?? false);
    setProposalOpen(false);
    setRequoting(true);
    setNewProposalVersionOpen(true);
  }

  /** New quote after a refusal: the refused version stays in the history, the new one waits to be sent. */
  function saveRequote(commentId: number) {
    // Re-quoting drops the client's pending counter-proposal: that answers it.
    if (adaptationRequests[commentId] && !adaptationRequests[commentId].decision && !adminOnly()) return;
    const history = proposalVersions[commentId] ?? [];
    const adaptation = adaptationRequests[commentId];
    const nextVersion = Math.max(...history.map((proposal) => proposal.version), 0) + 1;
    setProposalVersions((current) => ({
      ...current,
      [commentId]: [
        ...(current[commentId] ?? [])
          .filter((proposal) => proposal.status !== "draft")
          .map((proposal) =>
            proposal.status === "sent" ? { ...proposal, status: "refused" as const, adaptation: adaptation?.message } : proposal,
          ),
        {
          id: Date.now(),
          version: nextVersion,
          commentId,
          description: newProposalDescription.trim(),
          amount: parseNumericAmount(newProposalAmount),
          deadline: parseNumericDays(newProposalDeadline),
          allowCounter: newProposalCounter,
          status: "draft",
          createdAt: new Date().toLocaleString("fr-FR"),
        },
      ],
    }));
    setProposalStates((current) => ({ ...current, [commentId]: "draft" }));
    setProposalDecisions((current) => ({ ...current, [commentId]: "none" }));
    setAdaptationRequests((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
    recordAudit("proposal.drafted", `Nouveau chiffrage v${nextVersion} après refus`, commentId);
    setNewProposalVersionOpen(false);
    setRequoting(false);
    toast(`Version ${nextVersion} chiffrée · à envoyer au client`);
  }

  function sendNewProposalVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion) return;
    if (requoting && proposalCommentId !== null) {
      if (!newProposalDescription.trim() || !newProposalAmount.trim() || !newProposalDeadline.trim()) return;
      saveRequote(proposalCommentId);
      return;
    }
    if (
      proposalCommentId === null ||
      !newProposalDescription.trim() ||
      !newProposalAmount.trim() ||
      !newProposalDeadline.trim() ||
      !adminOnly()
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
            allowCounter: newProposalCounter,
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
    if (isReadOnlyVersion || !adaptationRequests[commentId] || !adminOnly()) return;
    const decisionAt = new Date().toLocaleString("fr-FR");
    setAdaptationRequests((current) => ({
      ...current,
      [commentId]: { ...current[commentId], decision, decisionBy: currentUser.name, decisionAt },
    }));
    recordAudit(
      "proposal.adaptation-decision",
      `Demande d'adaptation ${decision === "accepted" ? "acceptée" : "refusée"}`,
      commentId,
    );
  }

  /** Proof of the open version, built by the server from its database (src/db/proof.ts). */
  async function exportProof() {
    if (!currentDeliverable) return;
    // Opened at once, in the click: browsers block windows opened after an await.
    const exportWindow = window.open("", "_blank");
    if (!exportWindow) return;
    exportWindow.document.title = "Préparation de la preuve…";
    exportWindow.document.body.textContent = "Préparation de la preuve…";
    // What was just changed here must be in it.
    await flushSharedState();
    const response = await fetch(`/api/proof/${currentDeliverable.id}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      exportWindow.document.body.textContent = "La preuve n’a pas pu être générée. Réessayez.";
      return;
    }
    const parsed = new DOMParser().parseFromString(proofHtml(await response.json()), "text/html");
    exportWindow.document.documentElement.replaceWith(exportWindow.document.importNode(parsed.documentElement, true));
    exportWindow.focus();
  }

  /** Review link of the open version, created when missing (share dialog, client preview). */
  function ensureReviewLink(): ReviewLink {
    const linkKey = `${currentDeliverable.id}:${currentDeliverable.version}`;
    const existingLink = reviewLinks[linkKey];

    if (!existingLink || !existingLink.active) {
      const newLink = createReviewLink(currentDeliverable.id, currentDeliverable.version);
      setReviewLinks((current) => ({ ...current, [linkKey]: newLink }));
      setReviewLink(newLink);
      return newLink;
    }
    setReviewLink(existingLink);
    return existingLink;
  }

  function openShareDialog() {
    ensureReviewLink();
    setLinkCopied(false);
    setShareOpen(true);
  }

  /** The page the client sees, in a new tab (the link is saved before the tab reads it). */
  function openClientPreview() {
    const link = ensureReviewLink();
    window.setTimeout(() => window.open(`/review/${link.token}`, "_blank", "noopener"), 50);
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
  /** Tabs and cards alert on client messages (comments and replies) nobody has opened yet. */
  function statusOf(latest: Deliverable): TabStatus {
    const latestComments = comments.filter((comment) => comment.deliverableId === latest.id);
    const unread = unreadOf(latest.id).length;
    const awaitingClient = latestComments.filter(
      (comment) =>
        comment.decision === "Hors périmètre" &&
        proposalStateFor(comment.id) === "sent" &&
        proposalDecisionFor(comment.id) === "none",
    ).length;
    return latest.reviewStatus === "changes-requested"
        ? { kind: "changes-requested" }
        : unread > 0
          ? { kind: "messages", count: unread }
          : awaitingClient > 0
            ? { kind: "awaiting-client", count: awaitingClient }
            : latest.reviewStatus === "approved"
              ? { kind: "approved" }
              : { kind: "none" };
  }

  /** Unread messages written in the client space on one version: comments, then replies. */
  function unreadOf(recordId: number): ClientFeedback[] {
    const record = deliverables.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    const context = [client?.name, `${record.name} V${String(record.version).padStart(2, "0")}`].filter(Boolean).join(" · ");
    const fromClient = (initials: string) => initials !== "AM";
    return comments
      .filter((comment) => comment.deliverableId === recordId)
      .flatMap((comment) => {
        const target = `${hrefForRecord(record, deliverables)}?demande=${comment.id}`;
        return [comment, ...(comment.replies ?? [])]
          .filter((message) => fromClient(message.initials) && !seenIds.includes(message.id))
          .map((message) => ({
            key: `m-${message.id}`,
            id: message.id,
            kind: "message" as const,
            author: message.author,
            initials: message.initials,
            message: message.message,
            time: message.time,
            createdAt: message.createdAt ?? (message.id > 1e12 ? message.id : undefined),
            context,
            href: target,
          }));
      });
  }
  // Notifications: every unread client message, newest first, plus what the client asked on whole versions.
  const clientFeedback: ClientFeedback[] = [
    ...deliverables.flatMap((record) => {
      const latest = versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0];
      if (latest?.id !== record.id || record.reviewStatus !== "changes-requested") return [];
      const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
      const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
      return [
        {
          key: `changes-${record.id}`,
          id: record.id,
          kind: "changes" as const,
          author: client?.name ?? "Le client",
          initials: (client?.name ?? "?").charAt(0).toUpperCase(),
          message: "Modifications demandées sur cette version",
          time: "",
          context: [client?.name, `${record.name} V${String(record.version).padStart(2, "0")}`].filter(Boolean).join(" · "),
          href: hrefForRecord(record, deliverables),
        },
      ];
    }),
    ...deliverables.flatMap((record) => unreadOf(record.id)).sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)),
  ];
  const markAllRead = () => markSeen(clientFeedback.filter((item) => item.kind === "message").map((item) => item.id));

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
      if (needsQualification(comment))
        todoItems.push({ key: `qualify-${comment.id}`, kind: "to-qualify", title: "Commentaire à clarifier", excerpt: comment.message, context, meta: [comment.author, comment.time].filter(Boolean).join(" · "), href: commentHref });
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

  // Home overview for a set of deliverables (null = all). Each home section has its own selection.
  // Proposals count whatever version they were raised on.
  function overviewFor(selection: number[] | null): HomeOverview {
    const chosen = selection === null ? null : new Set(selection);
    const scopeRecords = chosen ? deliverables.filter((record) => chosen.has(livrableIdOf(record, deliverables))) : deliverables;
    const scopeIds = new Set(scopeRecords.map((record) => record.id));
    const scopeComments = comments.filter((comment) => scopeIds.has(comment.deliverableId ?? -1));
    const outsideComments = scopeComments.filter((comment) => comment.decision === "Hors périmètre");
    const sumAmounts = (list: Comment[]) =>
      list.reduce((total, comment) => total + parseNumericAmount(activeProposalFor(comment.id)?.amount), 0);
    const acceptedComments = outsideComments.filter((comment) => proposalDecisionFor(comment.id) === "accepted");
    const pendingComments = outsideComments.filter(
      (comment) => proposalStateFor(comment.id) === "sent" && proposalDecisionFor(comment.id) === "none",
    );
    const latestIds = new Set(
      scopeRecords
        .filter((record) => versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0]?.id === record.id)
        .map((record) => record.id),
    );
    const latestComments = scopeComments.filter((comment) => latestIds.has(comment.deliverableId ?? -1));
    const qualified = latestComments.filter((comment) => requestKind(comment) !== "comment");
    const figuresOf = (recordIds: Set<number>) => {
      const own = scopeComments.filter((comment) => recordIds.has(comment.deliverableId ?? -1));
      return {
        toQualify: own.filter((comment) => latestIds.has(comment.deliverableId ?? -1) && (needsQualification(comment))).length,
        outside: own.filter((comment) => comment.decision === "Hors périmètre").length,
        acceptedEuros: sumAmounts(acceptedComments.filter((comment) => recordIds.has(comment.deliverableId ?? -1))),
      };
    };
    const breakdown: HomeOverview["breakdown"] = chosen
      ? {
          kind: "livrable",
          rows: scopeRecords
            .filter((record) => latestIds.has(record.id))
            .map((record) => {
              const versions = versionsOfLivrable(livrableIdOf(record, deliverables), deliverables);
              return {
                key: `l${record.id}`,
                label: record.name,
                href: hrefForRecord(record, deliverables),
                counts: [versions.length],
                ...figuresOf(new Set(versions.map((version) => version.id))),
              };
            }),
        }
      : {
          kind: "space",
          rows: clients.map((client) => {
            const projectIds = new Set(projects.filter((project) => (project.clientId ?? 1) === client.id).map((project) => project.id));
            const recordIds = new Set(deliverables.filter((record) => projectIds.has(record.projectId ?? 1)).map((record) => record.id));
            return {
              key: `s${client.id}`,
              label: client.name,
              href: href.client(client.id),
              client,
              counts: [projectIds.size, [...latestIds].filter((id) => recordIds.has(id)).length],
              ...figuresOf(recordIds),
            };
          }),
        };
    const decided = outsideComments.filter((comment) => proposalDecisionFor(comment.id) !== "none");
    const analytics: HomeAnalyticsData = {
      totalDemands: scopeComments.length,
      included: scopeComments.filter((comment) => comment.decision === "Inclus").length,
      outside: outsideComments.length,
      pending: scopeComments.filter((comment) => needsQualification(comment)).length,
      quotedEuros: sumAmounts(outsideComments),
      acceptedEuros: sumAmounts(acceptedComments),
      acceptedDays: acceptedComments.reduce((total, comment) => total + parseNumericDays(activeProposalFor(comment.id)?.deadline), 0),
      acceptedCount: acceptedComments.length,
      refusedCount: outsideComments.filter((comment) => proposalDecisionFor(comment.id) === "refused").length,
      awaitingCount: pendingComments.length,
      versions: scopeRecords.length,
      register: [...scopeComments]
        .sort((left, right) => right.id - left.id)
        .map((comment) => {
          const record = deliverables.find((candidate) => candidate.id === comment.deliverableId);
          const proposal = comment.decision === "Hors périmètre" ? activeProposalFor(comment.id) : undefined;
          return {
            id: comment.id,
            livrable: record?.name ?? "Livrable",
            version: `V${String(record?.version ?? 1).padStart(2, "0")}`,
            message: comment.title ?? comment.message,
            location: comment.location,
            initials: comment.initials,
            decision: comment.decision,
            amount: proposal ? formatProposalAmount(proposal.amount) : undefined,
            deadline: proposal ? formatProposalDeadline(proposal.deadline) : undefined,
            clientDecision: proposalDecisionFor(comment.id),
            href: record ? `${hrefForRecord(record, deliverables)}?demande=${comment.id}` : href.home(),
          };
        }),
    };
    return {
      acceptedEuros: sumAmounts(acceptedComments),
      acceptedCount: acceptedComments.length,
      acceptedDays: analytics.acceptedDays,
      pendingEuros: sumAmounts(pendingComments),
      pendingCount: pendingComments.length,
      toQualify: latestComments.filter(needsQualification).length,
      outsideRate: qualified.length ? Math.round((qualified.filter((comment) => comment.decision === "Hors périmètre").length / qualified.length) * 100) : null,
      conversionRate: decided.length ? Math.round((acceptedComments.length / decided.length) * 100) : null,
      totalDemands: scopeComments.length,
      approved: deliverables.filter((record) => latestIds.has(record.id) && record.reviewStatus === "approved").length,
      livrables: latestIds.size,
      breakdown,
      analytics,
    };
  }
  // Filter choices of the home sections: deliverables grouped by "space / project".
  const livrableGroups: LivrableGroup[] = projects
    .map((project) => ({
      key: `p${project.id}`,
      label: [clients.find((client) => client.id === (project.clientId ?? 1))?.name, project.name].filter(Boolean).join(" / "),
      livrables: deliverables
        .filter((record) => versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0]?.id === record.id)
        .filter((record) => (record.projectId ?? 1) === project.id)
        .map((record) => ({ id: livrableIdOf(record, deliverables), name: record.name })),
    }))
    .filter((group) => group.livrables.length > 0);

  // ⌘K palette index: everything reachable, plus a few actions.
  const contextOf = (record: Deliverable) => {
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    return [client?.name, project?.name].filter(Boolean).join(" / ");
  };
  const latestRecords = deliverables.filter(
    (record) => versionsOfLivrable(livrableIdOf(record, deliverables), deliverables)[0]?.id === record.id,
  );
  // Most common first: home, then creating a project, then a deliverable.
  const paletteActions: PaletteItem[] = [
    { id: "action-home", group: "Actions", label: "Accueil", href: href.home(), icon: House },
    { id: "action-project", group: "Créer", label: "Nouveau projet", run: () => setNewProjectOpen(true), icon: FolderPlus },
    { id: "action-livrable", group: "Créer", label: "Nouveau livrable", run: () => setNewDeliverableOpen(true), icon: FilePlus },
    { id: "action-client", group: "Créer", label: "Nouvel espace", run: () => setNewClientOpen(true), icon: Users },
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
    ...paletteActions.slice(1),
  ];

  /** Where the client's answer stands, shown as a status badge. */
  const proposalStatusOf = (commentId: number) => {
    const adaptation = adaptationRequests[commentId];
    if (proposalStateFor(commentId) === "draft") return { label: "À envoyer", tone: "decision-pending", retry: false };
    if (proposalDecisionFor(commentId) === "accepted") return { label: "Acceptée", tone: "decision-included", retry: false };
    if (proposalDecisionFor(commentId) === "refused") return { label: "Refusée", tone: "decision-refused", retry: true };
    if (adaptation?.decision === "accepted") return { label: "Adaptation acceptée", tone: "decision-included", retry: false };
    if (adaptation?.decision === "refused") return { label: "Adaptation refusée", tone: "decision-refused", retry: true };
    if (adaptation) return { label: "Adaptation demandée", tone: "decision-pending", retry: false };
    return { label: "En attente du client", tone: "decision-sent", retry: false };
  };
  const versionStatusLabel = (proposal: ProposalVersion) =>
    proposal.status === "refused"
      ? proposal.adaptation
        ? "Adaptation refusée"
        : "Refusée"
      : proposal.status === "accepted"
        ? "Acceptée"
        : proposal.status === "superseded"
          ? "Remplacée"
          : proposal.status === "draft"
            ? "À envoyer"
            : "En attente du client";

  /** Where the proposal of an out-of-scope request stands: to quote, quoted (ready to send), or sent. */
  const proposalStageOf = (comment: Comment): ProposalStage | null => {
    if (comment.decision !== "Hors périmètre") return null;
    const state = proposalStateFor(comment.id);
    if (state === "sent") return { stage: "sent", label: proposalLabel(comment) ?? "Voir la proposition", retry: proposalStatusOf(comment.id).retry };
    return state === "draft" ? { stage: "draft" } : { stage: "none" };
  };

  /** Next step of an out-of-scope request, used as the label of its proposal button. */
  const proposalLabel = (comment: Comment) =>
    comment.decision !== "Hors périmètre"
      ? null
      : proposalDecisionFor(comment.id) === "accepted" || adaptationRequests[comment.id]?.decision === "accepted"
        ? "Proposition acceptée · voir"
        : proposalDecisionFor(comment.id) === "refused" || adaptationRequests[comment.id]?.decision === "refused"
          ? "Proposition refusée · voir"
          : adaptationRequests[comment.id] && !adaptationRequests[comment.id].decision
            ? "Répondre à l’adaptation"
            : proposalStateFor(comment.id) === "sent"
              ? "Voir la proposition envoyée"
              : proposalStateFor(comment.id) === "draft"
                ? "Envoyer la proposition"
                : "Chiffrer";

  // Deliverable workspace (canvas, dashboard, proposals): everything below is about this deliverable.
  const livrableRootId = "livrableId" in view ? view.livrableId : 0;
  const latestVersionRecord = viewVersions[0];

  // Under the deliverable name (panel title): shortcuts for this deliverable only.
  const livrableMenu: MenuEntry[] = [
    { kind: "section", label: "Ce livrable" },
    { label: "Importer une nouvelle version", icon: <Upload />, onFile: importVersionFile, accept: "application/pdf,image/*,video/*" },
    { label: "Partager la revue", icon: <Share2 />, onSelect: openShareDialog },
    { label: "Aperçu client", icon: <Eye />, onSelect: openClientPreview },
    { kind: "section", label: "Suivi" },
    { label: "Rouvrir la validation", icon: <RotateCcw />, onSelect: () => { setChangesMessage(""); setChangesOpen(true); } },
    { label: "Synthèse & export", icon: <FileCheck />, onSelect: () => setProofOpen(true) },
    { label: "Historique & journal", icon: <ScrollText />, onSelect: () => setHistoryOpen(true) },
    { kind: "section", label: "Organisation" },
    { label: "Renommer…", icon: <Pencil />, onSelect: () => { setRenameError(""); setRenameOpen(true); } },
    {
      label: favorites.includes(`l:${livrableRootId}`) ? "Retirer des favoris" : "Épingler aux favoris",
      icon: <Star />,
      onSelect: () => toggleFavorite(`l:${livrableRootId}`),
    },
    { label: "Voir le projet", icon: <FolderClosed />, href: href.project(selectedProjectId) },
  ];

  // Under the logo: Kora's main menu.
  const systemMenu: MenuEntry[] = [
    { kind: "section", label: "Nouveau" },
    { label: "Nouveau livrable", icon: <FilePlus />, onSelect: () => setNewDeliverableOpen(true) },
    { label: "Nouvelle version", icon: <Upload />, onFile: importVersionFile, accept: "application/pdf,image/*,video/*" },
    { kind: "section", label: "Fichier" },
    { label: "Synthèse & export", icon: <FileCheck />, onSelect: () => setProofOpen(true) },
    { label: "Historique & journal", icon: <ScrollText />, onSelect: () => setHistoryOpen(true) },
    { label: "Rechercher", icon: <Search />, hint: "Ctrl K", onSelect: () => setPaletteOpen(true) },
    { kind: "section", label: "Aide et réglages" },
    { label: "Raccourcis clavier", icon: <Keyboard />, onSelect: () => setShortcutsOpen(true) },
    { label: "Préférences", icon: <Settings />, hint: "Bientôt", disabled: true },
    { label: "Aide et documentation", icon: <CircleHelp />, hint: "Bientôt", disabled: true },
  ];

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
  const inProject = view.kind === "deliverable" && Boolean(selectedProject);
  // Deliverables of the open project (latest version of each), for the side panel.
  const projectLivrables: SidebarLivrable[] = [
    ...new Set(deliverables.filter((record) => (record.projectId ?? 1) === selectedProjectId).map((record) => livrableIdOf(record, deliverables))),
  ]
    .map((livrableId) => versionsOfLivrable(livrableId, deliverables)[0])
    .filter((record): record is Deliverable => Boolean(record))
    .map((record) => ({ id: record.id, name: record.name, href: hrefForRecord(record, deliverables), active: livrableIdOf(record, deliverables) === livrableRootId }));

  const sidebarVersions: SidebarVersion[] = viewVersions.map((record) => ({
    id: record.id,
    label: `V${String(record.version).padStart(2, "0")}`,
    meta: [record.importedAt, record.reviewStatus === "approved" ? "approuvée" : null].filter(Boolean).join(" · "),
    href: hrefForRecord(record, deliverables),
    active: view.kind === "deliverable" && record.id === viewRecord?.id,
    frozen: Boolean(record.locked || record.status === "Approuvée" || record.status === "Remplacée"),
  }));

  return (
    <div className="app-frame">
    {newDeliverableOpen && (
      <NewDeliverableDialog
        existingNamesFor={(projectId) => deliverables.filter((record) => (record.projectId ?? 1) === projectId).map((record) => record.name)}
        defaultProjectId={selectedProjectId}
        // Outside a project (home, palette…), the dialog asks where the deliverable goes.
        projects={
          viewProjectId === null
            ? projects.map((project) => ({ id: project.id, label: [clients.find((client) => client.id === (project.clientId ?? 1))?.name, project.name].filter(Boolean).join(" / ") }))
            : undefined
        }
        onClose={() => setNewDeliverableOpen(false)}
        onCreate={createDeliverable}
      />
    )}
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} suggestions={paletteSuggestions} />
    <TabBar
      tabs={tabInfos}
      activeLivrableId={viewLivrableId}
      homeActive={viewLivrableId === null}
      onClose={closeTab}
      onOpen={() => setPaletteOpen(true)}
    />
    <main className="app-shell">
      {inProject && selectedProject ? (
        <ProjectSidebar
          panelWidth={panelWidths.panel}
          onPanelResize={(width) => resizePanel("panel", width)}
          project={selectedProject}
          client={clients.find((client) => client.id === (selectedProject.clientId ?? 1))}
          livrableName={viewVersions[0]?.name ?? "Livrable"}
          livrableMenu={livrableMenu}
          systemMenu={systemMenu}
          versions={sidebarVersions}
          view={view}
          panel={sidebarPanel}
          onPanel={showPanel}
          canvasHref={href.deliverable(selectedProject.id, livrableRootId)}
          onNavigate={(target) => router.push(target)}
          notifications={notifications}
          feedback={clientFeedback}
          onMarkAllRead={markAllRead}
          livrables={projectLivrables}
          onImportVersion={importVersionFile}
          onImportLivrable={importLivrableFile}
        />
      ) : (
        <HomeSidebar
          view={view}
          clients={clients}
          favorites={sidebarFavorites}
          notifications={notifications}
          feedback={clientFeedback}
          onMarkAllRead={markAllRead}
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
              canManage={canManage}
              onMoveProject={moveProject}
              onMoveLivrable={moveLivrable}
              onDeleteLivrable={deleteLivrable}
              onRenameLivrable={renameLivrable}
              trash={trash}
              onRestore={restoreFromTrash}
              onPurge={purgeFromTrash}
              overviewFor={overviewFor}
              livrableGroups={livrableGroups}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              livrableStatus={(livrableId) => {
                const latest = versionsOfLivrable(livrableId, deliverables)[0];
                return latest ? statusOf(latest) : { kind: "none" };
              }}
              livrableUnread={(livrableId) => {
                const latest = versionsOfLivrable(livrableId, deliverables)[0];
                return latest ? unreadOf(latest.id).length : 0;
              }}
            />
          ) : view.kind === "dashboard" || !currentDeliverable ? (
            // No deliverable yet: the agency's data is still loading (a new agency starts empty), or the
            // address points to nothing (the effect above then leaves for the home page).
            null
          ) : (
            <>
          <div className="editor" style={{ gridTemplateColumns: `minmax(0, 1fr) ${panelWidths.inspector}px` }}>
            {/* Same name as the deliverable card cover: the cover grows into the canvas on open. */}
            <ViewTransition name={`livrable-${livrableRootId}`} share="kora-open" default="none">
            <ReviewCanvas
              deliverable={currentDeliverable}
              comments={activeComments}
              selectedId={selectedComment?.id ?? null}
              threadOpen={threadOpen}
              readOnly={isReadOnlyVersion}
              tool={canvasTool}
              tools={["move", "remark"]}
              onToolChange={setCanvasTool}
              composer={composer}
              onCompose={(next) => {
                setThreadOpen(false);
                setComposer(next);
              }}
              onPinClick={(comment) => {
                setComposer(null);
                setSelectedId(comment.id);
                setThreadOpen((open) => !(open && comment.id === selectedComment?.id));
                setInspectorTab(requestKind(comment));
              }}
              onBackgroundClick={() => {
                setThreadOpen(false);
                setComposer(null);
              }}
              transformRef={transformRef}
              canMove={() => true}
              onMovePin={moveComment}
              toolbarExtra={
                <>
                <CanvasImportButton onFile={importVersionFile} disabled={!currentDeliverable} />
                <MenuButton
                  className="tool-button"
                  label="Copier ou exporter les demandes"
                  trigger={<Download />}
                  side="top"
                  align="center"
                  tooltip
                  entries={[
                    {
                      label: "Copier les demandes",
                      icon: <Copy />,
                      disabled: activeComments.length === 0,
                      onSelect: () => void navigator.clipboard?.writeText(threadsToMarkdown(exportTitle, activeComments)),
                    },
                    { label: "Exporter (.md)", icon: <FileDown />, disabled: activeComments.length === 0, onSelect: exportRequests },
                  ]}
                />
                </>
              }
              overlay={
                <>
                  {isReadOnlyVersion && latestVersionRecord && (
                    <div className="canvas-banner" role="status">
                      <span className="canvas-banner-icon" aria-hidden="true">
                        <Lock />
                      </span>
                      <span className="canvas-banner-text">
                        <b>V{String(currentDeliverable.version).padStart(2, "0")} · lecture seule</b>
                        <small>{currentDeliverable.status === "Approuvée" || approved ? "Version validée par le client" : "Une version plus récente existe"}</small>
                      </span>
                      {latestVersionRecord.id !== currentDeliverable.id && (
                        <Button asChild size="sm">
                          <Link href={hrefForRecord(latestVersionRecord, deliverables)}>
                            Aller à la V{String(latestVersionRecord.version).padStart(2, "0")} <ArrowRight />
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                  {deliverableError && (
                    <div className="canvas-error" role="alert">
                      {deliverableError}
                      <button className="thread-icon-button" onClick={() => setDeliverableError("")} aria-label="Fermer le message">
                        <X />
                      </button>
                    </div>
                  )}
                </>
              }
              renderThread={(comment) => (
                <ThreadPopover
                  key={`${comment.id}-${comment.decision}-${quotingId === comment.id ? "quote" : "view"}`}
                  comment={comment}
                  readOnly={isReadOnlyVersion}
                  locked={isDecisionLocked(comment.id)}
                  proposal={proposalStageOf(comment as Comment) ?? undefined}
                  startQuoting={quotingId === comment.id}
                  onSendProposal={() => setConfirmSendId(comment.id)}
                  quote={(() => {
                    const draft = proposalStateFor(comment.id) === "draft" ? activeProposalFor(comment.id) : undefined;
                    return draft ? { amount: parseNumericAmount(draft.amount), days: parseNumericDays(draft.deadline), counter: draft.allowCounter ?? false } : undefined;
                  })()}
                  onReply={(message) => replyTo(comment.id, message)}
                  me="AM"
                  onEditMessage={(messageId, message) => editMessage(comment.id, messageId, message)}
                  onDeleteMessage={(messageId) => deleteMessage(comment.id, messageId)}
                  // Once a proposal has been sent to the client, the qualification no longer changes.
                  onQualify={
                    proposalStateFor(comment.id) === "sent"
                      ? undefined
                      : (qualified) => {
                          qualifyComment(comment.id, qualified);
                          setQuotingId(null);
                        }
                  }
                  onOpenProposal={() => openProposal(comment.id)}
                  onDelete={
                    comment.initials === "AM" && !isReadOnlyVersion && !isDecisionLocked(comment.id)
                      ? () => {
                          deleteComment(comment.id);
                          setThreadOpen(false);
                        }
                      : undefined
                  }
                  onClose={() => {
                    setThreadOpen(false);
                    setQuotingId(null);
                  }}
                />
              )}
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
            </ViewTransition>

            <EditorInspector
              comments={activeComments}
              selectedId={threadOpen ? (selectedComment?.id ?? null) : null}
              tab={inspectorTab}
              onTab={setInspectorTab}
              onFocus={focusThread}
              proposalStage={(comment) => proposalStageOf(comment as Comment)}
              onQuote={(commentId) => {
                setQuotingId(commentId);
                focusThread(commentId);
              }}
              onSendProposal={setConfirmSendId}
              onOpenProposal={openProposal}
              onRequote={openRequote}
              proposalSummary={(comment) => {
                if (proposalStateFor(comment.id) === "none") return null;
                const proposal = activeProposalFor(comment.id);
                const status = proposalStatusOf(comment.id);
                return (
                  <span className="client-proposal-line">
                    <b>{formatProposalAmount(proposal?.amount)} HT</b>
                    <span>{formatProposalDeadline(proposal?.deadline)}</span>
                    {(proposalVersions[comment.id]?.length ?? 0) > 1 && <span>V{proposal?.version}</span>}
                    <span className={`decision-badge ${status.tone}`}>{status.label}</span>
                  </span>
                );
              }}
              onAddRequest={isReadOnlyVersion ? undefined : setNewRequestKind}
              onShare={openShareDialog}
              onPreview={openClientPreview}
              width={panelWidths.inspector}
              onResize={(width) => resizePanel("inspector", width)}
            />
          </div>
          </>
        )}
          <NewRequestDialog initial={newRequestKind} onClose={() => setNewRequestKind(null)} onCreate={addRequest} />
          {/* Sent proposal: status, history and the next step (adaptation, new version). */}
          {(() => {
            const id = proposalCommentId ?? 0;
            const sent = proposalStateFor(id) === "sent";
            const proposal = activeProposalFor(id);
            const status = proposalStatusOf(id);
            const source = comments.find((comment) => comment.id === id);
            const history = (proposalVersions[id] ?? []).filter((version) => version.id !== proposal?.id).sort((left, right) => right.version - left.version);
            const adaptationPending = Boolean(selectedAdaptationRequest && !selectedAdaptationRequest.decision);
            const openNewVersion = () => {
              setNewProposalDescription(proposal?.description ?? "");
              setNewProposalAmount(proposal ? String(parseNumericAmount(proposal.amount)) : "");
              setNewProposalDeadline(proposal ? String(parseNumericDays(proposal.deadline)) : "");
              setNewProposalCounter(proposal?.allowCounter ?? false);
              setRequoting(false);
              setNewProposalVersionOpen(true);
            };
            return (
              <Modal
                open={proposalOpen}
                onClose={() => setProposalOpen(false)}
                title={sent ? `Proposition · demande n°${id}` : "Créer une proposition"}
                description={sent ? (source?.title ?? source?.message) : "Transformez ce retour en accord clair avant de commencer le travail."}
                footer={
                  !sent ? (
                    <>
                      {!canManage && <span className="mr-auto self-center text-xs text-muted-foreground">Envoi réservé aux administrateurs de l’agence</span>}
                      <Button onClick={sendProposal} disabled={!canManage || !newProposalDescription.trim() || !newProposalAmount.trim() || !newProposalDeadline.trim()}>
                        Envoyer au client
                      </Button>
                    </>
                  ) : isReadOnlyVersion ? (
                    <Button variant="outline" onClick={() => setProposalOpen(false)}>
                      Fermer
                    </Button>
                  ) : status.retry ? (
                    <>
                      <Button variant="outline" onClick={() => setProposalOpen(false)}>
                        Fermer
                      </Button>
                      <Button onClick={() => openRequote(id)}>Faire une nouvelle proposition</Button>
                    </>
                  ) : adaptationPending ? (
                    <>
                      {!canManage && <span className="mr-auto self-center text-xs text-muted-foreground">Réponse réservée aux administrateurs de l’agence</span>}
                      <Button variant="outline" disabled={!canManage} onClick={() => decideAdaptation(id, "refused")}>
                        Refuser l’adaptation
                      </Button>
                      {selectedAdaptationRequest?.budget !== undefined && (
                        <Button variant="outline" disabled={!canManage} onClick={() => decideAdaptation(id, "accepted")}>
                          Accepter l’adaptation
                        </Button>
                      )}
                      <Button disabled={!canManage} onClick={openNewVersion}>Répondre par une nouvelle version</Button>
                    </>
                  ) : status.label === "En attente du client" ? (
                    <>
                      <Button variant="outline" onClick={() => setProposalOpen(false)}>
                        Fermer
                      </Button>
                      <Button variant="outline" onClick={openNewVersion}>
                        Modifier (nouvelle version)
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => setProposalOpen(false)}>
                      Fermer
                    </Button>
                  )
                }
              >
                {sent ? (
                  <>
                    <div className="proposal-status-line">
                      <span className="text-muted-foreground">Statut</span>
                      <span className={`decision-badge ${status.tone}`}>{status.label}</span>
                      {proposal && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          V{proposal.version} · envoyée le {proposal.createdAt}
                        </span>
                      )}
                    </div>
                    <div className="proposal-summary">
                      <div>
                        <span>Prestation</span>
                        <b>{proposal?.description ?? "—"}</b>
                      </div>
                      <div>
                        <span>Montant</span>
                        <b>{formatProposalAmount(proposal?.amount ?? 0)} HT</b>
                      </div>
                      <div>
                        <span>Impact planning</span>
                        <b>{formatProposalDeadline(proposal?.deadline ?? 0)}</b>
                      </div>
                      <div>
                        <span>Contre-proposition</span>
                        <b>{proposal?.allowCounter === false ? "Non autorisée · un refus est définitif" : "Autorisée"}</b>
                      </div>
                    </div>
                    {selectedAdaptationRequest && (
                      <div className="proposal-note">
                        <span>Demande d’adaptation du client · {selectedAdaptationRequest.requestedAt}</span>
                        <p>{selectedAdaptationRequest.message}</p>
                        {(selectedAdaptationRequest.budget !== undefined || selectedAdaptationRequest.deadline !== undefined) && (
                          <small>
                            {[
                              selectedAdaptationRequest.budget !== undefined ? `Budget indicatif : ${formatProposalAmount(selectedAdaptationRequest.budget)}` : null,
                              selectedAdaptationRequest.deadline !== undefined ? `Délai souhaité : ${formatProposalDeadline(selectedAdaptationRequest.deadline)}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </div>
                    )}
                    {history.length > 0 && (
                      <div className="proposal-history">
                        <span>Historique</span>
                        <ul>
                          {history.map((version) => (
                            <li key={version.id}>
                              <b>V{version.version}</b>
                              <span>
                                {formatProposalAmount(version.amount)} HT · {formatProposalDeadline(version.deadline)}
                              </span>
                              <span className={`decision-badge ${version.status === "accepted" ? "decision-included" : version.status === "refused" ? "decision-refused" : "decision-sent"}`}>
                                {versionStatusLabel(version)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Field id="proposal-description" label="Description de la prestation">
                      <Textarea id="proposal-description" value={newProposalDescription} onChange={(event) => setNewProposalDescription(event.target.value)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="proposal-amount" label="Montant HT">
                        <AddonInput id="proposal-amount" addon="€" type="number" min="0" step="10" placeholder="850" value={newProposalAmount} onChange={(event) => setNewProposalAmount(event.target.value)} />
                      </Field>
                      <Field id="proposal-deadline" label="Impact planning">
                        <AddonInput id="proposal-deadline" addon="jours" type="number" min="0" step="1" placeholder="3" value={newProposalDeadline} onChange={(event) => setNewProposalDeadline(event.target.value)} />
                      </Field>
                    </div>
                  </>
                )}
              </Modal>
            );
          })()}

          <Modal
            open={proposalPreviewCommentId !== null && Boolean(previewProposal)}
            onClose={() => setProposalPreviewCommentId(null)}
            title="Résumé de la proposition"
            description={previewProposal ? `Demande #${previewProposalComment?.id} · Version ${previewProposal.version}` : undefined}
          >
            {previewProposal && (
              <>
                <div className={`proposal-preview-status ${previewAdaptationRequest?.decision === "refused" || proposalDecisionFor(previewProposal.commentId) === "refused" ? "refused" : "accepted"}`}>
                  {previewAdaptationRequest?.decision === "accepted"
                    ? `Acceptée par l’agence${previewAdaptationRequest.decisionBy ? ` · ${previewAdaptationRequest.decisionBy}` : ""}`
                    : previewAdaptationRequest?.decision === "refused"
                      ? `Refusée par l’agence${previewAdaptationRequest.decisionBy ? ` · ${previewAdaptationRequest.decisionBy}` : ""}`
                      : proposalDecisionFor(previewProposal.commentId) === "accepted"
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
            open={approvalOpen}
            onClose={() => setApprovalOpen(false)}
            role="alertdialog"
            title="Approuver cette version ?"
            description={`${comments.filter((comment) => needsQualification(comment)).length} demande(s) n’ont pas encore été qualifiée(s). L’approbation verrouillera cette version.`}
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setApprovalOpen(false);
                    setInspectorTab("comment");
                  }}
                >
                  Revenir aux retours
                </Button>
                <Button
                  onClick={() => {
                    setApprovalOpen(false);
                    confirmApproval();
                  }}
                >
                  Approuver quand même
                </Button>
              </>
            }
          >
            <div className="blocking-list">
              {comments
                .filter((comment) => needsQualification(comment))
                .map((comment) => (
                  <div className="blocking-item" key={comment.id}>
                    <span className="blocking-dot" />
                    <span>{comment.message}</span>
                  </div>
                ))}
            </div>
          </Modal>

          {/* Built only when a deliverable is open: its body reads the current version. */}
          {currentDeliverable && (
          <Modal
            open={proofOpen}
            onClose={() => setProofOpen(false)}
            title="Synthèse du périmètre & décisions"
            description="Le registre des demandes, de leurs qualifications et des propositions de cette version."
            size="xl"
            footer={<Button onClick={() => void exportProof()}>Exporter la preuve</Button>}
          >
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
                <b>V{String(currentDeliverable.version).padStart(2, "0")}</b>
              </div>
            </div>
            <div className="proof-status">
              <span className={`status-dot ${approved ? "approved-dot" : ""}`} /> {approved ? "Version approuvée" : "En attente client"}
              {approvedAt && <small> le {approvedAt}</small>}
            </div>
            <div className="scope-summary-grid">
              <div className="scope-summary-card">
                <span className="scope-card-label">À traiter</span>
                <b>{activeComments.filter((c) => c.decision === "Inclus").length}</b>
                <small>0 € (compris au forfait)</small>
              </div>
              <div className="scope-summary-card">
                <span className="scope-card-label">Hors scope</span>
                <b>{activeComments.filter((c) => c.decision === "Hors périmètre").length}</b>
                <small>
                  {activeComments.filter((c) => c.decision === "Hors périmètre" && proposalDecisionFor(c.id) === "accepted").length} acceptée(s)
                </small>
              </div>
              <div className="scope-summary-card highlight">
                <span className="scope-card-label">À clarifier</span>
                <b>{activeComments.filter((c) => needsQualification(c)).length}</b>
                <small>en attente d’arbitrage</small>
              </div>
            </div>
            <h3 className="font-heading text-base font-semibold">Décisions sur les demandes</h3>
            <div className="proof-comments">
              {activeComments.map((comment) => (
                <div className="proof-comment" key={comment.id}>
                  <span className={`decision-badge ${decisionStyles[comment.decision]}`}>
                    {comment.decision === "Inclus" ? "À traiter" : comment.decision === "Hors périmètre" ? "Hors scope" : "À clarifier"}
                  </span>
                  <p>{comment.title ?? comment.message}</p>
                </div>
              ))}
            </div>
            {activeComments.some((comment) => comment.decision === "Hors périmètre" && proposalStateFor(comment.id) === "sent") && (
              <>
                <h3 className="font-heading text-base font-semibold">Propositions commerciales associées</h3>
                <div className="proof-proposals-list">
                  {activeComments
                    .filter((comment) => comment.decision === "Hors périmètre" && proposalStateFor(comment.id) === "sent")
                    .map((comment) => {
                      const proposal = activeProposalFor(comment.id);
                      const decision = proposalDecisionFor(comment.id);
                      return (
                        <div className="proof-proposal-item" key={comment.id}>
                          <div>
                            <b>
                              Demande #{comment.id} : {proposal?.description || comment.message}
                            </b>
                            <small>
                              {proposal ? `${formatProposalAmount(proposal.amount)} · ${formatProposalDeadline(proposal.deadline)}` : "Montant et délai à définir"}
                            </small>
                          </div>
                          <span className={`decision-badge ${decision === "accepted" ? "decision-included" : decision === "refused" ? "decision-outside" : "decision-pending"}`}>
                            {decision === "accepted" ? (
                              <>
                                Acceptée <Check />
                              </>
                            ) : decision === "refused" ? (
                              "Refusée"
                            ) : (
                              "En attente"
                            )}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
            <div className="proof-footer">
              <span>Validé par {currentUser.name}</span>
              <span>
                Identifiant : KR-{currentDeliverable.id}-{currentDeliverable.version}
              </span>
            </div>
          </Modal>
          )}

          <Modal
            open={Boolean(pendingImport)}
            onClose={() => setPendingImport(null)}
            title="Que souhaitez-vous ajouter ?"
            description={pendingImport ? `${pendingImport.file.name} est prêt à être ajouté au projet.` : undefined}
          >
            <div className="import-choice-list">
              <button className="import-choice" onClick={() => confirmImport("version")}>
                <b>Nouvelle version</b>
                <small>
                  Conserver le livrable « {currentDeliverable?.name} » et créer V{(currentDeliverable?.version ?? 0) + 1}.
                </small>
              </button>
              <button className="import-choice" onClick={() => confirmImport("deliverable")}>
                <b>Nouveau livrable</b>
                <small>Créer un document indépendant en version 01.</small>
              </button>
            </div>
          </Modal>

          <Modal
            open={newProjectOpen}
            onClose={() => setNewProjectOpen(false)}
            title="Créer un projet"
            description={
              view.kind === "client"
                ? `Le projet sera créé dans l’espace ${clients.find((client) => client.id === view.clientId)?.name ?? ""}.`
                : "Un projet regroupe les livrables d’une même mission."
            }
            onSubmit={createProject}
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setNewProjectOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Créer le projet</Button>
              </>
            }
          >
            <Field id="new-project-name" label="Nom du projet">
              <Input id="new-project-name" autoFocus value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Ex. Refonte du site vitrine" />
            </Field>
            {/* Inside a space the space is implied; elsewhere, pick it. */}
            {view.kind !== "client" && (
              <Field id="new-project-space" label="Espace">
                <select id="new-project-space" className={selectClassName} value={newProjectClientId ?? selectedClientId} onChange={(event) => setNewProjectClientId(Number(event.target.value))}>
                  {clients.map((client) => (
                    <option value={client.id} key={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {projectError && <FormError>{projectError}</FormError>}
          </Modal>

          <Modal
            open={newClientOpen}
            onClose={() => setNewClientOpen(false)}
            title="Créer un espace"
            description="Un espace regroupe des projets. Vous pourrez y inviter vos collaborateurs, et votre client."
            onSubmit={createClient}
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setNewClientOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit">Créer l’espace</Button>
              </>
            }
          >
            <Field id="new-space-name" label="Nom de l’espace">
              <Input id="new-space-name" autoFocus value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Ex. Atelier Horizon" />
            </Field>
            <Field id="new-space-email" label="Inviter un collaborateur" optional>
              <Input id="new-space-email" type="email" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} placeholder="prenom@votre-agence.fr" />
            </Field>
            {clientError && <FormError>{clientError}</FormError>}
          </Modal>

          <Modal
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            title="Historique & journal"
            description="Chaque version reste consultable ; une version approuvée ne peut plus être modifiée."
            size="lg"
          >
            <div className="version-list">
              {deliverables.map((deliverable, index) => (
                <div className={`version-row ${index === 0 ? "current-version" : ""}`} key={deliverable.id}>
                  <div>
                    <b>Version {String(deliverable.version).padStart(2, "0")}</b>
                    <small>
                      {deliverable.name} · {deliverable.importedAt}
                    </small>
                  </div>
                  <span className={`version-status ${deliverable.locked ? "locked-status" : "draft-status"}`}>{deliverable.locked ? "Verrouillée" : deliverable.status}</span>
                </div>
              ))}
            </div>
            <div className="audit-section">
              <div className="audit-section-heading">
                <b>Journal d’activité</b>
                <span>
                  {activeAuditEvents.length} événement{activeAuditEvents.length > 1 ? "s" : ""}
                </span>
              </div>
              {activeAuditEvents.length === 0 ? (
                <p className="audit-empty">Les décisions et actions importantes apparaîtront ici.</p>
              ) : (
                <div className="audit-list">
                  {activeAuditEvents.slice(0, 12).map((event) => (
                    <div className="audit-event" key={event.id}>
                      <span className="audit-dot" />
                      <div>
                        <b>{event.description}</b>
                        <small>
                          {event.actor} · {event.timestamp}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Modal>

          <Modal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            title="Partager la revue"
            description="Le client pourra consulter la version actuelle et déposer ses retours depuis ce lien."
            footer={
              reviewLink?.active ? (
                <>
                  <Button
                    variant="destructive"
                    className="sm:mr-auto"
                    disabled={!canManage}
                    title={canManage ? undefined : "Réservé aux administrateurs de l’agence"}
                    onClick={() => {
                      if (!adminOnly()) return;
                      const revokedLink = { ...reviewLink, active: false };
                      const linkKey = `${reviewLink.deliverableId ?? 1}:${reviewLink.version ?? 1}`;
                      setReviewLink(revokedLink);
                      setReviewLinks((current) => ({ ...current, [linkKey]: revokedLink }));
                      setShareOpen(false);
                      toast("Lien de revue révoqué");
                    }}
                  >
                    Révoquer ce lien
                  </Button>
                  <Button onClick={copyReviewLink}>
                    {linkCopied ? (
                      <>
                        Lien copié <Check />
                      </>
                    ) : (
                      "Copier le lien"
                    )}
                  </Button>
                </>
              ) : undefined
            }
          >
            {reviewLink?.active ? (
              <>
                <Field
                  id="share-url"
                  label="Lien sécurisé"
                  hint={
                    <>
                      {reviewLink.autoExpire !== false ? `Expire le ${reviewLink.expiresAt}` : "Aucune expiration automatique"} · <span className="text-status-resolved-text">Lien actif</span>
                    </>
                  }
                >
                  <Input id="share-url" readOnly value={getReviewUrl()} onFocus={(event) => event.target.select()} />
                </Field>
                <Field id="share-invite" label="Inviter par e-mail" hint="Plusieurs adresses : séparez-les par une virgule.">
                  <div className="flex gap-2">
                    <Input
                      id="share-invite"
                      type="email"
                      multiple
                      value={inviteDraft}
                      placeholder="prenom@client.fr"
                      onChange={(event) => {
                        setInviteDraft(event.target.value);
                        setInviteError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void inviteByEmail();
                        }
                      }}
                      disabled={isReadOnlyVersion}
                    />
                    <Button variant="outline" className="h-9" onClick={() => void inviteByEmail()} disabled={!inviteDraft.trim() || isReadOnlyVersion}>
                      Inviter
                    </Button>
                  </div>
                </Field>
                {inviteError && <FormError>{inviteError}</FormError>}
                {(reviewLink.invites?.length ?? 0) > 0 && (
                  <ul className="invite-list" aria-label="Personnes invitées">
                    {reviewLink.invites?.map((invite) => (
                      <li key={invite.email}>
                        <span className="truncate">{invite.email}</span>
                        <small>invité le {invite.at.split(" ")[0]}</small>
                        <Hint label="Copier son lien personnel">
                          <Button variant="ghost" size="icon-xs" aria-label={`Copier le lien de ${invite.email}`} onClick={() => void copyInviteLink(invite)}>
                            <Copy />
                          </Button>
                        </Hint>
                        <Hint label="Retirer l’invitation (son accès est coupé)">
                          <Button variant="ghost" size="icon-xs" aria-label={`Retirer ${invite.email}`} onClick={() => removeInvite(invite.email)}>
                            <X />
                          </Button>
                        </Hint>
                      </li>
                    ))}
                  </ul>
                )}
                {accessRequests.some((request) => request.linkKey === linkKeyOf(reviewLink)) && (
                  <div className="grid gap-2">
                    <Label>Demandes d’accès</Label>
                    <ul className="invite-list" aria-label="Demandes d’accès">
                      {accessRequests
                        .filter((request) => request.linkKey === linkKeyOf(reviewLink))
                        .map((request) => (
                          <li key={request.email}>
                            <span className="grid min-w-0">
                              <span className="truncate">{request.email}</span>
                              {request.message && <small className="!ml-0 truncate">« {request.message} »</small>}
                            </span>
                            <span className="ml-auto flex shrink-0 gap-1">
                              <Button variant="outline" size="xs" onClick={() => void decideAccessRequest(request, "refused")}>
                                Refuser
                              </Button>
                              <Button size="xs" onClick={() => void decideAccessRequest(request, "accepted")}>
                                Accepter
                              </Button>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="share-auto-expire" className="text-sm font-normal">
                    Révoquer automatiquement après 7 jours
                  </Label>
                  <Switch id="share-auto-expire" checked={reviewLink.autoExpire !== false} onCheckedChange={updateAutoExpire} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {nobodyInvited
                      ? "Invitez le client pour pouvoir le relancer"
                      : lastReminderAt
                        ? `Dernière relance : ${new Date(lastReminderAt).toLocaleString("fr-FR")}`
                        : "Aucune relance envoyée"}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void remindClient()} disabled={reminderBlocked || isReadOnlyVersion || nobodyInvited}>
                    {reminderBlocked ? "Relance déjà envoyée" : "Relancer le client"}
                  </Button>
                </div>
              </>
            ) : (
              <FormError>Ce lien a été révoqué. Fermez cette fenêtre pour en générer un nouveau.</FormError>
            )}
          </Modal>

          {(() => {
            const request = confirmSendId !== null ? comments.find((comment) => comment.id === confirmSendId) : undefined;
            const draft = confirmSendId !== null ? proposalVersions[confirmSendId]?.find((proposal) => proposal.status === "draft") : undefined;
            return (
              <Modal
                open={Boolean(request && draft)}
                onClose={() => setConfirmSendId(null)}
                role="alertdialog"
                title="Envoyer la proposition au client ?"
                description={`${selectedClient?.name ?? "Le client"} la recevra sur sa page de revue et pourra l’accepter, la refuser ou demander une adaptation.`}
                className="confirm-send-modal"
                footer={
                  <>
                    {!canManage && <span className="mr-auto self-center text-xs text-muted-foreground">Envoi réservé aux administrateurs de l’agence</span>}
                    <Button variant="outline" onClick={() => setConfirmSendId(null)}>
                      Annuler
                    </Button>
                    <Button disabled={!canManage} onClick={() => confirmSendId !== null && sendQuotedProposal(confirmSendId)}>
                      Envoyer la proposition
                    </Button>
                  </>
                }
              >
                {request && draft && (
                  <div className="proposal-summary">
                    <div>
                      <span>Demande</span>
                      <b>{request.title ?? request.message}</b>
                    </div>
                    <div>
                      <span>Montant HT</span>
                      <b>{formatProposalAmount(draft.amount)}</b>
                    </div>
                    <div>
                      <span>Délai</span>
                      <b>{formatProposalDeadline(draft.deadline)}</b>
                    </div>
                  </div>
                )}
              </Modal>
            );
          })()}
          {renameOpen && latestVersionRecord && (
            <RenameDialog
              title="Renommer le livrable"
              value={latestVersionRecord.name}
              error={renameError}
              onClose={() => setRenameOpen(false)}
              onSave={(name) => {
                const error = renameLivrable(livrableRootId, name);
                if (error) setRenameError(error);
                else setRenameOpen(false);
              }}
            />
          )}

          <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Raccourcis clavier" size="sm">
            <dl className="shortcuts-list">
              {[
                ["V", "Outil Déplacer"],
                ["C", "Outil Commentaire"],
                ["Double-clic", "Déplacer une pin"],
                ["Échap", "Fermer le fil, annuler"],
                ["Molette", "Faire défiler les pages"],
                ["Ctrl + molette", "Zoomer"],
                ["Ctrl K", "Rechercher"],
                ["Ctrl \\", "Afficher / masquer le panneau"],
              ].map(([keys, action]) => (
                <div key={keys}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </Modal>

          <Modal
            open={changesOpen}
            onClose={() => setChangesOpen(false)}
            title="Rouvrir la validation"
            description="Expliquez au client pourquoi cette validation doit être rouverte."
            onSubmit={requestChanges}
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setChangesOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={!changesMessage.trim()}>
                  Envoyer la demande
                </Button>
              </>
            }
          >
            <Field id="changes-message" label="Message">
              <Textarea id="changes-message" autoFocus value={changesMessage} onChange={(event) => setChangesMessage(event.target.value)} placeholder="Ex. La hiérarchie du bloc principal doit être revue…" />
            </Field>
          </Modal>

          <Modal
            open={newProposalVersionOpen}
            onClose={() => {
              setNewProposalVersionOpen(false);
              setRequoting(false);
            }}
            title={requoting ? "Nouvelle proposition" : "Nouvelle version de la proposition"}
            description={
              requoting
                ? "La version refusée reste dans l’historique. Vous enverrez la nouvelle version après confirmation."
                : "La proposition actuelle sera remplacée : cette nouvelle version sera la seule active pour le client."
            }
            onSubmit={sendNewProposalVersion}
            size="lg"
            footer={
              <>
                {!requoting && !canManage && <span className="mr-auto self-center text-xs text-muted-foreground">Envoi réservé aux administrateurs de l’agence</span>}
                <Button type="button" variant="outline" onClick={() => setNewProposalVersionOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={(!requoting && !canManage) || !newProposalDescription.trim() || !newProposalAmount.trim() || !newProposalDeadline.trim()}>
                  {requoting ? "Enregistrer le chiffrage" : "Envoyer la nouvelle proposition"}
                </Button>
              </>
            }
          >
            {selectedAdaptationRequest && (
              <div className="proposal-note">
                <span>Demande d’adaptation du client · {selectedAdaptationRequest.requestedAt}</span>
                <p>{selectedAdaptationRequest.message}</p>
              </div>
            )}
            <Field id="version-description" label="Description de la prestation">
              <Textarea id="version-description" autoFocus value={newProposalDescription} onChange={(event) => setNewProposalDescription(event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="version-amount" label="Montant HT">
                <AddonInput id="version-amount" addon="€" type="number" min="0" step="10" placeholder="850" value={newProposalAmount} onChange={(event) => setNewProposalAmount(event.target.value)} />
              </Field>
              <Field id="version-deadline" label="Impact planning">
                <AddonInput id="version-deadline" addon="jours" type="number" min="0" step="1" placeholder="3" value={newProposalDeadline} onChange={(event) => setNewProposalDeadline(event.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="version-counter" className="grid gap-0.5 text-sm font-normal">
                Le client peut faire une contre-proposition
                <span className="text-xs text-muted-foreground">Sinon, un refus est définitif.</span>
              </Label>
              <Switch id="version-counter" checked={newProposalCounter} onCheckedChange={setNewProposalCounter} />
            </div>
          </Modal>
        </div>
      </section>
    </main>
    </div>
  );
  /**
   * Invites the typed addresses (comma, semicolon or space separated) to this review. The server
   * records them and mails each one its personal link; the client then confirms with a code.
   */
  async function inviteByEmail() {
    if (!reviewLink || isReadOnlyVersion) return;
    const typed = inviteDraft.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    const invalid = typed.filter((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
    if (invalid.length) {
      setInviteError(`Adresse invalide : ${invalid.join(", ")}`);
      return;
    }
    const already = new Set((reviewLink.invites ?? []).map((invite) => invite.email));
    const fresh = [...new Set(typed)].filter((email) => !already.has(email));
    if (fresh.length === 0) {
      setInviteError(typed.length ? "Ces personnes sont déjà invitées." : "");
      return;
    }
    const result = await callReviewAccess("invite", { linkKey: linkKeyOf(reviewLink), emails: fresh });
    if (!result) return;
    setInviteDraft("");
    setInviteError("");
    toast(fresh.length > 1 ? `${fresh.length} invitations envoyées` : `Invitation envoyée à ${fresh[0]}`);
  }

  /** Accepts (the address is invited and receives its link) or refuses a request for access. */
  async function decideAccessRequest(request: AccessRequest, decision: "accepted" | "refused") {
    const result = await callReviewAccess("requests", { linkKey: request.linkKey, email: request.email, decision });
    if (!result) return;
    setAccessRequests((current) => current.filter((candidate) => candidate !== request));
    toast(decision === "accepted" ? `Accès accordé à ${request.email}` : `Demande de ${request.email} refusée`);
  }

  /** Invitation endpoints: the link is saved first, the answer updates it here. */
  async function callReviewAccess(action: "invite" | "requests" | "remind", body: Record<string, unknown>) {
    await flushSharedState();
    const response = await fetch(`/api/review-access/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { link?: ReviewLink; notSent?: string[]; error?: string } | null;
    if (!response?.ok || !result?.link) {
      setInviteError(result?.error ?? "L’action n’a pas abouti. Réessayez.");
      return null;
    }
    const link = result.link;
    setReviewLink((current) => (current && linkKeyOf(current) === linkKeyOf(link) ? link : current));
    setReviewLinks((current) => ({ ...current, [linkKeyOf(link)]: link }));
    refreshSharedState();
    if (result.notSent?.length)
      toast.warning(`E-mail non envoyé à ${result.notSent.join(", ")} : copiez son lien personnel et transmettez-le.`);
    return result;
  }

  /** Personal address of an invitation: pre-fills the client's e-mail. */
  async function copyInviteLink(invite: { email: string; id?: string }) {
    if (!reviewLink) return;
    await navigator.clipboard.writeText(`${getReviewUrl()}${invite.id ? `?invitation=${invite.id}` : ""}`);
    toast(`Lien de ${invite.email} copié`);
  }

  function removeInvite(email: string) {
    if (!reviewLink) return;
    const linkKey = `${reviewLink.deliverableId ?? 1}:${reviewLink.version ?? 1}`;
    const updatedLink = { ...reviewLink, invites: (reviewLink.invites ?? []).filter((invite) => invite.email !== email) };
    setReviewLink(updatedLink);
    setReviewLinks((current) => ({ ...current, [linkKey]: updatedLink }));
  }

  /** Mails every invited client a reminder with their personal link (once a day per link, checked by the server). */
  async function remindClient() {
    if (isReadOnlyVersion || !reviewLink || reminderBlocked || nobodyInvited) return;
    const result = await callReviewAccess("remind", { linkKey: linkKeyOf(reviewLink) });
    if (!result) return;
    const count = reviewLink.invites?.length ?? 0;
    toast(count > 1 ? `Relance envoyée à ${count} personnes` : `Relance envoyée à ${reviewLink.invites?.[0]?.email}`);
  }
}

/** Canvas toolbar: a file becomes the next version of this deliverable. */
function CanvasImportButton({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Hint label="Importer une nouvelle version" side="top">
        <button type="button" className="tool-button" aria-label="Importer une nouvelle version" disabled={disabled} onClick={() => input.current?.click()}>
          <Upload />
        </button>
      </Hint>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*,video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </>
  );
}

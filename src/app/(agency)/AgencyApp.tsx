"use client";
import { formatProposalAmount, formatProposalDeadline, parseNumericAmount, parseNumericDays } from "@/lib/proposalFormat";



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
import { HomeSidebar, Notifications, ProjectSidebar, type ClientFeedback, type NewVersion, type PanelMode, type SidebarLivrable, type SidebarFavorite, type SidebarVersion } from "./Sidebars";
import { href, hrefForRecord, livrableIdOf, notificationHref, parseAgencyPath, versionsOfLivrable } from "./routes";
import { MAX_FILE_BYTES, deliverableKinds, formatBytes, kindFromFile, type DeliverableType } from "@/components/deliverableKinds";
import { NewDeliverableDialog, type NewDeliverable } from "./NewDeliverableDialog";
import { LinkVersionDialog } from "./LinkVersionDialog";
import { NoDeciderBanner } from "./NoDeciderBanner";
import { NewProjectDialog } from "./NewProjectDialog";
import { MobileBar, mobileTitle } from "./MobileBar";
import { useArrivalToast } from "./useArrivalToast";
import { DeliverableTour } from "./DeliverableTour";
import {
  Composer,
  ThreadPopover,
  isAgencyDraft,
  requestKind,
  type ProposalStage,
  type Qualification,
  type Qualified,
  type Area,
  } from "./editor/CanvasComments";
import { EditorInspector, inspectorTabOf, threadsToMarkdown, type InspectorTab } from "./editor/EditorInspector";
import { outsideStatusOf, outsideStatusView } from "@/lib/outsideStatus";
import { NewRequestDialog, type NewRequest } from "./editor/NewRequestDialog";
import { ReviewCanvas, type CanvasComposer, type CanvasTool } from "./editor/ReviewCanvas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AddonInput, Field, FormError, Modal } from "@/components/modal";
import { MenuButton, type MenuEntry } from "./editor/MenuButton";
import { RenameDialog } from "./EntitySettings";
import type { HomeAnalyticsData } from "./HomeAnalytics";
import type { LivrableGroup } from "./LivrableFilter";
import { useCurrentUser } from "./CurrentUser";
import { sideOf, type Side } from "@/lib/authors";
import { proofHtml } from "./proofDocument";
import { requestsHtml } from "./requestsDocument";
import { uploadFile as sendFile, type UploadPlacement } from "@/lib/upload";
import { agencyAction } from "@/lib/agencyActions";
import type { ClientRole } from "@/lib/clientRoles";
import type { Invite } from "./InviteList";
import { SiteToolbarSnippet } from "./SiteToolbarSnippet";
import { previousPeople, ReshareDialog, type ReshareChoice } from "./ReshareDialog";
import { loadSharedState, refreshSharedState, subscribeSharedState } from "@/lib/stateSync";
import { linkDeciders } from "@/lib/linkDeciders";
import { SendProposalDialog } from "./SendProposalDialog";
import { ShareDialog } from "./ShareDialog";


type Decision = "À qualifier" | "Inclus" | "Hors périmètre";

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

type Comment = {
  id: number;
  deliverableId?: number;
  author: string;
  initials: string;
  from?: Side;
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
  invites?: Invite[];
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
  /** What it is about, so the bell opens it (src/app/(agency)/routes.ts notificationHref). */
  deliverableId?: number;
  commentId?: number;
  open?: "share";
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
const favoritesKey = "kora-favorites";
/** Widths of the side panels, set by dragging their edge (per browser). */
const panelWidthsKey = "kora-panel-widths";
/** Comments the agency has opened (per browser): the tab alert only counts the others. */
const seenKey = "kora-seen-comments";
// The requests panel shows its four tabs (Brouillons · À clarifier · Inclus · Hors scope) at this width.
const defaultWidths = { panel: 248, inspector: 384 };

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
  // Phones: the sidebar opens as a drawer, for the page it was opened on (leaving the page closes it).
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);
  const navOpen = navOpenAt === pathname;
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
  const [newClientName, setNewClientName] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState("");
  const [clientError, setClientError] = useState("");
  const [deliverableError, setDeliverableError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ file: File; type: DeliverableType } | null>(null);
  /** « Nouvelle version » of a « Lien »: its address is asked for. */
  const [linkVersionOpen, setLinkVersionOpen] = useState(false);
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
  const [proofOpen, setProofOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  /** Share dialog: e-mail addresses being typed for a manual invitation. */
  const [inviteDraft, setInviteDraft] = useState("");
  /** "Partager la V03 ?" with the people of the previous version (ReshareDialog). */
  const [reshare, setReshare] = useState<{ deliverableId: number; version: number; previousVersion: number; people: Invite[] } | null>(null);
  /** Role given to the addresses invited from "Partager la revue" (src/lib/clientRoles.ts). */
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
          setTrash(parsedState.trash);
          // Expired items are purged by an administrator's page (members may not delete for good).
          if (canManage && parsedState.trash.some((item) => item.deletedAt < limit)) void agencyAction("trash/expired", "DELETE");
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

  // ?partage=1 (from the bell, an access request): « Partager la revue » is open on the version until
  // closed, which drops the parameter. Derived from the address: no effect needed.
  const shareFromBell = searchParams.get("partage") === "1" && view.kind === "deliverable";
  function closeShare() {
    setShareOpen(false);
    if (shareFromBell) router.replace(pathname, { scroll: false });
  }

  // ?demande=ID (from "À traiter"): select that comment once, then drop the param so clicks work normally.
  useEffect(() => {
    if (focusedCommentId === null || !activeComments.some((comment) => comment.id === focusedCommentId)) return;
    const focused = activeComments.find((comment) => comment.id === focusedCommentId);
    setSelectedId(focusedCommentId);
    setThreadOpen(true);
    if (quoteOnFocus) setQuotingId(focusedCommentId);
    if (focused) setInspectorTab(inspectorTabOf(focused));
    router.replace(pathname, { scroll: false });
    // Bring its pin into view once the canvas has laid out the pages.
    window.setTimeout(() => {
      const pin = document.querySelector<HTMLElement>(`[data-pin="${focusedCommentId}"]`);
      const zoom = transformRef.current;
      if (pin && zoom) void zoom.zoomToElement(pin, zoom.state.scale, 300);
    }, 400);
  }, [focusedCommentId, quoteOnFocus, activeComments, pathname, router]);

  /**
   * Qualifies a comment as a correction (in scope) or an addition (hors scope), with a clear title;
   * also used to change a qualification or send the request back to clarify.
   */
  function qualifyComment(commentId: number, qualified: Qualified) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    const back = qualified.decision === "À qualifier";
    setInspectorTab(back ? "comment" : qualified.decision === "Inclus" ? "correction" : "outside");
    // The server builds the qualification, its draft quote and their audit events (src/db/agencyActions.ts).
    void agencyAction(`comments/${commentId}/qualification`, "PUT", {
      decision: qualified.decision,
      title: qualified.title,
      description: qualified.description,
      quote: qualified.quote,
    });
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

    void agencyAction("spaces", "POST", { name: clientName, ...(clientEmail ? { email: clientEmail } : {}) }).then((result) => result?.id && router.push(href.client(result.id)));
    setNewClientName("");
    setNewClientEmail("");
    setClientError("");
    setNewClientOpen(false);
  }

  /** Renames a space; its projects keep the new name too (src/db/workspaceActions.ts). */
  function renameClient(clientId: number, name: string) {
    void agencyAction(`spaces/${clientId}`, "PATCH", { name });
  }

  /** A project goes to the trash with its deliverables (the server builds what the trash keeps). */
  function deleteProject(projectId: number) {
    if (!adminOnly()) return;
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    void agencyAction(`projects/${projectId}`, "DELETE");
    router.push(href.client(project.clientId ?? 1));
  }

  function deleteClient(clientId: number) {
    if (!adminOnly()) return;
    if (!clients.some((candidate) => candidate.id === clientId)) return;
    void agencyAction(`spaces/${clientId}`, "DELETE");
    router.push(href.spaces());
  }

  function deleteLivrable(livrableId: number) {
    void agencyAction(`deliverables/${livrableId}`, "DELETE");
  }

  /** Puts everything back as it was (merged by id on the server, so a partial restore never duplicates). */
  function restoreFromTrash(itemId: number) {
    void agencyAction(`trash/${itemId}/restore`, "POST");
  }

  function purgeFromTrash(itemId?: number) {
    if (!adminOnly()) return;
    void agencyAction(itemId === undefined ? "trash" : `trash/${itemId}`, "DELETE");
  }

  function moveProject(projectId: number, clientId: number) {
    if (!clients.some((candidate) => candidate.id === clientId)) return;
    void agencyAction(`projects/${projectId}`, "PATCH", { clientId });
  }

  /** Renames every version of a deliverable; refused when its project already has that name. */
  function renameLivrable(livrableId: number, name: string): string | null {
    const versions = versionsOfLivrable(livrableId, deliverables);
    if (!versions[0]) return "Livrable introuvable.";
    const projectId = versions[0].projectId ?? 1;
    const ids = new Set(versions.map((record) => record.id));
    if (deliverables.some((record) => !ids.has(record.id) && (record.projectId ?? 1) === projectId && record.name.toLowerCase() === name.toLowerCase()))
      return "Un autre livrable porte déjà ce nom dans ce projet.";
    void agencyAction(`deliverables/${livrableId}`, "PATCH", { name });
    return null;
  }

  /** Re-attach a deliverable (every version) to another project; refused if that project has the same name. */
  function moveLivrable(livrableId: number, projectId: number) {
    const versions = versionsOfLivrable(livrableId, deliverables);
    const name = versions[0]?.name;
    if (!name) return false;
    if (deliverables.some((record) => (record.projectId ?? 1) === projectId && record.name === name)) return false;
    void agencyAction(`deliverables/${livrableId}`, "PATCH", { projectId });
    return true;
  }

  function renameProject(projectId: number, name: string) {
    void agencyAction(`projects/${projectId}`, "PATCH", { name });
  }

  /**
   * Imports a file into the agency's storage (src/lib/upload.ts), under its place in the project;
   * returns its address, or null once the error is shown.
   */
  async function uploadFile(file: File, placement: UploadPlacement) {
    const progress = toast.loading(`Import de « ${file.name} »…`);
    const result = await sendFile(file, placement).catch(() => ({ error: "L’import n’a pas abouti. Réessayez." }));
    toast.dismiss(progress);
    if ("error" in result) {
      toast.error(result.error);
      return null;
    }
    return result.href;
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
    const result = await agencyAction("deliverables", "POST", {
      id,
      projectId,
      name: input.name,
      type: input.type,
      size: input.file?.size ?? 0,
      ...(fileData ? { fileData } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(coverData ? { coverData } : {}),
    });
    if (!result?.id) return;
    setNewDeliverableOpen(false);
    setDeliverableError("");
    const created = { id: result.id, projectId, name: input.name, version: 1 };
    router.push(hrefForRecord(created, [created, ...deliverables]));
  }

  async function confirmImport(mode: ImportMode, source: { file?: File; url?: string; type: DeliverableType } | null = pendingImport) {
    if (!source) return;
    const { file, url, type } = source;
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
    const fileData = file ? await uploadFile(file, { kind: "version", projectId: selectedProjectId, livrableId, version: nextVersion }) : undefined;
    if (file && !fileData) return;
    const content = { id, type, size: file?.size ?? 0, ...(fileData ? { fileData } : {}), ...(url ? { url } : {}) };
    // A new version freezes the earlier ones (src/db/workspaceActions.ts).
    const result =
      mode === "version" && activeDeliverable
        ? await agencyAction(`deliverables/${activeDeliverable.id}/versions`, "POST", content)
        : await agencyAction("deliverables", "POST", { ...content, projectId: selectedProjectId, name: file?.name ?? "" });
    setPendingImport(null);
    if (!result?.id) return;
    // A new version is shared by choice, with one click: the people of the previous one are proposed.
    const previous = mode === "version" && activeDeliverable ? previousPeople(activeDeliverable, nextVersion, deliverables, reviewLinks) : null;
    if (previous) setReshare({ deliverableId: result.id, version: nextVersion, previousVersion: previous.version, people: previous.people });
    const imported = { id: result.id, projectId: selectedProjectId, name: (mode === "version" ? activeDeliverable?.name : undefined) ?? file?.name ?? "", version: nextVersion };
    router.push(hrefForRecord(imported, [imported, ...deliverables]));
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

  /** A request entered from « + Demande »: its capture is imported first, then the request with its source. */
  async function addRequest(request: NewRequest) {
    if (isReadOnlyVersion || !currentDeliverable) return;
    const captureHref = request.capture
      ? await uploadFile(request.capture, { kind: "request", projectId: currentDeliverable.projectId ?? 1, livrableId: livrableIdOf(currentDeliverable, deliverables) })
      : undefined;
    if (captureHref === null) return;
    setNewRequestKind(null);
    setInspectorTab(request.decision === "Inclus" ? "correction" : request.decision === "Hors périmètre" ? "outside" : "comment");
    const source = request.source ? { ...request.source, ...(captureHref ? { capture: captureHref } : {}) } : undefined;
    const result = await agencyAction("comments", "POST", {
      request: { deliverableId: currentDeliverable.id, decision: request.decision, title: request.title, description: request.description, quote: request.quote, source },
    });
    if (!result?.id) return;
    setSelectedId(result.id);
    toast(`Demande « ${request.title} » créée`);
  }

  /** Publishes a comment written on the canvas, or by hand (no position) from the panel. */
  async function addComment(message: string, spot: CanvasComposer | null) {
    if (isReadOnlyVersion || !currentDeliverable) return;
    setComposer(null);
    const result = await agencyAction("comments", "POST", {
      deliverableId: currentDeliverable.id,
      message,
      location: spot?.target ?? "Livrable (général)",
      page: spot?.page ?? 1,
      position: spot ? { x: spot.x, y: spot.y } : undefined,
      area: spot?.area,
      pinnedOn: spot?.pinnedOn,
    });
    if (!result?.id) return;
    setSelectedId(result.id);
    setInspectorTab("draft");
    setThreadOpen(true);
  }

  /** "Livrable — V03": title of copied / exported requests. */
  const exportTitle = currentDeliverable ? `${currentDeliverable.name} — V${String(currentDeliverable.version).padStart(2, "0")}` : "Demandes";
  /** The version's requests as a printable page, saved as PDF from the browser (as the proof). */
  function exportRequests() {
    const statusOf = (comment: Comment) =>
      comment.decision === "Hors périmètre"
        ? outsideStatusView(outsideStatusOf({ state: proposalStateFor(comment.id), decision: proposalDecisionFor(comment.id), adaptation: adaptationRequests[comment.id] }), "agency").label
        : null;
    // A page of its own, which prints itself once loaded (src/app/(agency)/requestsDocument.ts).
    const page = URL.createObjectURL(new Blob([requestsHtml(exportTitle, activeComments, (comment) => statusOf(comment as Comment))], { type: "text/html" }));
    if (!window.open(page, "_blank")) toast.error("Votre navigateur a bloqué la fenêtre d’export : autorisez les fenêtres pour Kora, puis réessayez.");
    // Freed once the page has had time to open.
    window.setTimeout(() => URL.revokeObjectURL(page), 60_000);
  }

  function replyTo(commentId: number, message: string) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    void agencyAction(`comments/${commentId}/replies`, "POST", { message });
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

  /** Edits one of the agency's messages (0 = the comment itself). */
  function editMessage(commentId: number, messageId: number, message: string) {
    void agencyAction(messageId === 0 ? `comments/${commentId}` : `comments/${commentId}/replies/${messageId}`, "PATCH", { message });
  }

  /** Deletes one of the agency's replies. */
  function deleteMessage(commentId: number, replyId: number) {
    void agencyAction(`comments/${commentId}/replies/${replyId}`, "DELETE");
    toast("Message supprimé");
  }

  function deleteComment(commentId: number) {
    if (isReadOnlyVersion || isDecisionLocked(commentId)) return;
    const target = comments.find((c) => c.id === commentId);
    if (!target || sideOf(target) !== "agency") return;
    const next = comments.find((comment) => comment.id !== commentId);
    if (selectedId === commentId && next) setSelectedId(next.id);
    void agencyAction(`comments/${commentId}`, "DELETE");
    toast("Commentaire supprimé", { action: { label: "Annuler", onClick: () => restoreComment(target) } });
  }

  /** Double-click a pin, then click: the comment moves there (its drawn area follows). */
  function moveComment(commentId: number, page: number, x: number, y: number) {
    if (isReadOnlyVersion) return;
    void agencyAction(`comments/${commentId}`, "PATCH", { page, x, y });
  }

  /** Puts back a deleted comment ("Annuler" in the toast). */
  function restoreComment(removed: Comment) {
    void agencyAction("comments", "POST", { restore: removed });
  }


  /** What still needs the agency: every comment still to clarify (not yet a correction or hors scope). */
  function needsQualification(comment: Comment) {
    return requestKind(comment) === "comment";
  }

  function requestChanges(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changesMessage.trim()) return;
    void agencyAction(`deliverables/${currentDeliverable.id}/reopen`, "POST", { message: changesMessage.trim() });
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
    void agencyAction(`comments/${proposalCommentId}/proposal`, "POST", {
      description: newProposalDescription.trim(),
      amount: parseNumericAmount(newProposalAmount),
      deadline: parseNumericDays(newProposalDeadline),
    });
    setProposalOpen(false);
  }

  /** Sends the quoted proposal after confirmation: the draft becomes version 1, sent to the client. */
  function sendQuotedProposal(commentId: number) {
    const draft = proposalVersions[commentId]?.find((proposal) => proposal.status === "draft");
    if (!draft || isReadOnlyVersion || !adminOnly()) return;
    void agencyAction(`comments/${commentId}/proposal/send`, "POST");
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

  /** The quote typed in the "Nouvelle proposition" window. */
  function typedQuote() {
    return {
      description: newProposalDescription.trim(),
      amount: parseNumericAmount(newProposalAmount),
      deadline: parseNumericDays(newProposalDeadline),
      allowCounter: newProposalCounter,
    };
  }

  /** New quote after a refusal: the refused version stays in the history, the new one waits to be sent. */
  async function saveRequote(commentId: number) {
    // Re-quoting drops the client's pending counter-proposal: that answers it.
    if (adaptationRequests[commentId] && !adaptationRequests[commentId].decision && !adminOnly()) return;
    const nextVersion = Math.max(...(proposalVersions[commentId] ?? []).map((proposal) => proposal.version), 0) + 1;
    setNewProposalVersionOpen(false);
    setRequoting(false);
    if (await agencyAction(`comments/${commentId}/proposal/versions`, "POST", { ...typedQuote(), send: false }))
      toast(`Version ${nextVersion} chiffrée · à envoyer au client`);
  }

  function sendNewProposalVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isReadOnlyVersion) return;
    if (requoting && proposalCommentId !== null) {
      if (!newProposalDescription.trim() || !newProposalAmount.trim() || !newProposalDeadline.trim()) return;
      void saveRequote(proposalCommentId);
      return;
    }
    if (
      proposalCommentId === null ||
      !newProposalDescription.trim() ||
      !newProposalAmount.trim() ||
      !newProposalDeadline.trim() ||
      !adminOnly()
    ) return;

    void agencyAction(`comments/${proposalCommentId}/proposal/versions`, "POST", { ...typedQuote(), send: true });
    setNewProposalVersionOpen(false);
    setNewProposalDescription("");
    setNewProposalAmount("");
    setNewProposalDeadline("");
    setProposalOpen(false);
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
    void agencyAction(`comments/${commentId}/adaptation/decision`, "POST", { decision });
  }

  /** Proof of the open version, built by the server from its database (src/db/proof.ts). */
  async function exportProof() {
    if (!currentDeliverable) return;
    // Opened at once, in the click: browsers block windows opened after an await.
    const exportWindow = window.open("", "_blank");
    if (!exportWindow) return;
    exportWindow.document.title = "Préparation de la preuve…";
    exportWindow.document.body.textContent = "Préparation de la preuve…";
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
  /** The version's active client link, created by the server (random token) when there is none. */
  async function ensureReviewLink(): Promise<ReviewLink | null> {
    const existingLink = reviewLinks[`${currentDeliverable.id}:${currentDeliverable.version}`];
    if (existingLink?.active) {
      setReviewLink(existingLink);
      return existingLink;
    }
    const result = await agencyAction(`deliverables/${currentDeliverable.id}/review-link`, "POST");
    const link = (result?.link as ReviewLink | undefined) ?? null;
    if (link) setReviewLink(link);
    return link;
  }

  function openShareDialog() {
    void ensureReviewLink();
    setLinkCopied(false);
    setShareOpen(true);
  }

  function getReviewUrl() {
    return `${window.location.origin}/review/${reviewLink?.token ?? ""}`;
  }

  async function copyReviewLink() {
    if (!reviewLink?.active) return;
    await navigator.clipboard.writeText(getReviewUrl());
    setLinkCopied(true);
    if (!reviewLink.invites?.length) toast.warning("Lien copié, mais personne n’est invité : seules les adresses invitées peuvent l’ouvrir.");
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

  /** Client messages of a thread the agency has not opened yet: a dot on its pin, a count on its card. */
  const unreadIn = (comment: Comment) => [comment, ...(comment.replies ?? [])].filter((message) => sideOf(message) === "client" && !seenIds.includes(message.id)).length;
  /** Unread messages written in the client space on one version: comments, then replies. */
  function unreadOf(recordId: number): ClientFeedback[] {
    const record = deliverables.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
    const context = [client?.name, `${record.name} V${String(record.version).padStart(2, "0")}`].filter(Boolean).join(" · ");
    const fromClient = (message: { from?: Side; initials: string }) => sideOf(message) === "client";
    return comments
      .filter((comment) => comment.deliverableId === recordId)
      .flatMap((comment) => {
        const target = `${hrefForRecord(record, deliverables)}?demande=${comment.id}`;
        return [comment, ...(comment.replies ?? [])]
          .filter((message) => fromClient(message) && !seenIds.includes(message.id))
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
  /** The bell's "Activité": each notification with the page it is about, when there is one. */
  const commentIdSet = new Set(comments.map((comment) => comment.id));
  const bellNotifications = notifications.map((notification) => ({ ...notification, href: notificationHref(notification, deliverables, commentIdSet) }));

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
  useArrivalToast(clientFeedback, stateHydrated);

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
    if (record.reviewStatus !== "approved" && record.status !== "Approuvée" && !reviewLinks[`${record.id}:${record.version}`]?.invites?.length)
      todoItems.push({ key: `unshared-${record.id}`, kind: "unshared", title: "Version partagée avec personne", context, meta: "Le client ne la voit pas encore", href: recordHref });
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
  // Shared with no one yet: first the one-click offer to the previous version's people.
  const shareThisVersion = () =>
    currentDeliverable && reviewLinks[`${currentDeliverable.id}:${currentDeliverable.version}`]?.invites?.length ? openShareDialog() : shareCurrentVersion();
  // A version is of its deliverable's nature: a file of the same kind, or a new address for a « Lien ».
  const newVersion: NewVersion =
    currentDeliverable?.type === "Link"
      ? { onSelect: () => setLinkVersionOpen(true) }
      : { onFile: importVersionFile, accept: currentDeliverable ? deliverableKinds[currentDeliverable.type]?.accept : undefined };
  const livrableMenu: MenuEntry[] = [
    { kind: "section", label: "Ce livrable" },
    { label: "Importer une nouvelle version", icon: <Upload />, ...newVersion },
    { label: "Partager la revue", icon: <Share2 />, onSelect: openShareDialog },
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
    { label: "Nouvelle version", icon: <Upload />, ...newVersion },
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
    {newProjectOpen && (
      <NewProjectDialog
        spaces={clients}
        defaultSpaceId={selectedClientId}
        fixedSpace={view.kind === "client" ? clients.find((client) => client.id === view.clientId) : undefined}
        onClose={() => setNewProjectOpen(false)}
      />
    )}
    {linkVersionOpen && currentDeliverable?.type === "Link" && (
      <LinkVersionDialog
        url={currentDeliverable.url ?? ""}
        onClose={() => setLinkVersionOpen(false)}
        onCreate={async (url) => {
          await confirmImport("version", { url, type: "Link" });
          setLinkVersionOpen(false);
        }}
      />
    )}
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
      onAdd={() => setNewDeliverableOpen(true)}
      recents={recentLivrableIds
        .filter((livrableId) => !openTabs.some((tab) => tab.livrableId === livrableId))
        .flatMap((livrableId) => {
          const latest = versionsOfLivrable(livrableId, deliverables)[0];
          if (!latest) return [];
          const project = projects.find((candidate) => candidate.id === (latest.projectId ?? 1));
          const client = clients.find((candidate) => candidate.id === (project?.clientId ?? 1));
          return [{ livrableId, href: hrefForRecord(latest, deliverables), name: latest.name, type: latest.type, context: [client?.name, project?.name].filter(Boolean).join(" / ") }];
        })
        .slice(0, 6)}
    />
    <MobileBar
      title={mobileTitle(view, {
        space: clients.find((client) => view.kind === "client" && client.id === view.clientId)?.name,
        project: selectedProject?.name,
        livrable: viewVersions[0]?.name,
      })}
      navOpen={navOpen}
      onNav={() => setNavOpenAt(navOpen ? null : pathname)}
      onSearch={() => setPaletteOpen(true)}
    />
    <main className="app-shell" data-nav-open={navOpen || undefined}>
      {navOpen && <div className="mobile-scrim" aria-hidden="true" onClick={() => setNavOpenAt(null)} />}
      {inProject && selectedProject ? (
        <ProjectSidebar
          panelWidth={panelWidths.panel}
          onPanelResize={(width) => resizePanel("panel", width)}
          livrableName={viewVersions[0]?.name ?? "Livrable"}
          livrableMenu={livrableMenu}
          systemMenu={systemMenu}
          versions={sidebarVersions}
          view={view}
          panel={sidebarPanel}
          onPanel={showPanel}
          canvasHref={href.deliverable(selectedProject.id, livrableRootId)}
          onNavigate={(target) => router.push(target)}
          livrables={projectLivrables}
          newVersion={newVersion}
          onNewLivrable={() => setNewDeliverableOpen(true)}
        />
      ) : (
        <HomeSidebar
          view={view}
          clients={clients}
          favorites={sidebarFavorites}
          notifications={bellNotifications}
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
              sharedOnce={Object.values(reviewLinks).some((link) => (link.invites?.length ?? 0) > 0)}
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
          <div className="editor" style={{ "--inspector-width": `${panelWidths.inspector}px` } as React.CSSProperties}>
            {/* First visit of a deliverable: what each tool is for. */}
            {!isReadOnlyVersion && <DeliverableTour />}
            {/* Same name as the deliverable card cover: the cover grows into the canvas on open. */}
            <ViewTransition name={`livrable-${livrableRootId}`} share="kora-open" default="none">
            <ReviewCanvas
              deliverable={currentDeliverable}
              siteSetup={
                currentDeliverable.type === "Link" && currentDeliverable.url ? (
                  <SiteToolbarSnippet siteUrl={currentDeliverable.url} />
                ) : undefined
              }
              comments={activeComments}
              selectedId={selectedComment?.id ?? null}
              isUnread={(comment) => unreadIn(comment as Comment) > 0}
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
                setInspectorTab(inspectorTabOf(comment));
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
                    { label: "Exporter en PDF", icon: <FileDown />, disabled: activeComments.length === 0, onSelect: exportRequests },
                  ]}
                />
                </>
              }
              overlay={
                <>
                  {/* No decider on this version yet: told at the top of the canvas, whatever the deliverable. */}
                  {!isReadOnlyVersion && linkDeciders(reviewLinks[`${currentDeliverable.id}:${currentDeliverable.version}`]).length === 0 && (
                    <NoDeciderBanner key={`${currentDeliverable.id}:${currentDeliverable.version}`} version={`${currentDeliverable.id}:${currentDeliverable.version}`} onInvite={shareThisVersion} />
                  )}
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
                  me="agency"
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
                    sideOf(comment) === "agency" && isAgencyDraft(comment) && !isReadOnlyVersion && !isDecisionLocked(comment.id)
                      ? () => {
                          deleteComment(comment.id);
                          setThreadOpen(false);
                        }
                      : undefined
                  }
                  // Closed, it moves to « Commentaires · Clôturés »; the client still reads it (agencyActions.ts).
                  onArchive={(closed) => {
                    setInspectorTab(closed ? "closed" : inspectorTabOf({ ...comment, closed: false }));
                    void agencyAction(`comments/${comment.id}/closure`, "PUT", { closed });
                  }}
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
              notifications={<Notifications notifications={bellNotifications} feedback={clientFeedback} onMarkAllRead={markAllRead} compact />}
              unread={(comment) => unreadIn(comment as Comment)}
              outsideStatus={(comment) => outsideStatusOf({ state: proposalStateFor(comment.id), decision: proposalDecisionFor(comment.id), adaptation: adaptationRequests[comment.id] })}
              proposalSummary={(comment) => {
                // The status is the card's tag (src/lib/outsideStatus.ts): here, what was quoted.
                if (proposalStateFor(comment.id) === "none") return null;
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
                    {(proposalVersions[comment.id]?.length ?? 0) > 1 && <span>V{proposal?.version}</span>}
                  </span>
                );
              }}
              onAddRequest={isReadOnlyVersion ? undefined : setNewRequestKind}
              onShare={shareThisVersion}
              // The page the client sees, in a new tab, once its link is saved (read only for a member).
              onPreview={() => void ensureReviewLink().then((link) => link && window.open(`/review/${link.token}`, "_blank", "noopener"))}
              width={panelWidths.inspector}
              onResize={(width) => resizePanel("inspector", width)}
            />
          </div>
          </>
        )}
          <NewRequestDialog initial={newRequestKind} onClose={() => setNewRequestKind(null)} onCreate={addRequest} />
          {reshare && (
            <ReshareDialog
              key={reshare.deliverableId}
              version={`V${String(reshare.version).padStart(2, "0")}`}
              previousVersion={`V${String(reshare.previousVersion).padStart(2, "0")}`}
              people={reshare.people}
              onShare={shareNewVersion}
              onLater={() => setReshare(null)}
            />
          )}
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
                        <AddonInput id="proposal-amount" addon="€" type="number" min="0" step="0.01" placeholder="850" value={newProposalAmount} onChange={(event) => setNewProposalAmount(event.target.value)} />
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
                <span className="scope-card-label">Inclus</span>
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
                    {comment.decision === "Inclus" ? "Inclus" : comment.decision === "Hors périmètre" ? "Hors scope" : "À clarifier"}
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

          <ShareDialog
            open={shareOpen || shareFromBell}
            onClose={closeShare}
            // The deliverable, not its file name: a long one would fill the sentence.
            subject={currentDeliverable ? `ce livrable (V${String(currentDeliverable.version).padStart(2, "0")})` : "cette version"}
            link={reviewLink}
            readOnly={isReadOnlyVersion}
            canManage={canManage}
            inviteDraft={inviteDraft}
            onInviteDraft={(value) => {
              setInviteDraft(value);
              setInviteError("");
            }}
            inviteError={inviteError}
            onInvite={() => void inviteByEmail()}
            previousPeople={Boolean(currentDeliverable && previousPeople(currentDeliverable, currentDeliverable.version, deliverables, reviewLinks))}
            onReusePrevious={() => {
              closeShare();
              shareCurrentVersion();
            }}
            onCopyInvite={(invite) => void copyInviteLink(invite)}
            onRemoveInvite={removeInvite}
            onChangeRole={changeInviteRole}
            accessRequests={reviewLink ? accessRequests.filter((request) => request.linkKey === linkKeyOf(reviewLink)) : []}
            onDecideAccess={(request, decision) => {
              const found = accessRequests.find((candidate) => candidate.email === request.email && reviewLink && candidate.linkKey === linkKeyOf(reviewLink));
              if (found) void decideAccessRequest(found, decision);
            }}
            linkCopied={linkCopied}
            onCopyLink={() => void copyReviewLink()}
            onRevoke={() => {
              if (!adminOnly() || !reviewLink) return;
              closeShare();
              void agencyAction(`deliverables/${reviewLink.deliverableId ?? currentDeliverable.id}/review-link`, "DELETE").then((result) => result && toast("Lien de revue révoqué"));
            }}
            lastReminderAt={reviewLink?.lastReminderAt ?? null}
            onRemind={() => void remindClient()}
          />

          {(() => {
            const request = confirmSendId !== null ? comments.find((comment) => comment.id === confirmSendId) : undefined;
            const draft = confirmSendId !== null ? proposalVersions[confirmSendId]?.find((proposal) => proposal.status === "draft") : undefined;
            const linkKey = currentDeliverable ? `${currentDeliverable.id}:${currentDeliverable.version}` : "";
            return (
              <SendProposalDialog
                proposal={request && draft ? { title: request.title ?? request.message, amount: draft.amount, deadline: draft.deadline } : null}
                // The proposal goes to the deciders invited on this version; with none, the server refuses it.
                deciders={linkDeciders(reviewLinks[linkKey]).map((invite) => invite.email)}
                canManage={canManage}
                onClose={() => setConfirmSendId(null)}
                onSend={() => confirmSendId !== null && sendQuotedProposal(confirmSendId)}
                onShare={() => {
                  setConfirmSendId(null);
                  if (reviewLinks[linkKey]?.invites?.length) openShareDialog();
                  else shareCurrentVersion();
                }}
              />
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
                <AddonInput id="version-amount" addon="€" type="number" min="0" step="0.01" placeholder="850" value={newProposalAmount} onChange={(event) => setNewProposalAmount(event.target.value)} />
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
    const result = await callReviewAccess("invite", { linkKey: linkKeyOf(reviewLink), emails: fresh, role: "decider" });
    if (!result) return;
    setInviteDraft("");
    setInviteError("");
    toast(fresh.length > 1 ? `${fresh.length} invitations envoyées` : `Invitation envoyée à ${fresh[0]}`);
  }

  /** Accepts (the address is invited and receives its link) or refuses a request for access. */
  /** Mails every invited client a reminder with their personal link (once a day per link, checked by the server). */
  async function remindClient() {
    if (isReadOnlyVersion || !reviewLink?.invites?.length) return;
    const result = await callReviewAccess("remind", { linkKey: linkKeyOf(reviewLink) });
    if (!result) return;
    const count = reviewLink.invites.length;
    toast(count > 1 ? `Relance envoyée à ${count} personnes` : `Relance envoyée à ${reviewLink.invites[0]?.email}`);
  }

  async function decideAccessRequest(request: AccessRequest, decision: "accepted" | "refused") {
    const result = await callReviewAccess("requests", { linkKey: request.linkKey, email: request.email, decision });
    if (!result) return;
    setAccessRequests((current) => current.filter((candidate) => candidate !== request));
    toast(decision === "accepted" ? `Accès accordé à ${request.email}` : `Demande de ${request.email} refusée`);
  }

  /** Invitation endpoints (the link exists: sharing created it); the answer updates it here. */
  async function callReviewAccess(action: "invite" | "requests" | "remind", body: Record<string, unknown>) {
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
    await refreshSharedState();
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

  /** Shares a version with the people chosen in "Partager la V03 ?", each with their role, by a "new version" mail. */
  async function shareNewVersion(choice: ReshareChoice) {
    if (!reshare) return;
    const answer = await agencyAction(`deliverables/${reshare.deliverableId}/review-link`, "POST");
    if (!answer?.link) return;
    const linkKey = `${reshare.deliverableId}:${reshare.version}`;
    for (const role of ["decider", "contributor"] as const) {
      const emails = choice.filter((person) => person.role === role).map((person) => person.email);
      if (emails.length && !(await callReviewAccess("invite", { linkKey, emails, role, newVersion: true }))) {
        toast.error("Le partage n’a pas abouti. Réessayez depuis « Partager la revue ».");
        return;
      }
    }
    toast(`V${String(reshare.version).padStart(2, "0")} partagée avec ${choice.length > 1 ? `${choice.length} personnes` : "1 personne"}`);
    setReshare(null);
  }

  /** The version open in the editor, shared with the people of its previous version, or the share dialog when there were none. */
  function shareCurrentVersion() {
    const previous = currentDeliverable ? previousPeople(currentDeliverable, currentDeliverable.version, deliverables, reviewLinks) : null;
    if (previous && currentDeliverable)
      setReshare({ deliverableId: currentDeliverable.id, version: currentDeliverable.version, previousVersion: previous.version, people: previous.people });
    else openShareDialog();
  }

  function changeInviteRole(email: string, role: ClientRole) {
    if (!reviewLink) return;
    void agencyAction(`deliverables/${reviewLink.deliverableId ?? currentDeliverable.id}/review-link/invites/${encodeURIComponent(email)}`, "PATCH", { role });
  }

  function removeInvite(email: string) {
    if (!reviewLink) return;
    void agencyAction(`deliverables/${reviewLink.deliverableId ?? currentDeliverable.id}/review-link/invites/${encodeURIComponent(email)}`, "DELETE");
  }
}


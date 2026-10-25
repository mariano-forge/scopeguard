"use client";

import { ViewTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronLeft, ChevronRight, CircleHelp, FolderClosed, Gift, HandCoins, Hourglass, LayoutGrid, List, MessageSquareDot, Pencil, PieChart, Plus, RotateCcw, Share2, Star, Trash2, TrendingUp } from "lucide-react";
import { DeliverableCover } from "@/components/DeliverableCover";
import { Select } from "@/components/Select";
import { GettingStarted } from "./GettingStarted";
import { href, hrefForRecord, livrableIdOf, versionsOfLivrable, type AgencyView } from "./routes";
import { TodoList, isAgencyAction, type TodoItem } from "./TodoList";
import { StatusMark, type TabStatus } from "./TabBar";
import { ConfirmDeleteDialog, EntitySettings, LivrableMenu } from "./EntitySettings";
import type { TrashItem } from "./AgencyApp";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import { BreakdownTable, KeyFigures, ProposalChart, RegisterTable, ScopeChart, type HomeAnalyticsData } from "./HomeAnalytics";
import { LivrableFilter, type LivrableGroup } from "./LivrableFilter";
import { deliverableKinds, pickableTypes, type DeliverableType } from "@/components/deliverableKinds";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hint } from "@/components/hint";
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from "@/components/ui/select";
import type { ProjectScope, ScopeAmendment } from "@/lib/projectScope";
import { ProjectScopeEditor } from "./ProjectScope";
import { ProjectTracking } from "./ProjectTracking";
import { ProjectRequests } from "./ProjectRequests";
import type { BoardInput, BoardRequest } from "./requestBoard";
import { ScopeRecommendation } from "./ScopeRecommendation";
import { TeamPage } from "./TeamPage";
import { HelpPage } from "./HelpPage";
import { SharedWithMe } from "./SharedWithMe";

type Client = { id: number; name: string; email: string };
type Project = { id: number; name: string; clientId?: number; status: string; scope?: ProjectScope };
type Deliverable = {
  id: number;
  projectId?: number;
  name: string;
  type: DeliverableType;
  version: number;
  status: string;
  importedAt: string;
  fileData?: string;
  coverData?: string;
};
type Comment = { id: number; deliverableId?: number; decision: string };

/** Figures for the home overview, computed by AgencyApp for a set of deliverables. */
export type HomeOverview = {
  acceptedEuros: number;
  acceptedCount: number;
  acceptedDays: number;
  pendingEuros: number;
  pendingCount: number;
  toQualify: number;
  /** Share of qualified requests that are out of scope, null when nothing is qualified yet. */
  outsideRate: number | null;
  /** Accepted share of the proposals the client answered, null before any answer. */
  conversionRate: number | null;
  totalDemands: number;
  approved: number;
  livrables: number;
  /** Rows of the breakdown table: spaces (everything selected) or the selected deliverables. */
  breakdown: {
    kind: "space" | "livrable";
    rows: { key: string; label: string; href: string; client?: Client; counts: number[]; toQualify: number; outside: number; acceptedEuros: number }[];
  };
  analytics: HomeAnalyticsData;
};

type BrowserViewProps = {
  view: AgencyView;
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  comments: Comment[];
  /** A project's accepted out-of-scope quotes: its scope's amendments. */
  amendmentsFor: (projectId: number) => ScopeAmendment[];
  /** What a project's « Suivi » is computed from. */
  /** A project's figures (« Suivi ») and its requests' board (« Demandes »), from the same reading. */
  trackingFor: (projectId: number) => BoardInput;
  recentLivrableIds: number[];
  /** A request whose proposal waits for the client's answer (src/lib/outsideStatus.ts « sent »). */
  isAwaitingClient: (commentId: number) => boolean;
  todoItems: TodoItem[];
  /** Home figures for a selection of deliverables (null = all). */
  overviewFor: (selection: number[] | null) => HomeOverview;
  livrableGroups: LivrableGroup[];
  favorites: string[];
  /** A version was already shared with someone of a client (« Bien démarrer »). */
  sharedOnce: boolean;
  error?: string;
  onNewClient: () => void;
  onNewProject: () => void;
  onNewDeliverable: () => void;
  onRenameClient: (clientId: number, name: string) => void;
  onRenameProject: (projectId: number, name: string) => void;
  onToggleFavorite: (key: string) => void;
  onDeleteClient: (clientId: number) => void;
  onDeleteProject: (projectId: number) => void;
  /** Owner or administrator: may delete spaces and projects and empty the trash. */
  canManage: boolean;
  onMoveProject: (projectId: number, clientId: number) => void;
  /** Returns false when the target project already has a deliverable with that name. */
  onMoveLivrable: (livrableId: number, projectId: number) => boolean;
  onDeleteLivrable: (livrableId: number) => void;
  /** Returns an error message when the name cannot be used. */
  onRenameLivrable: (livrableId: number, name: string) => string | null;
  /** Review status of a deliverable (its latest version), as shown on tabs. */
  livrableStatus: (livrableId: number) => TabStatus;
  /** Unread client messages on the latest version. */
  livrableUnread: (livrableId: number) => number;
  trash: TrashItem[];
  onRestore: (itemId: number) => void;
  /** Without an id: empty the whole trash. */
  onPurge: (itemId?: number) => void;
};

type SortKey = "recent" | "name";
/** « Récents »: opened last first, the other way, or by name. */
type RecentOrder = "recent" | "oldest" | "name";
type Layout = "grid" | "list";

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
// Narrow no-break spaces (fr-FR grouping) are invisible in some fonts: use a regular no-break space.
const euros = (value: number) => `${value.toLocaleString("fr-FR").replace(/\u202f/g, "\u00a0")}\u00a0€`;
const layoutKey = "kora-browser-layout";

/** "Modifié aujourd'hui à 14:32" / "Modifié le 14 oct. 2026, 10:32". */
const modifiedLabel = (importedAt: string) => {
  const text = importedAt.trim();
  if (!text) return "Date inconnue";
  return /^\d/.test(text) ? `Modifié le ${text}` : `Modifié ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
};

/** Space avatar colors: status pairs, all ≥ 7:1 (see tokens.css). */
const avatarTones = ["low", "resolved", "scope", "clarify", "medium", "high"];

export function SpaceAvatar({ client, size = "md" }: { client: Client; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`space-avatar space-avatar-${size} tone-${avatarTones[client.id % avatarTones.length]}`} aria-hidden="true">
      {client.name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Page title that turns into a field on click (Enter saves, Escape cancels). */
function RenamableTitle({ value, label, onRename }: { value: string; label: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const name = draft.trim();
    if (name && name !== value) onRename(name);
    setEditing(false);
  }

  if (editing)
    return (
      <input
        ref={inputRef}
        className="title-input"
        value={draft}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );

  return (
    <h1 className="page-title">
      <button
        type="button"
        className="title-button"
        title={label}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        <span>{value}</span>
        <Pencil aria-hidden="true" />
        <span className="sr-only">, {label.toLowerCase()}</span>
      </button>
    </h1>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Star; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon />
      </span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

type NavigationHistory = { canGoBack?: boolean; canGoForward?: boolean; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void };
const historyOf = () => (typeof window === "undefined" ? undefined : (window as unknown as { navigation?: NavigationHistory }).navigation);

/**
 * Figma-like top line: history back/forward, then the parent to go up to (when there is one).
 * Arrows are disabled when the browser reports nothing to go back/forward to (Navigation API).
 */
function PageNav({ label, target }: { label?: string; target?: string }) {
  const router = useRouter();
  const [canGo, setCanGo] = useState({ back: true, forward: false });
  useEffect(() => {
    const navigation = historyOf();
    if (!navigation || navigation.canGoBack === undefined) return;
    // Deferred: the router changes history from an insertion effect, where React forbids state updates.
    let frame = requestAnimationFrame(() => setCanGo({ back: Boolean(navigation.canGoBack), forward: Boolean(navigation.canGoForward) }));
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCanGo({ back: Boolean(navigation.canGoBack), forward: Boolean(navigation.canGoForward) }));
    };
    navigation.addEventListener?.("currententrychange", update);
    return () => {
      cancelAnimationFrame(frame);
      navigation.removeEventListener?.("currententrychange", update);
    };
  }, []);
  return (
    <nav className="page-nav" aria-label="Historique">
      <button type="button" className="page-nav-button" onClick={() => router.back()} disabled={!canGo.back} aria-label="Page précédente" title="Page précédente">
        <ChevronLeft />
      </button>
      <button type="button" className="page-nav-button" onClick={() => router.forward()} disabled={!canGo.forward} aria-label="Page suivante" title="Page suivante">
        <ChevronRight />
      </button>
      {label && target && (
        <Link className="page-nav-label" href={target}>
          {label}
        </Link>
      )}
    </nav>
  );
}

/** Home, spaces, space, project, recents and shared pages: the "file browser" half of the navigation (Figma-like). */
export function BrowserView({
  view,
  clients,
  projects,
  deliverables,
  comments,
  amendmentsFor,
  trackingFor,
  recentLivrableIds,
  isAwaitingClient,
  todoItems,
  overviewFor,
  livrableGroups,
  favorites,
  sharedOnce,
  error,
  onNewClient,
  onNewProject,
  onNewDeliverable,
  onRenameClient,
  onRenameProject,
  onToggleFavorite,
  livrableStatus,
  livrableUnread,
  onDeleteClient,
  onDeleteProject,
  canManage,
  onMoveProject,
  onMoveLivrable,
  onDeleteLivrable,
  onRenameLivrable,
  trash,
  onRestore,
  onPurge,
}: BrowserViewProps) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("recent");
  const [layout, setLayout] = useState<Layout>("grid");
  const [recentType, setRecentType] = useState<DeliverableType | "all">("all");
  const [recentOrder, setRecentOrder] = useState<RecentOrder>("recent");
  const [recentAwaiting, setRecentAwaiting] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(layoutKey) === "list") setLayout("list");
    } catch {
      // Grid by default.
    }
  }, []);
  function changeLayout(next: Layout) {
    setLayout(next);
    try {
      window.localStorage.setItem(layoutKey, next);
    } catch {
      // Ignore storage failures.
    }
  }

  // Ids of every version of a deliverable: the highest one tells when it last changed.
  const idsOf = (record: Deliverable) =>
    versionsOfLivrable(livrableIdOf(record, deliverables), deliverables).map((version) => version.id);
  // Latest version of each deliverable of a project, most recently updated first.
  const latestOf = (projectId: number) =>
    [
      ...new Set(
        deliverables
          .filter((deliverable) => (deliverable.projectId ?? 1) === projectId)
          .map((deliverable) => livrableIdOf(deliverable, deliverables)),
      ),
    ]
      .map((livrableId) => versionsOfLivrable(livrableId, deliverables)[0])
      .filter((record): record is Deliverable => Boolean(record))
      .sort((left, right) => Math.max(...idsOf(right)) - Math.max(...idsOf(left)));
  const lastActivity = (projectId: number) =>
    Math.max(
      projectId,
      ...deliverables.filter((deliverable) => (deliverable.projectId ?? 1) === projectId).map((deliverable) => deliverable.id),
    );
  const sortProjects = (list: Project[]) =>
    [...list].sort((left, right) =>
      sort === "name" ? left.name.localeCompare(right.name, "fr") : lastActivity(right.id) - lastActivity(left.id),
    );
  const projectsOf = (clientId: number) => projects.filter((project) => (project.clientId ?? 1) === clientId);
  /** "2 projets, 5 livrables et 12 demandes" — what a deletion takes with it. */
  const impactOf = (projectIds: number[]) => {
    const latest = projectIds.flatMap((projectId) => latestOf(projectId));
    const recordIds = new Set(deliverables.filter((record) => projectIds.includes(record.projectId ?? 1)).map((record) => record.id));
    const requests = comments.filter((comment) => recordIds.has(comment.deliverableId ?? -1)).length;
    const parts = [
      ...(projectIds.length > 1 || view.kind === "client" ? [plural(projectIds.length, "projet")] : []),
      plural(latest.length, "livrable"),
      plural(requests, "demande"),
    ].filter((part) => !part.startsWith("0 "));
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}` : (parts[0] ?? "");
  };

  /** Favorite toggle, beside a link (no button inside a link). */
  function starButton(key: string, label: string) {
    const starred = favorites.includes(key);
    return (
      <button
        type="button"
        className={`star-button ${starred ? "is-starred" : ""}`}
        aria-pressed={starred}
        aria-label={starred ? `Retirer ${label} des favoris` : `Ajouter ${label} aux favoris`}
        title={starred ? "Retirer des favoris" : "Ajouter aux favoris"}
        onClick={() => onToggleFavorite(key)}
      >
        <Star />
      </button>
    );
  }

  /** Starrable card wrapper. */
  function card(key: string, target: string, className: string, label: string, children: React.ReactNode, corner?: React.ReactNode) {
    return (
      <div className="card-wrap" key={key}>
        <Link className={className} href={target}>
          {children}
        </Link>
        {corner}
        {starButton(key, label)}
      </div>
    );
  }

  /** Message pill: what the client wrote and nobody has read yet. */
  function unreadPill(livrableId: number) {
    const unread = livrableUnread(livrableId);
    if (unread === 0) return null;
    const label = unread > 1 ? `${unread} nouveaux messages du client` : "1 nouveau message du client";
    return (
      <span className="unread-pill" title={label}>
        <MessageSquareDot aria-hidden="true" />
        <span aria-hidden="true">{unread}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  /** Status beside a title, without the message count (shown as a pill). */
  function titleStatus(livrableId: number) {
    const status = livrableStatus(livrableId);
    return status.kind === "messages" ? null : <StatusMark status={status} />;
  }

  function livrableCard(record: Deliverable) {
    const versions = versionsOfLivrable(livrableIdOf(record, deliverables), deliverables);
    const versionLabel = (version: Deliverable) => `V${String(version.version).padStart(2, "0")}`;
    // Top-left of the cover (the star on the right): latest version by default, every version when there are several.
    const corner =
      versions.length > 1 ? (
        <div className="card-version">
          <Select
            label={`Version de ${record.name}`}
            value={String(record.id)}
            options={versions.map((version) => ({ value: String(version.id), label: versionLabel(version) }))}
            onChange={(id) => {
              const version = versions.find((candidate) => String(candidate.id) === id);
              if (version) router.push(hrefForRecord(version, deliverables));
            }}
          />
        </div>
      ) : (
        <span className="card-version card-version-single">{versionLabel(record)}</span>
      );
    const livrableId = livrableIdOf(record, deliverables);
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const space = project && clients.find((client) => client.id === (project.clientId ?? 1));
    const requests = comments.filter((comment) => versions.some((version) => version.id === comment.deliverableId)).length;
    const menu = (
      <LivrableMenu
        name={record.name}
        location={project && space ? `${space.name} / ${project.name}` : null}
        pinned={favorites.includes(`l:${livrableId}`)}
        deleteImpact={[plural(versions.length, "version"), requests ? plural(requests, "demande") : null].filter(Boolean).join(" et ")}
        onTogglePin={() => onToggleFavorite(`l:${livrableId}`)}
        onRename={(name) => onRenameLivrable(livrableId, name)}
        onDelete={() => onDeleteLivrable(livrableId)}
      />
    );
    return card(
      `l:${livrableIdOf(record, deliverables)}`,
      hrefForRecord(record, deliverables),
      "file-card",
      record.name,
      <>
        <span className="file-card-cover">
          {/* Shared with the editor canvas: the cover grows into it when the deliverable opens. */}
          <ViewTransition name={`livrable-${livrableId}`} share="kora-open" default="none">
            <DeliverableCover type={record.type} coverData={record.coverData} />
          </ViewTransition>
          {unreadPill(livrableId)}
        </span>
        <span className="file-card-body">
          <span className="file-card-title">
            <b>{record.name}</b>
            {titleStatus(livrableId)}
          </span>
          <small>{modifiedLabel(record.importedAt)}</small>
        </span>
      </>,
      <>
        {corner}
        {menu}
      </>,
    );
  }

  /** A deliverable as a row of a list (a project's page, « Récents »): its cover, name, version, status, date. */
  function livrableRow(record: Deliverable) {
    const livrableId = livrableIdOf(record, deliverables);
    return (
      <li key={record.id} className="browser-row-wrap">
        <Link className="browser-row" href={hrefForRecord(record, deliverables)}>
          <span className="row-thumb">
            {record.coverData ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL cover
              <img src={record.coverData} alt="" />
            ) : (
              <DeliverableIcon type={record.type} />
            )}
          </span>
          <span className="row-title">
            <b>{record.name}</b>
            {titleStatus(livrableId)}
            {unreadPill(livrableId)}
          </span>
          <small>V{String(record.version).padStart(2, "0")}</small>
          <small>{record.status}</small>
          <small>{record.importedAt}</small>
        </Link>
        {starButton(`l:${livrableId}`, record.name)}
      </li>
    );
  }

  /** Folder card (Figma): a strip of the project's latest deliverables, then the folder name. */
  function projectCard(project: Project) {
    const latest = latestOf(project.id);
    return card(
      `p:${project.id}`,
      href.project(project.id),
      "folder-card",
      project.name,
      <>
        <span className="folder-thumbs">
          {[0, 1, 2].map((index) =>
            latest[index] ? (
              <DeliverableCover key={latest[index].id} type={latest[index].type} coverData={latest[index].coverData} />
            ) : (
              <span className="cover cover-empty" key={`empty-${index}`} />
            ),
          )}
        </span>
        <span className="folder-card-body">
          <FolderClosed className="folder-icon" aria-hidden="true" />
          <span>
            <b>{project.name}</b>
            <small>
              {latest[0] ? `${plural(latest.length, "livrable")} · modifié ${latest[0].importedAt.toLowerCase()}` : "Aucun livrable"}
            </small>
          </span>
        </span>
      </>,
    );
  }

  function projectRow(project: Project) {
    const latest = latestOf(project.id);
    const client = clients.find((candidate) => candidate.id === (project.clientId ?? 1));
    return (
      <li key={project.id} className="browser-row-wrap">
        <Link className="browser-row" href={href.project(project.id)}>
          <span className="row-thumb">
            <FolderClosed className="folder-icon" aria-hidden="true" />
          </span>
          <b>{project.name}</b>
          <small>{client?.name}</small>
          <small>{plural(latest.length, "livrable")}</small>
          <small>{latest[0] ? latest[0].importedAt : "—"}</small>
        </Link>
        {starButton(`p:${project.id}`, project.name)}
      </li>
    );
  }

  function spaceCard(client: Client) {
    const count = projectsOf(client.id).length;
    return (
      <Link className="space-card" href={href.client(client.id)} key={client.id}>
        <SpaceAvatar client={client} />
        <span>
          <b>{client.name}</b>
          <small>{plural(count, "projet")}</small>
        </span>
      </Link>
    );
  }

  function projectCollection(list: Project[]) {
    if (list.length === 0) return null;
    const sorted = sortProjects(list);
    return layout === "grid" ? (
      <div className="folder-grid">{sorted.map(projectCard)}</div>
    ) : (
      <ul className="browser-list">{sorted.map(projectRow)}</ul>
    );
  }

  const viewControls = (
    <div className="view-controls">
      <Select
        label="Trier par"
        value={sort}
        onChange={setSort}
        options={[
          { value: "recent", label: "Dernière modification" },
          { value: "name", label: "Nom" },
        ]}
      />
      <div className="segmented" role="group" aria-label="Affichage">
        <button type="button" aria-pressed={layout === "grid"} aria-label="Grille" title="Grille" onClick={() => changeLayout("grid")}>
          <LayoutGrid />
        </button>
        <button type="button" aria-pressed={layout === "list"} aria-label="Liste" title="Liste" onClick={() => changeLayout("list")}>
          <List />
        </button>
      </div>
    </div>
  );

  // ----- Space (one client): Figma team page
  if (view.kind === "client") {
    const client = clients.find((candidate) => candidate.id === view.clientId);
    if (!client) return <NotFound />;
    const list = projectsOf(client.id);
    return (
      <div className="browser">
        <PageNav label="Tous les espaces" target={href.spaces()} />
        <header className="page-header">
          <div className="page-identity">
            <SpaceAvatar client={client} size="lg" />
            <RenamableTitle value={client.name} label="Renommer l’espace" onRename={(name) => onRenameClient(client.id, name)} />
          </div>
          <div className="page-actions">
            <EntitySettings
              kind="espace"
              name={client.name}
              deleteImpact={impactOf(list.map((project) => project.id))}
              onRename={(name) => onRenameClient(client.id, name)}
              onDelete={() => onDeleteClient(client.id)}
              deleteLocked={!canManage}
            />
            <Button size="lg" onClick={onNewProject}>
              <Plus aria-hidden="true" /> Ajouter un projet
            </Button>
          </div>
        </header>
        <div className="page-toolbar">
          <span className="page-count">{plural(list.length, "projet")}</span>
          {viewControls}
        </div>
        {projectCollection(list) ?? (
          <EmptyState icon={FolderClosed} title="Aucun projet" text="Créez un premier projet pour y importer des livrables." />
        )}
      </div>
    );
  }

  // ----- Project: its deliverables, or its scope
  if (view.kind === "project" || view.kind === "requests" || view.kind === "scope" || view.kind === "tracking") {
    const project = projects.find((candidate) => candidate.id === view.projectId);
    if (!project) return <NotFound />;
    const client = clients.find((candidate) => candidate.id === (project.clientId ?? 1));
    const latest = latestOf(project.id);
    const sorted = sort === "name" ? [...latest].sort((left, right) => left.name.localeCompare(right.name, "fr")) : latest;
    // A card of « Demandes » opens its request in the editor, on its version.
    const requestHref = (request: BoardRequest) => {
      const record = deliverables.find((candidate) => candidate.id === request.deliverableId);
      return record ? `${hrefForRecord(record, deliverables)}?demande=${request.id}` : href.project(project.id);
    };
    const tabs = (
      <nav className="project-tabs" aria-label="Sections du projet">
        <Link className="project-tab" href={href.project(project.id)} aria-current={view.kind === "project" ? "page" : undefined}>
          Livrables <small>{latest.length}</small>
        </Link>
        <Link className="project-tab" href={href.requests(project.id)} aria-current={view.kind === "requests" ? "page" : undefined}>
          Demandes
        </Link>
        <Link className="project-tab" href={href.scope(project.id)} aria-current={view.kind === "scope" ? "page" : undefined}>
          Périmètre
        </Link>
        <Link className="project-tab" href={href.tracking(project.id)} aria-current={view.kind === "tracking" ? "page" : undefined}>
          Suivi
        </Link>
      </nav>
    );
    return (
      <div className="browser">
        {client ? <PageNav label={client.name} target={href.client(client.id)} /> : <PageNav />}
        <header className="page-header">
          <div className="page-identity">
            <span className="page-icon" aria-hidden="true">
              <FolderClosed />
            </span>
            <RenamableTitle value={project.name} label="Renommer le projet" onRename={(name) => onRenameProject(project.id, name)} />
          </div>
          <div className="page-actions">
            {/* Its settings beside the main action, as on a space's page. */}
            <EntitySettings
              kind="projet"
              name={project.name}
              deleteImpact={impactOf([project.id])}
              onRename={(name) => onRenameProject(project.id, name)}
              onDelete={() => onDeleteProject(project.id)}
              deleteLocked={!canManage}
            />
            {/* On every tab of the project (feedback of 25 October 2026). */}
            <Button size="lg" onClick={onNewDeliverable}>
              <Plus aria-hidden="true" /> Ajouter un livrable
            </Button>
          </div>
        </header>
        {tabs}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        {view.kind === "tracking" ? (
          <ProjectTracking input={trackingFor(project.id)} />
        ) : view.kind === "requests" ? (
          <ProjectRequests input={trackingFor(project.id)} hrefOf={requestHref} />
        ) : view.kind === "scope" ? (
          // Re-keyed on what the server holds: once saved, the draft starts again from it.
          <ProjectScopeEditor
            key={JSON.stringify(project.scope ?? null)}
            projectId={project.id}
            scope={project.scope}
            amendments={amendmentsFor(project.id)}
          />
        ) : (
          <>
        <ScopeRecommendation projectId={project.id} scope={project.scope} />
        <div className="page-toolbar">
          <span className="page-count">{plural(latest.length, "livrable")}</span>
          {viewControls}
        </div>
        {sorted.length === 0 ? (
          <EmptyState icon={Plus} title="Aucun livrable" text="Ajoutez un premier livrable pour commencer : une maquette, un PDF, une vidéo ou le lien d’un site, que votre client commentera." />
        ) : layout === "grid" ? (
          <div className="file-grid">{sorted.map((record) => livrableCard(record))}</div>
        ) : (
          <ul className="browser-list">{sorted.map((record) => livrableRow(record))}</ul>
        )}
          </>
        )}
      </div>
    );
  }

  // ----- All spaces
  if (view.kind === "spaces") {
    const sorted = [...clients].sort((left, right) => left.name.localeCompare(right.name, "fr"));
    return (
      <div className="browser">
        <PageNav />
        <header className="page-header">
          <h1 className="page-title">Tous les espaces</h1>
          <Button size="lg" onClick={onNewClient}>
            <Plus aria-hidden="true" /> Ajouter un espace
          </Button>
        </header>
        {sorted.length === 0 ? (
          <EmptyState icon={FolderClosed} title="Aucun espace" text="Créez un espace par client pour y ranger ses projets." />
        ) : (
          <div className="space-grid">{sorted.map(spaceCard)}</div>
        )}
        <OrphansSection
          clients={clients}
          projects={projects}
          deliverables={deliverables}
          onMoveProject={onMoveProject}
          onDeleteProject={(projectId) => onDeleteProject(projectId)}
          onMoveLivrable={onMoveLivrable}
          onDeleteLivrable={onDeleteLivrable}
          canManage={canManage}
        />
      </div>
    );
  }

  if (view.kind === "trash") return <TrashPage items={trash} onRestore={onRestore} onPurge={onPurge} canPurge={canManage} />;
  if (view.kind === "team") return <TeamPage />;
  if (view.kind === "help") {
    // The guided tour replays on the deliverable opened last.
    const latest = recentLivrableIds.map((livrableId) => versionsOfLivrable(livrableId, deliverables)[0]).find(Boolean);
    return <HelpPage tourHref={latest ? hrefForRecord(latest, deliverables) : undefined} />;
  }

  if (view.kind === "shared") return <SharedWithMe />;

  // One card per deliverable, even if older saves stored several ids for it.
  const recentRecords = recentLivrableIds
    .map((livrableId) => versionsOfLivrable(livrableId, deliverables)[0])
    .filter((record): record is Deliverable => Boolean(record))
    .filter((record, index, list) => list.findIndex((other) => other.id === record.id) === index);

  if (view.kind === "recents") {
    // A proposal sent on one of its versions, waiting for the client's answer.
    const awaiting = (record: Deliverable) => {
      const versionIds = new Set(versionsOfLivrable(livrableIdOf(record, deliverables), deliverables).map((version) => version.id));
      return comments.some((comment) => versionIds.has(comment.deliverableId ?? -1) && isAwaitingClient(comment.id));
    };
    // Every kind one can create, Figma's screens under « Figma »; an old « Document » only when one is there.
    const familyOf = (type: DeliverableType): DeliverableType => (type === "Screens" ? "Figma" : type);
    const types = [...pickableTypes, ...(recentRecords.some((record) => record.type === "Doc") ? (["Doc"] as const) : [])];
    const ofType = recentRecords.filter((record) => recentType === "all" || familyOf(record.type) === recentType);
    // Counted among the deliverables of the type chosen: the number is what the button shows.
    const awaitingCount = ofType.filter(awaiting).length;
    const shown = ofType
      .filter((record) => !recentAwaiting || awaiting(record))
      .sort((left, right) => (recentOrder === "name" ? left.name.localeCompare(right.name, "fr") : 0));
    // Opened last first, as kept; the oldest first, the other way.
    if (recentOrder === "oldest") shown.reverse();
    const filtered = recentType !== "all" || recentAwaiting;
    return (
      <div className="browser">
        <header className="page-header">
          <h1 className="page-title">Récents</h1>
        </header>
        {recentRecords.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer les livrables récents">
            <UiSelect value={recentType} onValueChange={(next) => setRecentType(next as DeliverableType | "all")}>
              <UiSelectTrigger aria-label="Type de fichier" className="w-48">
                <UiSelectValue />
              </UiSelectTrigger>
              <UiSelectContent position="popper">
                <UiSelectItem value="all">Tous les types</UiSelectItem>
                {types.map((type) => (
                  <UiSelectItem key={type} value={type}>
                    {deliverableKinds[type]?.label ?? type}
                  </UiSelectItem>
                ))}
              </UiSelectContent>
            </UiSelect>
            <UiSelect value={recentOrder} onValueChange={(next) => setRecentOrder(next as RecentOrder)}>
              <UiSelectTrigger aria-label="Trier" className="w-48">
                <UiSelectValue />
              </UiSelectTrigger>
              <UiSelectContent position="popper">
                <UiSelectItem value="recent">Plus récents</UiSelectItem>
                <UiSelectItem value="oldest">Plus anciens</UiSelectItem>
                <UiSelectItem value="name">Ordre alphabétique</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
            <Button
              variant="outline"
              className="h-8 aria-pressed:border-[var(--ink)] aria-pressed:bg-[var(--mist)]"
              aria-pressed={recentAwaiting}
              onClick={() => setRecentAwaiting((current) => !current)}
            >
              <Hourglass aria-hidden="true" /> Propositions en attente <span className="tabular-nums text-muted-foreground">{awaitingCount}</span>
            </Button>
            <div className="segmented ml-auto" role="group" aria-label="Affichage">
              <button type="button" aria-pressed={layout === "grid"} aria-label="Grille" onClick={() => changeLayout("grid")}>
                <LayoutGrid />
              </button>
              <button type="button" aria-pressed={layout === "list"} aria-label="Liste" onClick={() => changeLayout("list")}>
                <List />
              </button>
            </div>
          </div>
        )}
        {recentRecords.length === 0 ? (
          <EmptyState icon={FolderClosed} title="Rien d’ouvert récemment" text="Les livrables que vous ouvrez apparaîtront ici." />
        ) : shown.length === 0 ? (
          <EmptyState icon={Hourglass} title="Aucun livrable pour ces filtres" text={filtered ? "Essayez un autre type, ou sans « Propositions en attente »." : "Rien à montrer."} />
        ) : layout === "grid" ? (
          <div className="file-grid">{shown.map((record) => livrableCard(record))}</div>
        ) : (
          <ul className="browser-list">{shown.map((record) => livrableRow(record))}</ul>
        )}
      </div>
    );
  }

  if (view.kind === "not-found") return <NotFound />;

  const agencyActions = todoItems.filter(isAgencyAction);
  const awaitingClient = todoItems.filter((item) => !isAgencyAction(item));

  if (view.kind === "todo") {
    return (
      <div className="browser">
        <header className="page-header">
          <div>
            <h1 className="page-title">À traiter</h1>
            <p className="page-subtitle">Les décisions en attente, sur la dernière version de chaque livrable.</p>
          </div>
        </header>
        <section className="browser-section">
          <h2>À vous de jouer · {agencyActions.length}</h2>
          {agencyActions.length === 0 ? (
            <p className="browser-empty">Rien à traiter : chaque demande est qualifiée.</p>
          ) : (
            <TodoList items={agencyActions} />
          )}
        </section>
        <section className="browser-section">
          <h2>En attente du client · {awaitingClient.length}</h2>
          {awaitingClient.length === 0 ? (
            <p className="browser-empty">Aucune proposition en attente de réponse.</p>
          ) : (
            <TodoList items={awaitingClient} />
          )}
        </section>
      </div>
    );
  }

  // ----- Home: global overview, each section filtered on its own deliverables
  return (
    <HomePage
      overviewFor={overviewFor}
      livrableGroups={livrableGroups}
      onNewProject={onNewProject}
      gettingStarted={
        <GettingStarted
          spaces={clients.length}
          projects={projects.length}
          deliverables={deliverables.length}
          shared={sharedOnce}
          firstDeliverableHref={deliverables[0] ? hrefForRecord(deliverables[0], deliverables) : undefined}
          onNewClient={onNewClient}
          onNewProject={onNewProject}
          onNewDeliverable={onNewDeliverable}
        />
      }
    />
  );
}

/** Section title with its own "Tous les livrables" filter on the right. */
function SectionHeader({
  title,
  filter,
  onFilter,
  groups,
}: {
  title: React.ReactNode;
  filter: number[] | null;
  onFilter: (value: number[] | null) => void;
  groups: LivrableGroup[];
}) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <LivrableFilter groups={groups} value={filter} onChange={onFilter} label={`Filtrer « ${typeof title === "string" ? title : "la section"} »`} />
    </div>
  );
}

function HomePage({
  overviewFor,
  livrableGroups,
  onNewProject,
  gettingStarted,
}: {
  overviewFor: (selection: number[] | null) => HomeOverview;
  livrableGroups: LivrableGroup[];
  onNewProject: () => void;
  /** « Bien démarrer », in a panel on the right while the agency sets itself up (nothing once done or hidden). */
  gettingStarted: React.ReactNode;
}) {
  const [filters, setFilters] = useState<Record<"figures" | "scope" | "proposals" | "register" | "breakdown", number[] | null>>({
    figures: null,
    scope: null,
    proposals: null,
    register: null,
    breakdown: null,
  });
  const setFilter = (section: keyof typeof filters) => (value: number[] | null) => setFilters((current) => ({ ...current, [section]: value }));
  const figures = overviewFor(filters.figures);
  const scope = overviewFor(filters.scope).analytics;
  const proposals = overviewFor(filters.proposals).analytics;
  const register = overviewFor(filters.register).analytics.register;
  const breakdown = overviewFor(filters.breakdown).breakdown;
  const percent = (value: number | null) => (value === null ? "—" : `${value} %`);
  const tiles = [
    { label: "En attente du client", value: euros(figures.pendingEuros), icon: Hourglass },
    { label: "Taux d’acceptation", value: percent(figures.conversionRate), icon: TrendingUp },
    { label: "À clarifier", value: String(figures.toQualify), icon: CircleHelp },
    { label: "Part hors scope", value: percent(figures.outsideRate), icon: PieChart },
    // What the agency gave: offers sent, valued (src/lib/requestOffer.ts); the requests' count heads « Arbitrages de périmètre ».
    { label: "Offert au client", value: euros(figures.analytics.offeredEuros), icon: Gift },
    { label: "Livrables validés", value: `${figures.approved} / ${figures.livrables}`, icon: BadgeCheck },
  ];
  const breakdownTitle = breakdown.kind === "space" ? "Demandes et revenus par espace" : "Demandes et revenus par livrable";
  const breakdownColumns = breakdown.kind === "space" ? ["Espace", "Projets", "Livrables"] : ["Livrable", "Versions"];

  return (
    <div className="browser">
      <header className="page-header">
        <h1 className="page-title">Vue d’ensemble</h1>
        <Button size="lg" onClick={onNewProject}>
          <Plus aria-hidden="true" /> Ajouter un projet
        </Button>
      </header>

      {/* The figures, and « Bien démarrer » beside them; alone, they take the whole width. */}
      <div className="home-layout">
      <div className="home-main">
      <section className="browser-section">
        <SectionHeader title="Chiffres clés" filter={filters.figures} onFilter={setFilter("figures")} groups={livrableGroups} />
        <KeyFigures
          hero={{
            label: "Revenu hors scope accepté",
            value: euros(figures.acceptedEuros),
            icon: HandCoins,
            note: `${plural(figures.acceptedCount, "proposition acceptée").replace("propositions acceptée", "propositions acceptées")}${figures.acceptedDays > 0 ? ` · +${figures.acceptedDays} j` : ""}`,
          }}
          tiles={tiles}
        />
      </section>

      {/* Two sections, each with its own filter: how the requests were qualified, where the proposals stand. */}
      <section className="browser-section">
        <SectionHeader title="Arbitrages de périmètre" filter={filters.scope} onFilter={setFilter("scope")} groups={livrableGroups} />
        <ScopeChart data={scope} />
      </section>

      <section className="browser-section">
        <SectionHeader title="Propositions au client" filter={filters.proposals} onFilter={setFilter("proposals")} groups={livrableGroups} />
        <ProposalChart data={proposals} />
      </section>

      {/* The spaces side by side, then each request: what the agency reads first. */}
      <section className="browser-section">
        <SectionHeader title={breakdownTitle} filter={filters.breakdown} onFilter={setFilter("breakdown")} groups={livrableGroups} />
        <BreakdownTable
          columns={breakdownColumns}
          rows={breakdown.rows.map(({ client, ...row }) => ({ ...row, avatar: client && <SpaceAvatar client={client} size="sm" /> }))}
        />
      </section>

      <section className="browser-section">
        <SectionHeader title={`Registre des demandes · ${register.length}`} filter={filters.register} onFilter={setFilter("register")} groups={livrableGroups} />
        <RegisterTable rows={register} />
      </section>
      </div>
      <div className="home-aside">{gettingStarted}</div>
      </div>
    </div>
  );
}

const trashKinds = { space: "Espace", project: "Projet", livrable: "Livrable" } as const;

/** Deleted spaces, projects and deliverables: restore them, or erase them for good. */
function TrashPage({
  items,
  onRestore,
  onPurge,
  canPurge,
}: {
  items: TrashItem[];
  onRestore: (id: number) => void;
  onPurge: (id?: number) => void;
  /** Deleting for good is reserved to administrators; anyone can restore. */
  canPurge: boolean;
}) {
  const [confirm, setConfirm] = useState<{ title: string; run: () => void } | null>(null);
  // Time is read once when the page opens (render must stay pure).
  const [now] = useState(() => Date.now());
  const daysLeft = (deletedAt: number) => Math.max(0, 30 - Math.floor((now - deletedAt) / (24 * 60 * 60 * 1000)));
  const contentOf = (item: TrashItem) => {
    const livrables = new Set(item.data.deliverables.map((record) => `${record.projectId}:${record.name}`)).size;
    return [
      item.kind === "space" ? plural(item.data.projects.length, "projet") : null,
      item.kind !== "livrable" ? plural(livrables, "livrable") : null,
      plural(item.data.comments.length, "demande"),
    ]
      .filter(Boolean)
      .join(" · ");
  };
  return (
    <div className="browser">
      <header className="page-header">
        <div>
          <h1 className="page-title">Corbeille</h1>
          <p className="page-subtitle">Les éléments supprimés restent 30 jours ici avant d’être effacés.</p>
        </div>
        {items.length > 0 && (
          // Reserved to administrators: said on hover when it is not one's to do.
          <Hint label={canPurge ? "Effacer tout pour de bon" : "Réservé aux administrateurs de l’organisation"} side="bottom">
            <span>
              <Button size="lg" disabled={!canPurge} onClick={() => setConfirm({ title: "Vider la corbeille ?", run: () => onPurge() })}>
                <Trash2 aria-hidden="true" /> Vider la corbeille
              </Button>
            </span>
          </Hint>
        )}
      </header>
      {items.length === 0 ? (
        <EmptyState icon={Trash2} title="La corbeille est vide" text="Les espaces, projets et livrables supprimés apparaîtront ici." />
      ) : (
        <Table aria-label="Éléments supprimés">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Élément</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Emplacement</TableHead>
              <TableHead>Contenu</TableHead>
              <TableHead>Effacement</TableHead>
              <TableHead className="w-44">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableHead scope="row" className="h-auto py-2.5 text-sm font-medium text-foreground">
                  <span className="flex items-center gap-3">
                    {item.kind === "space" ? (
                      <SpaceAvatar client={item.data.clients[0] ?? { id: item.id, name: item.name, email: "" }} size="sm" />
                    ) : item.kind === "project" ? (
                      <FolderClosed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <DeliverableIcon type={item.data.deliverables[0]?.type ?? "PDF"} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="max-w-64 truncate">{item.name}</span>
                  </span>
                </TableHead>
                <TableCell>{trashKinds[item.kind]}</TableCell>
                <TableCell className="text-muted-foreground">{item.origin || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{contentOf(item)}</TableCell>
                <TableCell className={daysLeft(item.deletedAt) <= 3 ? "text-[var(--status-high-text)]" : "text-muted-foreground"}>
                  {daysLeft(item.deletedAt) === 0 ? "Aujourd’hui" : `Dans ${plural(daysLeft(item.deletedAt), "jour")}`}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => onRestore(item.id)}>
                      <RotateCcw aria-hidden="true" /> Restaurer
                    </Button>
                    <Hint label={canPurge ? "Supprimer définitivement" : "Supprimer définitivement : réservé aux administrateurs de l’organisation"} side="left">
                      <span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Supprimer définitivement ${item.name}`}
                          disabled={!canPurge}
                          onClick={() => setConfirm({ title: `Supprimer définitivement « ${item.name} » ?`, run: () => onPurge(item.id) })}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </Hint>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {confirm && (
        <ConfirmDeleteDialog
          title={confirm.title}
          impact=""
          confirmLabel="Supprimer définitivement"
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Projects whose space no longer exists, deliverables whose project no longer exists
 * (e.g. lost by an older multi-tab save): re-attach or delete them.
 */
function OrphansSection({
  clients,
  projects,
  deliverables,
  onMoveProject,
  onDeleteProject,
  onMoveLivrable,
  onDeleteLivrable,
  canManage,
}: {
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  onMoveProject: (projectId: number, clientId: number) => void;
  onDeleteProject: (projectId: number) => void;
  canManage: boolean;
  onMoveLivrable: (livrableId: number, projectId: number) => boolean;
  onDeleteLivrable: (livrableId: number) => void;
}) {
  const [confirm, setConfirm] = useState<{ title: string; run: () => void } | null>(null);
  const [error, setError] = useState("");
  const clientIds = new Set(clients.map((client) => client.id));
  const projectIds = new Set(projects.map((project) => project.id));
  const orphanProjects = projects.filter((project) => !clientIds.has(project.clientId ?? 1));
  const orphanLivrables = [...new Set(deliverables.filter((record) => !projectIds.has(record.projectId ?? 1)).map((record) => livrableIdOf(record, deliverables)))]
    .map((livrableId) => ({ livrableId, latest: versionsOfLivrable(livrableId, deliverables)[0] }))
    .filter((item) => item.latest);
  if (orphanProjects.length === 0 && orphanLivrables.length === 0) return null;

  const spaceOptions = [{ value: "", label: "Rattacher à un espace…" }, ...clients.map((client) => ({ value: String(client.id), label: client.name }))];
  const projectOptions = [
    { value: "", label: "Rattacher à un projet…" },
    ...projects
      .filter((project) => clientIds.has(project.clientId ?? 1))
      .map((project) => ({ value: String(project.id), label: `${clients.find((client) => client.id === (project.clientId ?? 1))?.name} / ${project.name}` })),
  ];
  return (
    <section className="browser-section orphans">
      <h2>À ranger</h2>
      <p className="browser-empty">Ces éléments ne sont plus rattachés à un espace ou à un projet. Rattachez-les ailleurs ou supprimez-les.</p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ul className="browser-list">
        {orphanProjects.map((project) => (
          <li key={`p-${project.id}`} className="orphan-row">
            <FolderClosed className="folder-icon" aria-hidden="true" />
            <b>{project.name}</b>
            <small>Projet sans espace</small>
            <Select label={`Rattacher ${project.name}`} value="" options={spaceOptions} onChange={(value) => value && onMoveProject(project.id, Number(value))} />
            <button type="button" className="ghost-button icon-only" aria-label={`Supprimer ${project.name}`} title={canManage ? "Supprimer" : "Supprimer : réservé aux administrateurs de l’organisation"} disabled={!canManage} onClick={() => setConfirm({ title: `Supprimer le projet « ${project.name} » ?`, run: () => onDeleteProject(project.id) })}>
              <Trash2 />
            </button>
          </li>
        ))}
        {orphanLivrables.map(({ livrableId, latest }) => (
          <li key={`l-${livrableId}`} className="orphan-row">
            <DeliverableIcon type={latest!.type} className="folder-icon" aria-hidden="true" />
            <b>{latest!.name}</b>
            <small>Livrable sans projet</small>
            <Select
              label={`Rattacher ${latest!.name}`}
              value=""
              options={projectOptions}
              onChange={(value) => {
                if (!value) return;
                setError(onMoveLivrable(livrableId, Number(value)) ? "" : `Ce projet contient déjà un livrable nommé « ${latest!.name} ».`);
              }}
            />
            <button type="button" className="ghost-button icon-only" aria-label={`Supprimer ${latest!.name}`} title="Mettre à la corbeille" onClick={() => setConfirm({ title: `Supprimer le livrable « ${latest!.name} » ?`, run: () => onDeleteLivrable(livrableId) })}>
              <Trash2 />
            </button>
          </li>
        ))}
      </ul>
      {confirm && (
        <ConfirmDeleteDialog
          title={confirm.title}
          impact=""
          toTrash
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}

function NotFound() {
  return (
    <div className="browser">
      <EmptyState icon={FolderClosed} title="Cette page n’existe pas" text="L’espace, le projet ou le livrable a peut-être été supprimé." />
      <Link className="ghost-button not-found-link" href={href.home()}>
        Revenir à l’accueil
      </Link>
    </div>
  );
}

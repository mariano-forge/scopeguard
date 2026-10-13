"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FolderClosed, LayoutDashboard, LayoutGrid, List, Pencil, Plus, Share2, Star } from "lucide-react";
import { DeliverableCover } from "@/components/DeliverableCover";
import { Select } from "@/components/Select";
import { href, hrefForRecord, livrableIdOf, versionsOfLivrable, type AgencyView } from "./routes";
import { TodoList, isAgencyAction, type TodoItem } from "./TodoList";
import { StatusMark, type TabStatus } from "./TabBar";

type Client = { id: number; name: string; email: string };
type Project = { id: number; name: string; clientId?: number; status: string };
type Deliverable = {
  id: number;
  projectId?: number;
  name: string;
  type: "PDF" | "Image";
  version: number;
  status: string;
  importedAt: string;
  fileData?: string;
};
type Comment = { deliverableId?: number; decision: string };

/** Figures for the home overview, computed by AgencyApp across every space. */
export type HomeOverview = {
  acceptedEuros: number;
  acceptedCount: number;
  acceptedDays: number;
  pendingEuros: number;
  pendingCount: number;
  toQualify: number;
  /** Share of qualified requests that are out of scope, null when nothing is qualified yet. */
  outsideRate: number | null;
  approved: number;
  livrables: number;
  spaces: { client: Client; projects: number; livrables: number; toQualify: number; outside: number; acceptedEuros: number }[];
  activity: { id: number; description: string; actor: string; timestamp: string }[];
};

type BrowserViewProps = {
  view: AgencyView;
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  comments: Comment[];
  recentLivrableIds: number[];
  todoItems: TodoItem[];
  overview: HomeOverview;
  favorites: string[];
  error?: string;
  onNewClient: () => void;
  onNewProject: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRenameClient: (clientId: number, name: string) => void;
  onRenameProject: (projectId: number, name: string) => void;
  onToggleFavorite: (key: string) => void;
  /** Review status of a deliverable (its latest version), as shown on tabs. */
  livrableStatus: (livrableId: number) => TabStatus;
};

type SortKey = "recent" | "name";
type RecentFilter = "all" | "todo" | "awaiting" | "approved" | "starred";
type Layout = "grid" | "list";

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
// Narrow no-break spaces (fr-FR grouping) are invisible in some fonts: use a regular no-break space.
const euros = (value: number) => `${value.toLocaleString("fr-FR").replace(/\u202f/g, "\u00a0")}\u00a0€`;
const layoutKey = "kora-browser-layout";

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
  recentLivrableIds,
  todoItems,
  overview,
  favorites,
  error,
  onNewClient,
  onNewProject,
  onImport,
  onRenameClient,
  onRenameProject,
  onToggleFavorite,
  livrableStatus,
}: BrowserViewProps) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [layout, setLayout] = useState<Layout>("grid");
  const [recentFilter, setRecentFilter] = useState<RecentFilter>("all");

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
  const toQualify = (record: Deliverable) =>
    comments.filter((comment) => comment.deliverableId === record.id && comment.decision === "À qualifier").length;

  /** Starrable card wrapper (the star sits beside the link: no button inside a link). */
  function card(key: string, target: string, className: string, label: string, children: React.ReactNode) {
    const starred = favorites.includes(key);
    return (
      <div className="card-wrap" key={key}>
        <Link className={className} href={target}>
          {children}
        </Link>
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
      </div>
    );
  }

  function livrableCard(record: Deliverable, showProject = false) {
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const pending = toQualify(record);
    return card(
      `l:${livrableIdOf(record, deliverables)}`,
      hrefForRecord(record, deliverables),
      "file-card",
      record.name,
      <>
        <DeliverableCover type={record.type} />
        <span className="file-card-body">
          <span className="file-card-title">
            <b>{record.name}</b>
            <StatusMark status={livrableStatus(livrableIdOf(record, deliverables))} />
          </span>
          <small>
            {showProject && project ? `${project.name} · ` : ""}V{String(record.version).padStart(2, "0")} · {record.importedAt}
          </small>
          {pending > 0 && <span className="browser-badge">{plural(pending, "demande")} à qualifier</span>}
        </span>
      </>,
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
              <DeliverableCover key={latest[index].id} type={latest[index].type} />
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
      <li key={project.id}>
        <Link className="browser-row" href={href.project(project.id)}>
          <FolderClosed className="folder-icon" aria-hidden="true" />
          <b>{project.name}</b>
          <small>{client?.name}</small>
          <small>{plural(latest.length, "livrable")}</small>
          <small>{latest[0] ? latest[0].importedAt : "—"}</small>
        </Link>
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
          <button className="primary-button" onClick={onNewProject}>
            <Plus /> Projet
          </button>
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

  // ----- Project: its deliverables
  if (view.kind === "project") {
    const project = projects.find((candidate) => candidate.id === view.projectId);
    if (!project) return <NotFound />;
    const client = clients.find((candidate) => candidate.id === (project.clientId ?? 1));
    const latest = latestOf(project.id);
    const sorted = sort === "name" ? [...latest].sort((left, right) => left.name.localeCompare(right.name, "fr")) : latest;
    return (
      <div className="browser">
        {client ? <PageNav label={client.name} target={href.client(client.id)} /> : <PageNav />}
        <header className="page-header">
          <div className="page-identity">
            <span className="page-icon">
              <FolderClosed />
            </span>
            <RenamableTitle value={project.name} label="Renommer le projet" onRename={(name) => onRenameProject(project.id, name)} />
          </div>
          <div className="page-actions">
            <Link className="ghost-button" href={href.dashboard(project.id)}>
              <LayoutDashboard /> Tableau de bord
            </Link>
            <label className="primary-button file-button">
              <Plus /> Livrable
              <input type="file" accept="application/pdf,image/*" onChange={onImport} aria-label="Importer un livrable (PDF ou image)" />
            </label>
          </div>
        </header>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <div className="page-toolbar">
          <span className="page-count">{plural(latest.length, "livrable")}</span>
          {viewControls}
        </div>
        {sorted.length === 0 ? (
          <EmptyState icon={Plus} title="Aucun livrable" text="Importez un PDF ou une image pour lancer la première revue." />
        ) : layout === "grid" ? (
          <div className="file-grid">{sorted.map((record) => livrableCard(record))}</div>
        ) : (
          <ul className="browser-list">
            {sorted.map((record) => (
              <li key={record.id}>
                <Link className="browser-row" href={hrefForRecord(record, deliverables)}>
                  <b>{record.name}</b>
                  <small>V{String(record.version).padStart(2, "0")}</small>
                  <small>{record.status}</small>
                  <small>{record.importedAt}</small>
                </Link>
              </li>
            ))}
          </ul>
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
          <button className="primary-button" onClick={onNewClient}>
            <Plus /> Espace
          </button>
        </header>
        {sorted.length === 0 ? (
          <EmptyState icon={FolderClosed} title="Aucun espace" text="Créez un espace par client pour y ranger ses projets." />
        ) : (
          <div className="space-grid">{sorted.map(spaceCard)}</div>
        )}
      </div>
    );
  }

  if (view.kind === "shared")
    return (
      <div className="browser">
        <PageNav />
        <header className="page-header">
          <h1 className="page-title">Partagés avec moi</h1>
        </header>
        <EmptyState
          icon={Share2}
          title="Rien de partagé pour l’instant"
          text="Les projets et livrables qu’un collègue partage avec vous apparaîtront ici."
        />
      </div>
    );

  const recentRecords = recentLivrableIds
    .map((livrableId) => versionsOfLivrable(livrableId, deliverables)[0])
    .filter((record): record is Deliverable => Boolean(record));

  if (view.kind === "recents") {
    // Quick filters over recently opened deliverables (Figma "Recently viewed").
    const matches = (record: Deliverable, filter: RecentFilter) => {
      const livrableId = livrableIdOf(record, deliverables);
      const status = livrableStatus(livrableId).kind;
      if (filter === "todo") return status === "changes-requested" || status === "to-qualify";
      if (filter === "awaiting") return status === "awaiting-client" || status === "none";
      if (filter === "approved") return status === "approved";
      if (filter === "starred") return favorites.includes(`l:${livrableId}`);
      return true;
    };
    const filters: { value: RecentFilter; label: string }[] = [
      { value: "all", label: "Tous" },
      { value: "todo", label: "À traiter" },
      { value: "awaiting", label: "En attente du client" },
      { value: "approved", label: "Approuvés" },
      { value: "starred", label: "Favoris" },
    ];
    const shown = recentRecords.filter((record) => matches(record, recentFilter));
    return (
      <div className="browser">
        <PageNav />
        <header className="page-header">
          <h1 className="page-title">Récents</h1>
          <div className="filter-chips" role="group" aria-label="Filtrer les livrables récents">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`filter ${recentFilter === filter.value ? "active-filter" : ""}`}
                aria-pressed={recentFilter === filter.value}
                onClick={() => setRecentFilter(filter.value)}
              >
                {filter.value === "starred" && <Star aria-hidden="true" />}
                {filter.label} <span>{recentRecords.filter((record) => matches(record, filter.value)).length}</span>
              </button>
            ))}
          </div>
        </header>
        {recentRecords.length === 0 ? (
          <EmptyState icon={FolderClosed} title="Rien d’ouvert récemment" text="Les livrables que vous ouvrez apparaîtront ici." />
        ) : shown.length === 0 ? (
          <EmptyState icon={Star} title="Aucun livrable pour ce filtre" text="Essayez un autre filtre ou revenez à « Tous »." />
        ) : (
          <div className="file-grid">{shown.map((record) => livrableCard(record, true))}</div>
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
        <PageNav />
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

  // ----- Home: global overview (figures, pending decisions, spaces breakdown, activity)
  const tiles = [
    { label: "En attente du client", value: euros(overview.pendingEuros), note: plural(overview.pendingCount, "proposition") },
    { label: "Demandes à qualifier", value: String(overview.toQualify), note: "sur les dernières versions" },
    {
      label: "Part hors périmètre",
      value: overview.outsideRate === null ? "—" : `${overview.outsideRate} %`,
      note: "des demandes qualifiées",
    },
    { label: "Versions approuvées", value: `${overview.approved} / ${overview.livrables}`, note: "livrables validés par le client" },
  ];
  return (
    <div className="browser">
      <PageNav />
      <header className="page-header">
        <h1 className="page-title">Vue d’ensemble</h1>
        <button className="primary-button" onClick={onNewProject}>
          <Plus /> Projet
        </button>
      </header>

      <section className="overview" aria-label="Indicateurs">
        <div className="hero-stat">
          <span className="stat-label">Revenu supplémentaire accepté</span>
          <span className="hero-value">{euros(overview.acceptedEuros)}</span>
          <span className="stat-note">
            {overview.acceptedCount} proposition{overview.acceptedCount > 1 ? "s acceptées" : " acceptée"}
            {overview.acceptedDays > 0 ? ` · ${plural(overview.acceptedDays, "jour")} de délai accordé` : ""}
          </span>
        </div>
        <div className="stat-row">
          {tiles.map((tile) => (
            <div className="stat-tile" key={tile.label}>
              <span className="stat-label">{tile.label}</span>
              <span className="stat-value">{tile.value}</span>
              <span className="stat-note">{tile.note}</span>
            </div>
          ))}
        </div>
      </section>

      {agencyActions.length > 0 && (
        <section className="browser-section">
          <h2>
            <Link href={href.todo()}>À traiter · {agencyActions.length}</Link>
          </h2>
          <TodoList items={agencyActions.slice(0, 5)} />
          {agencyActions.length > 5 && (
            <Link className="browser-more" href={href.todo()}>
              Voir les {agencyActions.length} décisions
            </Link>
          )}
        </section>
      )}

      {overview.spaces.length > 0 && (
        <section className="browser-section">
          <h2>
            <Link href={href.spaces()}>Par espace</Link>
          </h2>
          <div className="overview-table-wrap">
            <table className="overview-table">
              <thead>
                <tr>
                  <th scope="col">Espace</th>
                  <th scope="col">Projets</th>
                  <th scope="col">Livrables</th>
                  <th scope="col">À qualifier</th>
                  <th scope="col">Hors périmètre</th>
                  <th scope="col">Revenu accepté</th>
                </tr>
              </thead>
              <tbody>
                {overview.spaces.map((row) => (
                  <tr key={row.client.id}>
                    <th scope="row">
                      <Link href={href.client(row.client.id)}>
                        <SpaceAvatar client={row.client} size="sm" />
                        <span>{row.client.name}</span>
                      </Link>
                    </th>
                    <td>{row.projects}</td>
                    <td>{row.livrables}</td>
                    <td>{row.toQualify}</td>
                    <td>{row.outside}</td>
                    <td>{euros(row.acceptedEuros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {overview.activity.length > 0 && (
        <section className="browser-section">
          <h2>Activité récente</h2>
          <ul className="activity-list">
            {overview.activity.map((event) => (
              <li key={event.id}>
                <span>{event.description}</span>
                <small>
                  {event.actor} · {event.timestamp}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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

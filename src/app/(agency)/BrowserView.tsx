"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FolderClosed, LayoutDashboard, LayoutGrid, List, Pencil, Plus, Share2, Star } from "lucide-react";
import { DeliverableThumbnail } from "@/components/DeliverableThumbnail";
import { href, hrefForRecord, livrableIdOf, versionsOfLivrable, type AgencyView } from "./routes";
import { TodoList, isAgencyAction, type TodoItem } from "./TodoList";

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

type BrowserViewProps = {
  view: AgencyView;
  clients: Client[];
  projects: Project[];
  deliverables: Deliverable[];
  comments: Comment[];
  recentLivrableIds: number[];
  todoItems: TodoItem[];
  error?: string;
  onNewClient: () => void;
  onNewProject: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRenameClient: (clientId: number, name: string) => void;
  onRenameProject: (projectId: number, name: string) => void;
};

type SortKey = "recent" | "name";
type Layout = "grid" | "list";

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;
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

/** Home, spaces, space, project, recents and shared pages: the "file browser" half of the navigation (Figma-like). */
export function BrowserView({
  view,
  clients,
  projects,
  deliverables,
  comments,
  recentLivrableIds,
  todoItems,
  error,
  onNewClient,
  onNewProject,
  onImport,
  onRenameClient,
  onRenameProject,
}: BrowserViewProps) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [layout, setLayout] = useState<Layout>("grid");

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

  function livrableCard(record: Deliverable, showProject = false) {
    const project = projects.find((candidate) => candidate.id === (record.projectId ?? 1));
    const pending = toQualify(record);
    return (
      <Link className="file-card" href={hrefForRecord(record, deliverables)} key={record.id}>
        <DeliverableThumbnail type={record.type} fileData={record.fileData} />
        <span className="file-card-body">
          <b>{record.name}</b>
          <small>
            {showProject && project ? `${project.name} · ` : ""}V{String(record.version).padStart(2, "0")} · {record.importedAt}
          </small>
          {pending > 0 && <span className="browser-badge">{plural(pending, "demande")} à qualifier</span>}
        </span>
      </Link>
    );
  }

  /** Folder card (Figma): a strip of the project's latest deliverables, then the folder name. */
  function projectCard(project: Project) {
    const latest = latestOf(project.id);
    return (
      <Link className="folder-card" href={href.project(project.id)} key={project.id}>
        <span className="folder-thumbs">
          {[0, 1, 2].map((index) =>
            latest[index] ? (
              <DeliverableThumbnail key={latest[index].id} type={latest[index].type} fileData={latest[index].fileData} />
            ) : (
              <span className="thumbnail thumbnail-empty" key={`empty-${index}`} />
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
      </Link>
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
      <label className="sort-select">
        <span className="sr-only">Trier par</span>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="recent">Dernière modification</option>
          <option value="name">Nom</option>
        </select>
      </label>
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
        <header className="page-header">
          <div className="page-identity">
            <SpaceAvatar client={client} size="lg" />
            <div>
              <RenamableTitle value={client.name} label="Renommer l’espace" onRename={(name) => onRenameClient(client.id, name)} />
              <p className="page-subtitle">{client.email}</p>
            </div>
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
        <header className="page-header">
          <div className="page-identity">
            <span className="page-icon">
              <FolderClosed />
            </span>
            <div>
              <RenamableTitle value={project.name} label="Renommer le projet" onRename={(name) => onRenameProject(project.id, name)} />
              {client && (
                <Link className="page-subtitle page-subtitle-link" href={href.client(client.id)}>
                  {client.name}
                </Link>
              )}
            </div>
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
  const recentProjects = [...new Set(recentRecords.map((record) => record.projectId ?? 1))]
    .map((projectId) => projects.find((project) => project.id === projectId))
    .filter((project): project is Project => Boolean(project));

  if (view.kind === "recents")
    return (
      <div className="browser">
        <header className="page-header">
          <h1 className="page-title">Récents</h1>
        </header>
        {recentRecords.length === 0 ? (
          <EmptyState icon={FolderClosed} title="Rien d’ouvert récemment" text="Les projets et livrables que vous ouvrez apparaîtront ici." />
        ) : (
          <>
            <section className="browser-section">
              <h2>Projets</h2>
              <div className="folder-grid">{recentProjects.map(projectCard)}</div>
            </section>
            <section className="browser-section">
              <h2>Livrables</h2>
              <div className="file-grid">{recentRecords.map((record) => livrableCard(record, true))}</div>
            </section>
          </>
        )}
      </div>
    );

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

  // ----- Home
  return (
    <div className="browser">
      <header className="page-header">
        <h1 className="page-title">Accueil</h1>
        <button className="primary-button" onClick={onNewProject}>
          <Plus /> Projet
        </button>
      </header>
      <section className="browser-section">
        <h2>
          <Link href={href.todo()}>À traiter · {agencyActions.length}</Link>
        </h2>
        {agencyActions.length === 0 ? (
          <p className="browser-empty">
            Rien à traiter{awaitingClient.length > 0 ? ` · ${plural(awaitingClient.length, "proposition")} en attente du client` : ""}.
          </p>
        ) : (
          <TodoList items={agencyActions.slice(0, 5)} />
        )}
        {agencyActions.length > 5 && (
          <Link className="browser-more" href={href.todo()}>
            Voir les {agencyActions.length} décisions
          </Link>
        )}
      </section>
      {recentRecords.length > 0 && (
        <section className="browser-section">
          <h2>
            <Link href={href.recents()}>Récents</Link>
          </h2>
          <div className="file-grid">{recentRecords.slice(0, 4).map((record) => livrableCard(record, true))}</div>
        </section>
      )}
      <section className="browser-section">
        <h2>
          <Link href={href.spaces()}>Espaces</Link>
        </h2>
        <div className="space-grid">{clients.map(spaceCard)}</div>
      </section>
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

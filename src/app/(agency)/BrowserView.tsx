"use client";

import Link from "next/link";
import { ArrowUpRight, FolderOpen, LayoutDashboard, Plus } from "lucide-react";
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
};

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/** Home, client and project pages: the "file browser" half of the navigation (Figma-like). */
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
}: BrowserViewProps) {
  const livrableIds = (projectId: number) => [
    ...new Set(
      deliverables
        .filter((deliverable) => (deliverable.projectId ?? 1) === projectId)
        .map((deliverable) => livrableIdOf(deliverable, deliverables)),
    ),
  ];
  const projectsOf = (clientId: number) => projects.filter((project) => (project.clientId ?? 1) === clientId);

  function livrableCard(livrableId: number, showProject = false) {
    const latest = versionsOfLivrable(livrableId, deliverables)[0];
    if (!latest) return null;
    const project = projects.find((candidate) => candidate.id === (latest.projectId ?? 1));
    const toQualify = comments.filter(
      (comment) => comment.deliverableId === latest.id && comment.decision === "À qualifier",
    ).length;
    return (
      <Link className="browser-card" href={hrefForRecord(latest, deliverables)} key={livrableId}>
        <DeliverableThumbnail type={latest.type} fileData={latest.fileData} />
        <span className="browser-card-body">
          <b>{latest.name}</b>
          <small>
            {showProject && project ? `${project.name} · ` : ""}V{String(latest.version).padStart(2, "0")} · {latest.importedAt}
          </small>
          <span className="browser-card-meta">
            <span className="browser-status">{latest.status}</span>
            {toQualify > 0 && <span className="browser-badge">{plural(toQualify, "demande")} à qualifier</span>}
          </span>
        </span>
      </Link>
    );
  }

  function projectCard(project: Project) {
    const ids = livrableIds(project.id);
    const count = ids.length;
    // Cover: latest version of the most recently created deliverable.
    const cover = versionsOfLivrable(Math.max(...ids), deliverables)[0];
    return (
      <Link className="browser-card" href={href.project(project.id)} key={project.id}>
        {cover ? (
          <DeliverableThumbnail type={cover.type} fileData={cover.fileData} />
        ) : (
          <span className="thumbnail thumbnail-empty">
            <FolderOpen />
          </span>
        )}
        <span className="browser-card-body">
          <b>{project.name}</b>
          <small>{plural(count, "livrable")}</small>
          <span className="browser-card-meta">
            <span className="browser-status">{project.status}</span>
          </span>
        </span>
      </Link>
    );
  }

  if (view.kind === "client") {
    const client = clients.find((candidate) => candidate.id === view.clientId);
    if (!client) return <NotFound />;
    const clientProjects = projectsOf(client.id);
    return (
      <div className="browser">
        <header className="browser-heading">
          <div>
            <p className="eyebrow">Client</p>
            <h1>{client.name}</h1>
            <p>{client.email}</p>
          </div>
          <button className="secondary-button" onClick={onNewProject}>
            <Plus /> Nouveau projet
          </button>
        </header>
        <section className="browser-section">
          <h2>Projets</h2>
          {clientProjects.length === 0 ? (
            <p className="browser-empty">Aucun projet pour ce client.</p>
          ) : (
            <div className="browser-grid">
              {clientProjects.map((project) => (
                projectCard(project)
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (view.kind === "project") {
    const project = projects.find((candidate) => candidate.id === view.projectId);
    if (!project) return <NotFound />;
    const client = clients.find((candidate) => candidate.id === (project.clientId ?? 1));
    const ids = livrableIds(project.id);
    return (
      <div className="browser">
        <header className="browser-heading">
          <div>
            <p className="eyebrow">
              Projet{client && (
                <>
                  {" · "}
                  <Link href={href.client(client.id)}>{client.name}</Link>
                </>
              )}
            </p>
            <h1>{project.name}</h1>
            <p>{plural(ids.length, "livrable")}</p>
          </div>
          <div className="heading-actions">
            <Link className="secondary-button" href={href.dashboard(project.id)}>
              <LayoutDashboard /> Tableau de bord
            </Link>
            <label className="secondary-button file-button">
              <Plus /> Importer un livrable
              <input type="file" accept="application/pdf,image/*" onChange={onImport} />
            </label>
          </div>
        </header>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <section className="browser-section">
          <h2>Livrables</h2>
          {ids.length === 0 ? (
            <p className="browser-empty">Importez un PDF ou une image pour lancer la première revue.</p>
          ) : (
            <div className="browser-grid">
              {ids.map((livrableId) => (
                livrableCard(livrableId)
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (view.kind === "not-found") return <NotFound />;

  const agencyActions = todoItems.filter(isAgencyAction);
  const awaitingClient = todoItems.filter((item) => !isAgencyAction(item));

  if (view.kind === "todo") {
    return (
      <div className="browser">
        <header className="browser-heading">
          <div>
            <p className="eyebrow">Tous les projets</p>
            <h1>À traiter</h1>
            <p>Les décisions en attente, sur la dernière version de chaque livrable.</p>
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

  const recents = recentLivrableIds.filter((id) => deliverables.some((deliverable) => deliverable.id === id));
  return (
    <div className="browser">
      <header className="browser-heading">
        <div>
          <p className="eyebrow">Accueil</p>
          <h1>Vos revues</h1>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={onNewClient}>
            <Plus /> Nouveau client
          </button>
          <button className="secondary-button" onClick={onNewProject}>
            <Plus /> Nouveau projet
          </button>
        </div>
      </header>
      <section className="browser-section">
        <h2>
          <Link href={href.todo()}>
            À traiter · {agencyActions.length} <ArrowUpRight />
          </Link>
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
      {recents.length > 0 && (
        <section className="browser-section">
          <h2>Récents</h2>
          <div className="browser-grid">
            {recents.map((livrableId) => (
              livrableCard(livrableId, true)
            ))}
          </div>
        </section>
      )}
      {clients.map((client) => (
        <section className="browser-section" key={client.id}>
          <h2>
            <Link href={href.client(client.id)}>
              {client.name} <ArrowUpRight />
            </Link>
          </h2>
          {projectsOf(client.id).length === 0 ? (
            <p className="browser-empty">Aucun projet pour ce client.</p>
          ) : (
            <div className="browser-grid">
              {projectsOf(client.id).map((project) => (
                projectCard(project)
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <div className="browser">
      <header className="browser-heading">
        <div>
          <p className="eyebrow">Introuvable</p>
          <h1>Cette page n’existe pas</h1>
          <p>Le client, le projet ou le livrable a peut-être été supprimé.</p>
        </div>
        <Link className="secondary-button" href={href.home()}>
          Revenir à l’accueil
        </Link>
      </header>
    </div>
  );
}

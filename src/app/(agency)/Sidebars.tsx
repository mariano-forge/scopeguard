"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  FileText,
  Folder,
  House,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  PanelLeftClose,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { StatusMark, type TabStatus } from "./TabBar";
import { href, type AgencyView } from "./routes";

type Notification = { id: number; message: string };
type Client = { id: number; name: string };
type Project = { id: number; name: string; clientId?: number };

/** Bell + popover. The popover opens beside the sidebar. */
function Notifications({ notifications, compact }: { notifications: Notification[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className={`notifications ${compact ? "is-compact" : ""}`} ref={rootRef}>
      <button
        className="sidebar-icon-button"
        aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`}
        aria-expanded={open}
        title="Notifications"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell />
        {notifications.length > 0 && <span className="notification-count">{notifications.length}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <b>Notifications</b>
          {notifications.length === 0 ? (
            <p>Aucune notification pour le moment.</p>
          ) : (
            notifications.slice(0, 5).map((notification) => (
              <div className="notification-item" key={notification.id}>
                <span className="notification-dot" />
                <div>
                  <span>{notification.message}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Home, to-do, client and project pages: account, search, shortcuts and the clients > projects tree (Figma home). */
export function HomeSidebar({
  view,
  clients,
  projects,
  agencyActionCount,
  notifications,
  onSearch,
  onNewClient,
}: {
  view: AgencyView;
  clients: Client[];
  projects: Project[];
  agencyActionCount: number;
  notifications: Notification[];
  onSearch: () => void;
  onNewClient: () => void;
}) {
  const projectId = view.kind === "project" ? view.projectId : null;
  return (
    <aside className="sidebar home-sidebar" aria-label="Navigation">
      <div className="sidebar-account">
        <span className="account">
          <span className="avatar dark-avatar">AM</span>
          <b>Alex Morgan</b>
        </span>
        <Notifications notifications={notifications} />
      </div>
      <button className="sidebar-search" onClick={onSearch}>
        <Search />
        <span>Rechercher</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="sidebar-scroll">
        <Link className={`nav-item ${view.kind === "home" ? "active" : ""}`} href={href.home()}>
          <span><House /></span> Accueil
        </Link>
        <Link className={`nav-item ${view.kind === "todo" ? "active" : ""}`} href={href.todo()}>
          <span><Inbox /></span> À traiter
          {agencyActionCount > 0 && <strong className="nav-count">{agencyActionCount}</strong>}
        </Link>
        <hr />
        <div className="nav-section">
          <span>Clients</span>
          <button className="nav-section-action" onClick={onNewClient} aria-label="Nouveau client" title="Nouveau client">
            <Plus />
          </button>
        </div>
        <ul className="nav-tree">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                className={`nav-item ${view.kind === "client" && view.clientId === client.id ? "active" : ""}`}
                href={href.client(client.id)}
              >
                <span><Building2 /></span> {client.name}
              </Link>
              <ul>
                {projects
                  .filter((project) => (project.clientId ?? 1) === client.id)
                  .map((project) => (
                    <li key={project.id}>
                      <Link
                        className={`nav-item nav-tree-leaf ${projectId === project.id ? "active" : ""}`}
                        href={href.project(project.id)}
                      >
                        <span><Folder /></span> {project.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        <hr />
        <a className="nav-item" href="#equipe">
          <span><Users /></span> Équipe
        </a>
      </nav>
      <div className="sidebar-bottom">
        <a className="nav-item" href="#aide">
          <span><CircleHelp /></span> Aide
        </a>
      </div>
    </aside>
  );
}

export type SidebarLivrable = {
  livrableId: number;
  name: string;
  type: "PDF" | "Image";
  href: string;
  status: TabStatus;
  active: boolean;
};
export type SidebarVersion = { id: number; label: string; meta: string; href: string; active: boolean };

/** Inside a project (deliverable, dashboard): icon rail + collapsible panel (Figma file view). */
export function ProjectSidebar({
  project,
  client,
  livrables,
  versions,
  versionChip,
  view,
  collapsed,
  onToggle,
  onSearch,
  onImport,
  agencyActionCount,
  notifications,
}: {
  project: Project;
  client?: Client;
  livrables: SidebarLivrable[];
  versions: SidebarVersion[];
  versionChip?: { label: string; tone: "resolved" | "high" | "medium" | "neutral" };
  view: AgencyView;
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  agencyActionCount: number;
  notifications: Notification[];
}) {
  return (
    <aside className={`sidebar project-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Navigation du projet">
      <nav className="rail" aria-label="Outils">
        <Link className="rail-logo" href={href.home()} aria-label="Kora, accueil" title="Accueil">
          <KoraMark />
        </Link>
        <button
          className={`rail-button ${!collapsed && view.kind === "deliverable" ? "is-active" : ""}`}
          onClick={onToggle}
          aria-label={collapsed ? "Afficher les livrables" : "Masquer le panneau"}
          aria-expanded={!collapsed}
          title="Livrables"
        >
          <FileText />
        </button>
        <Link
          className={`rail-button ${view.kind === "dashboard" ? "is-active" : ""}`}
          href={href.dashboard(project.id)}
          aria-label="Tableau de bord"
          title="Tableau de bord"
        >
          <LayoutDashboard />
        </Link>
        <Link className="rail-button" href={href.todo()} aria-label={`À traiter (${agencyActionCount})`} title="À traiter">
          <Inbox />
          {agencyActionCount > 0 && <span className="rail-dot" />}
        </Link>
        <button className="rail-button" onClick={onSearch} aria-label="Rechercher" title="Rechercher (Ctrl K)">
          <Search />
        </button>
        <span className="rail-spacer" />
        <Notifications notifications={notifications} compact />
        <a className="rail-button" href="#aide" aria-label="Aide" title="Aide">
          <CircleHelp />
        </a>
        <span className="avatar dark-avatar rail-avatar" title="Alex Morgan">
          AM
        </span>
      </nav>

      {!collapsed && (
        <div className="panel">
          <div className="panel-header">
            <Link className="panel-title" href={href.project(project.id)} title="Voir tous les livrables du projet">
              <span>{project.name}</span>
              <ChevronDown />
            </Link>
            <button className="sidebar-icon-button" onClick={onToggle} aria-label="Masquer le panneau" title="Masquer le panneau">
              <PanelLeftClose />
            </button>
          </div>
          <div className="panel-context">
            {client && <Link href={href.client(client.id)}>{client.name}</Link>}
            {versionChip && <span className={`chip chip-${versionChip.tone}`}>{versionChip.label}</span>}
          </div>

          <div className="panel-scroll">
            <section className="panel-section" aria-label="Livrables">
              <div className="panel-section-header">
                <h2>Livrables</h2>
                <label className="sidebar-icon-button" title="Importer un livrable">
                  <Plus />
                  <span className="sr-only">Importer un livrable</span>
                  <input type="file" accept="application/pdf,image/*" onChange={onImport} />
                </label>
              </div>
              <ul>
                {livrables.map((livrable) => (
                  <li key={livrable.livrableId}>
                    <Link
                      className={`panel-item ${livrable.active ? "is-active" : ""}`}
                      href={livrable.href}
                      aria-current={livrable.active ? "page" : undefined}
                    >
                      {livrable.type === "Image" ? <ImageIcon /> : <FileText />}
                      <span className="panel-item-label">{livrable.name}</span>
                      <StatusMark status={livrable.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {versions.length > 0 && (
              <section className="panel-section" aria-label="Versions">
                <div className="panel-section-header">
                  <h2>Versions</h2>
                </div>
                <ul>
                  {versions.map((version) => (
                    <li key={version.id}>
                      <Link
                        className={`panel-item ${version.active ? "is-active" : ""}`}
                        href={version.href}
                        aria-current={version.active ? "page" : undefined}
                      >
                        <span className="panel-version">{version.label}</span>
                        <span className="panel-item-label panel-item-meta">{version.meta}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

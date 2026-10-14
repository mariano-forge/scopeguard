"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  Clock,
  CircleHelp,
  FileText,
  FolderClosed,
  House,
  Layers,
  Lock,
  PanelLeftClose,
  Settings,
  Plus,
  Receipt,
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { href, type AgencyView } from "./routes";
import { SpaceAvatar } from "./BrowserView";
import { MenuButton, type MenuEntry } from "./editor/MenuButton";
import { ResizeHandle } from "./editor/ResizeHandle";

type Notification = { id: number; message: string };
type Client = { id: number; name: string; email: string };
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

/** Home pages (Figma home): account, search, shortcuts, starred, all client spaces. */
export type SidebarFavorite = { key: string; label: string; href: string; kind: "project" | "livrable" };

export function HomeSidebar({
  view,
  clients,
  favorites,
  notifications,
  onSearch,
  onNewClient,
}: {
  view: AgencyView;
  clients: Client[];
  favorites: SidebarFavorite[];
  notifications: Notification[];
  onSearch: () => void;
  onNewClient: () => void;
}) {
  const navLink = (target: string, active: boolean, icon: React.ReactNode, label: string, extra?: React.ReactNode) => (
    <Link className={`nav-item ${active ? "active" : ""}`} href={target} aria-current={active ? "page" : undefined}>
      <span>{icon}</span>
      <span className="nav-label">{label}</span>
      {extra}
    </Link>
  );
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
        {navLink(href.home(), view.kind === "home", <House />, "Accueil")}
        {navLink(href.recents(), view.kind === "recents", <Clock />, "Récents")}
        {navLink(href.shared(), view.kind === "shared", <Share2 />, "Partagés avec moi")}
        {navLink(href.trash(), view.kind === "trash", <Trash2 />, "Corbeille")}

        <div className="nav-section">
          <span>Favoris</span>
        </div>
        {favorites.length === 0 ? (
          <p className="nav-empty">Survolez un projet ou un livrable et cliquez sur l’étoile pour le retrouver ici.</p>
        ) : (
          <ul className="nav-tree">
            {favorites.map((favorite) => (
              <li key={favorite.key}>
                <Link className="nav-item" href={favorite.href} title={favorite.label}>
                  <span>{favorite.kind === "project" ? <FolderClosed /> : <FileText />}</span>
                  <span className="nav-label">{favorite.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="nav-section">
          <Link href={href.spaces()} className={view.kind === "spaces" ? "is-active" : ""}>
            Tous les espaces
          </Link>
          <button className="nav-section-action" onClick={onNewClient} aria-label="Nouvel espace" title="Nouvel espace">
            <Plus />
          </button>
        </div>
        <ul className="nav-tree">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                className={`nav-item ${view.kind === "client" && view.clientId === client.id ? "active" : ""}`}
                href={href.client(client.id)}
                title={client.name}
              >
                <SpaceAvatar client={client} size="sm" />
                <span className="nav-label">{client.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        <a className="nav-item" href="#equipe">
          <span><Users /></span>
          <span className="nav-label">Équipe</span>
        </a>
        <a className="nav-item" href="#aide">
          <span><CircleHelp /></span>
          <span className="nav-label">Aide</span>
        </a>
      </div>
    </aside>
  );
}

/** A version is shown like a Figma page: older ones are frozen (read-only). */
export type SidebarVersion = { id: number; label: string; meta: string; href: string; active: boolean; frozen: boolean };
export type PanelMode = "livrables";

/**
 * Inside a deliverable (canvas, proposals): icon rail + collapsible panel (Figma file view).
 * The gear opens the main menu; every rail action stays in the deliverable tab.
 */
export function ProjectSidebar({
  project,
  client,
  livrableName,
  livrableMenu,
  systemMenu,
  versions,
  versionChip,
  view,
  panel,
  onPanel,
  proposalsHref,
  canvasHref,
  proposalsBadge,
  onNavigate,
  notifications,
  panelWidth,
  onPanelResize,
}: {
  project: Project;
  client?: Client;
  livrableName: string;
  /** Shortcuts of the open deliverable, under its name. */
  livrableMenu: MenuEntry[];
  /** Main menu, under the logo. */
  systemMenu: MenuEntry[];
  versions: SidebarVersion[];
  versionChip?: { label: string; tone: "resolved" | "high" | "medium" | "neutral" };
  view: AgencyView;
  /** Panel content, or null when collapsed. */
  panel: PanelMode | null;
  onPanel: (mode: PanelMode | null) => void;
  proposalsHref: string;
  /** Canvas of the deliverable (from the proposals page). */
  canvasHref: string;
  /** Out-of-scope requests still waiting for a client decision. */
  proposalsBadge: number;
  /** Switches view inside the deliverable's tab (canvas, proposals). */
  onNavigate: (target: string) => void;
  notifications: Notification[];
  panelWidth: number;
  onPanelResize: (width: number) => void;
}) {
  return (
    <aside className={`sidebar project-sidebar ${panel ? "" : "is-collapsed"}`} aria-label="Navigation du livrable">
      <nav className="rail" aria-label="Outils">
        <MenuButton
          className="rail-logo"
          label="Menu principal"
          trigger={<Settings />}
          menuClassName="system-menu"
          entries={systemMenu}
        />
        {view.kind === "deliverable" ? (
          <button
            className={`rail-button ${panel ? "is-active" : ""}`}
            onClick={() => onPanel(panel ? null : "livrables")}
            aria-label="Canevas, versions et annexes"
            aria-pressed={Boolean(panel)}
            title="Canevas, versions et annexes"
          >
            <Layers />
          </button>
        ) : (
          <button
            className="rail-button"
            onClick={() => {
              onPanel("livrables");
              onNavigate(canvasHref);
            }}
            aria-label="Revenir au canevas"
            title="Revenir au canevas"
          >
            <Layers />
          </button>
        )}
        <button
          className={`rail-button ${view.kind === "proposals" ? "is-active" : ""}`}
          onClick={() => onNavigate(proposalsHref)}
          aria-label={`Propositions financières${proposalsBadge ? ` (${proposalsBadge} à traiter)` : ""}`}
          aria-pressed={view.kind === "proposals"}
          title="Propositions financières"
        >
          <Receipt />
          {proposalsBadge > 0 && <span className="rail-badge">{proposalsBadge}</span>}
        </button>
        <span className="rail-spacer" />
        <Notifications notifications={notifications} compact />
        <span className="avatar dark-avatar rail-avatar" title="Alex Morgan">
          AM
        </span>
      </nav>

      {panel && (
        <div className="panel" style={{ width: panelWidth }}>
          <ResizeHandle edge="right" width={panelWidth} min={200} max={420} defaultWidth={248} label="Largeur du panneau des versions" onResize={onPanelResize} />
          <div className="panel-header">
            <MenuButton
              className="panel-title"
              label={`Actions du livrable ${livrableName}`}
              trigger={
                <>
                  <span>{livrableName}</span>
                  <ChevronDown />
                </>
              }
              menuClassName="livrable-menu"
              entries={livrableMenu}
            />
            <button className="sidebar-icon-button" onClick={() => onPanel(null)} aria-label="Masquer le panneau" title="Masquer le panneau (Ctrl \)">
              <PanelLeftClose />
            </button>
          </div>
          <div className="panel-context">
            <span className="panel-path">
              {client && <Link href={href.client(client.id)}>{client.name}</Link>}
              {client && <span aria-hidden="true">/</span>}
              <Link href={href.project(project.id)}>{project.name}</Link>
            </span>
            {versionChip && <span className={`chip chip-${versionChip.tone}`}>{versionChip.label}</span>}
          </div>

          <div className="panel-scroll">
            <section className="panel-section" aria-label="Versions">
              <div className="panel-section-header">
                <h2>Versions</h2>
              </div>
              <ul>
                {versions.map((version) => (
                  <li key={version.id}>
                    <Link
                      className={`panel-item panel-page ${version.active ? "is-active" : ""}`}
                      href={version.href}
                      aria-current={version.active ? "page" : undefined}
                    >
                      <span className="panel-version">{version.label}</span>
                      <span className="panel-item-label panel-item-meta">{version.meta}</span>
                      {version.frozen ? (
                        <Lock className="panel-lock" aria-label="Figée, lecture seule" />
                      ) : (
                        <span className="panel-current">En cours</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

          </div>
        </div>
      )}
    </aside>
  );
}

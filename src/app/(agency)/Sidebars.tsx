"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  CircleHelp,
  FileText,
  FolderClosed,
  House,
  Layers,
  LayoutDashboard,
  Lock,
  PanelLeftClose,
  Paperclip,
  Plus,
  Receipt,
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { StatusMark, type TabStatus } from "./TabBar";
import { href, type AgencyView } from "./routes";
import { SpaceAvatar } from "./BrowserView";
import type { DeliverableType } from "@/components/deliverableKinds";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import { MenuButton, type MenuEntry } from "./editor/MenuButton";

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

export type SidebarLivrable = {
  livrableId: number;
  name: string;
  type: DeliverableType;
  href: string;
  status: TabStatus;
  active: boolean;
};
/** A version is shown like a Figma page: older ones are frozen (read-only). */
export type SidebarVersion = { id: number; label: string; meta: string; href: string; active: boolean; frozen: boolean };
export type SidebarAnnex = { id: number; name: string; meta: string; href: string };
export type PanelMode = "livrables";

/**
 * Inside a deliverable (canvas, dashboard, proposals): icon rail + collapsible panel (Figma file view).
 * The logo opens the main menu; every rail action is about the open deliverable.
 */
export function ProjectSidebar({
  project,
  client,
  livrableName,
  livrableMenu,
  systemMenu,
  livrables,
  versions,
  annexes,
  onAddAnnex,
  versionChip,
  view,
  panel,
  onPanel,
  dashboardHref,
  proposalsHref,
  canvasHref,
  proposalsBadge,
  onSearch,
  onNewDeliverable,
  notifications,
}: {
  project: Project;
  client?: Client;
  livrableName: string;
  /** Shortcuts of the open deliverable, under its name. */
  livrableMenu: MenuEntry[];
  /** Main menu, under the logo. */
  systemMenu: MenuEntry[];
  livrables: SidebarLivrable[];
  versions: SidebarVersion[];
  annexes: SidebarAnnex[];
  onAddAnnex: (file: File) => void;
  versionChip?: { label: string; tone: "resolved" | "high" | "medium" | "neutral" };
  view: AgencyView;
  /** Panel content, or null when collapsed. */
  panel: PanelMode | null;
  onPanel: (mode: PanelMode | null) => void;
  dashboardHref: string;
  proposalsHref: string;
  /** Canvas of the deliverable (from the dashboard or the proposals page). */
  canvasHref: string;
  /** Out-of-scope requests still waiting for a client decision. */
  proposalsBadge: number;
  onSearch: () => void;
  onNewDeliverable: () => void;
  notifications: Notification[];
}) {
  const [othersOpen, setOthersOpen] = useState(false);
  return (
    <aside className={`sidebar project-sidebar ${panel ? "" : "is-collapsed"}`} aria-label="Navigation du livrable">
      <nav className="rail" aria-label="Outils">
        <MenuButton
          className="rail-logo"
          label="Menu principal"
          trigger={
            <>
              <KoraMark />
              <ChevronDown className="rail-logo-chevron" />
            </>
          }
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
          <Link
            className="rail-button"
            href={canvasHref}
            onClick={() => onPanel("livrables")}
            aria-label="Revenir au canevas"
            title="Revenir au canevas"
          >
            <Layers />
          </Link>
        )}
        <Link
          className={`rail-button ${view.kind === "proposals" ? "is-active" : ""}`}
          href={proposalsHref}
          aria-label={`Propositions hors périmètre${proposalsBadge ? ` (${proposalsBadge} en attente)` : ""}`}
          title="Propositions hors périmètre"
        >
          <Receipt />
          {proposalsBadge > 0 && <span className="rail-badge">{proposalsBadge}</span>}
        </Link>
        <Link
          className={`rail-button ${view.kind === "dashboard" ? "is-active" : ""}`}
          href={dashboardHref}
          aria-label="Tableau de bord du livrable"
          title="Tableau de bord du livrable"
        >
          <LayoutDashboard />
        </Link>
        <button className="rail-button" onClick={onSearch} aria-label="Rechercher" title="Rechercher (Ctrl K)">
          <Search />
        </button>
        <span className="rail-spacer" />
        <Notifications notifications={notifications} compact />
        <span className="avatar dark-avatar rail-avatar" title="Alex Morgan">
          AM
        </span>
      </nav>

      {panel && (
        <div className="panel">
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

            <section className="panel-section" aria-label="Annexes">
              <div className="panel-section-header">
                <h2>Annexes</h2>
                <label className="sidebar-icon-button" title="Importer une annexe">
                  <Plus />
                  <input
                    type="file"
                    className="sr-only"
                    aria-label="Importer une annexe"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) onAddAnnex(file);
                    }}
                  />
                </label>
              </div>
              {annexes.length === 0 ? (
                <p className="panel-empty">Brief, charte, contrat… joignez ici les pièces utiles à ce livrable.</p>
              ) : (
                <ul>
                  {annexes.map((annex) => (
                    <li key={annex.id}>
                      <a className="panel-item" href={annex.href} download={annex.name} title={`Télécharger ${annex.name}`}>
                        <Paperclip />
                        <span className="panel-item-label">{annex.name}</span>
                        <small className="panel-item-meta">{annex.meta}</small>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel-section" aria-label="Livrables du projet">
              <div className="panel-section-header">
                <button className="panel-section-toggle" onClick={() => setOthersOpen((open) => !open)} aria-expanded={othersOpen}>
                  <ChevronRight className={othersOpen ? "is-open" : ""} />
                  <h2>Livrables du projet</h2>
                </button>
                <button className="sidebar-icon-button" onClick={onNewDeliverable} aria-label="Nouveau livrable" title="Nouveau livrable">
                  <Plus />
                </button>
              </div>
              {othersOpen && (
                <ul>
                  {livrables.map((livrable) => (
                    <li key={livrable.livrableId}>
                      <Link
                        className={`panel-item ${livrable.active ? "is-active" : ""}`}
                        href={livrable.href}
                        aria-current={livrable.active ? "page" : undefined}
                      >
                        <DeliverableIcon type={livrable.type} />
                        <span className="panel-item-label">{livrable.name}</span>
                        <StatusMark status={livrable.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </aside>
  );
}

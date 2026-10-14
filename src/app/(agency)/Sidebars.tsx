"use client";

import { useRef, useState } from "react";
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
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { href, type AgencyView } from "./routes";
import { SpaceAvatar } from "./BrowserView";
import { MenuButton, type MenuEntry } from "./editor/MenuButton";
import { ResizeHandle } from "./editor/ResizeHandle";
import { Hint } from "@/components/hint";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { timeLabel, useNow } from "./editor/CanvasComments";

type Notification = { id: number; message: string };
type Client = { id: number; name: string; email: string };
type Project = { id: number; name: string; clientId?: number };

/** What the client sent from its review space: a message (comment or reply), or "changes requested" on a version. */
export type ClientFeedback = {
  key: string;
  /** Comment / reply id (messages), deliverable id (changes). */
  id: number;
  kind: "message" | "changes";
  author: string;
  initials: string;
  message: string;
  time: string;
  createdAt?: number;
  /** "Northstar · landing.pdf V02" */
  context: string;
  href: string;
};

/** Bell + shadcn popover, opening beside the sidebar: client messages first, then the activity. */
function Notifications({
  notifications,
  feedback,
  onMarkAllRead,
  compact,
}: {
  notifications: Notification[];
  feedback: ClientFeedback[];
  onMarkAllRead: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const unread = feedback.length;
  return (
    <div className={`notifications ${compact ? "is-compact" : ""}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <Hint label="Notifications" side={compact ? "right" : "bottom"}>
          <PopoverTrigger asChild>
            <button className="sidebar-icon-button" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}>
              <Bell />
              {unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}
            </button>
          </PopoverTrigger>
        </Hint>
        <PopoverContent side={compact ? "right" : "bottom"} align="start" className="notification-panel w-96 gap-0 p-0" aria-label="Notifications">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-heading text-sm font-semibold">Notifications</p>
            {feedback.some((item) => item.kind === "message") && (
              <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
                Tout marquer comme lu
              </Button>
            )}
          </div>
          <div className="max-h-[min(480px,calc(100vh-8rem))] overflow-y-auto">
            <p className="notification-section">Messages du client{unread ? ` · ${unread}` : ""}</p>
            {feedback.length === 0 ? (
              <p className="px-4 pb-3 text-sm text-muted-foreground">Aucun nouveau message.</p>
            ) : (
              <ul>
                {feedback.map((item) => (
                  <li key={item.key}>
                    <Link className="notification-message" href={item.href} onClick={() => setOpen(false)}>
                      <span className="thread-avatar" aria-hidden="true">
                        {item.initials}
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <span className="flex items-baseline gap-2 text-sm">
                          <b className="truncate font-medium">{item.author}</b>
                          {timeLabel(item, now) && <small className="ml-auto shrink-0 text-xs text-muted-foreground">{timeLabel(item, now)}</small>}
                        </span>
                        <span className={`line-clamp-2 text-sm ${item.kind === "changes" ? "font-medium" : ""}`}>{item.message}</span>
                        <small className="truncate text-xs text-muted-foreground">{item.context}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {notifications.length > 0 && (
              <>
                <p className="notification-section">Activité</p>
                <ul className="grid gap-2 px-4 pb-3">
                  {notifications.slice(0, 5).map((notification) => (
                    <li className="notification-item" key={notification.id}>
                      <span className="notification-dot" />
                      <span>{notification.message}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
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
  feedback,
  onMarkAllRead,
  onSearch,
  onNewClient,
}: {
  view: AgencyView;
  clients: Client[];
  favorites: SidebarFavorite[];
  notifications: Notification[];
  feedback: ClientFeedback[];
  onMarkAllRead: () => void;
  onSearch: () => void;
  onNewClient: () => void;
}) {
  const navLink = (target: string, active: boolean, icon: React.ReactNode, label: string, extra?: React.ReactNode) => (
    <Link className={`nav-item ${active ? "active" : ""}`} href={target} aria-current={active ? "page" : undefined}>
      <span className="nav-icon">{icon}</span>
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
        <Notifications notifications={notifications} feedback={feedback} onMarkAllRead={onMarkAllRead} />
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
                  <span className="nav-icon">{favorite.kind === "project" ? <FolderClosed /> : <FileText />}</span>
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
          <Hint label="Nouvel espace" side="right">
            <button className="nav-section-action" onClick={onNewClient} aria-label="Nouvel espace">
              <Plus />
            </button>
          </Hint>
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
          <span className="nav-icon"><Users /></span>
          <span className="nav-label">Équipe</span>
        </a>
        <a className="nav-item" href="#aide">
          <span className="nav-icon"><CircleHelp /></span>
          <span className="nav-label">Aide</span>
        </a>
      </div>
    </aside>
  );
}

/** Deliverables of the project, in the side panel (the open one is active). */
export type SidebarLivrable = { id: number; name: string; href: string; active: boolean };

/** "+" of a panel section that picks a file (hidden input, like the menus). */
function FileAddButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Hint label={label}>
        <button type="button" className="nav-section-action" aria-label={label} onClick={() => input.current?.click()}>
          <Plus />
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

/** A version is shown like a Figma page: older ones are frozen (read-only). */
export type SidebarVersion = { id: number; label: string; meta: string; href: string; active: boolean; frozen: boolean };
export type PanelMode = "livrables";

/**
 * Inside a deliverable: icon rail + collapsible panel (Figma file view).
 * The gear opens the main menu; every rail action stays in the deliverable tab.
 */
export function ProjectSidebar({
  project,
  client,
  livrableName,
  livrableMenu,
  systemMenu,
  versions,
  view,
  panel,
  onPanel,
  canvasHref,
  onNavigate,
  notifications,
  feedback,
  onMarkAllRead,
  panelWidth,
  onPanelResize,
  livrables,
  onImportVersion,
  onImportLivrable,
}: {
  project: Project;
  client?: Client;
  livrableName: string;
  /** Shortcuts of the open deliverable, under its name. */
  livrableMenu: MenuEntry[];
  /** Main menu, under the logo. */
  systemMenu: MenuEntry[];
  versions: SidebarVersion[];
  view: AgencyView;
  /** Panel content, or null when collapsed. */
  panel: PanelMode | null;
  onPanel: (mode: PanelMode | null) => void;
  /** Canvas of the deliverable (from the proposals page). */
  canvasHref: string;
  /** Switches view inside the deliverable's tab. */
  onNavigate: (target: string) => void;
  notifications: Notification[];
  feedback: ClientFeedback[];
  onMarkAllRead: () => void;
  panelWidth: number;
  onPanelResize: (width: number) => void;
  livrables: SidebarLivrable[];
  /** A file becomes the next version of the open deliverable. */
  onImportVersion: (file: File) => void;
  /** A file becomes a new deliverable of the project. */
  onImportLivrable: (file: File) => void;
}) {
  const [livrablesOpen, setLivrablesOpen] = useState(true);
  return (
    <aside className={`sidebar project-sidebar ${panel ? "" : "is-collapsed"}`} aria-label="Navigation du livrable">
      <nav className="rail" aria-label="Outils">
        <MenuButton
          className="rail-logo"
          label="Menu principal"
          trigger={<Settings />}
          menuClassName="system-menu"
          tooltip
          entries={systemMenu}
        />
        {view.kind === "deliverable" ? (
          <Hint label="Versions" side="right">
            <button
              className={`rail-button ${panel ? "is-active" : ""}`}
              onClick={() => onPanel(panel ? null : "livrables")}
              aria-label="Versions"
              aria-pressed={Boolean(panel)}
            >
              <Layers />
            </button>
          </Hint>
        ) : (
          <button
            className="rail-button"
            onClick={() => {
              onPanel("livrables");
              onNavigate(canvasHref);
            }}
            aria-label="Revenir au canevas"
          >
            <Layers />
          </button>
        )}
        <span className="rail-spacer" />
        <Notifications notifications={notifications} feedback={feedback} onMarkAllRead={onMarkAllRead} compact />
        <span className="avatar dark-avatar rail-avatar" aria-label="Alex Morgan">
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
            <Hint label="Masquer le panneau" shortcut="Ctrl \">
              <button className="sidebar-icon-button" onClick={() => onPanel(null)} aria-label="Masquer le panneau">
                <PanelLeftClose />
              </button>
            </Hint>
          </div>
          <div className="panel-context">
            <span className="panel-path">
              {client && <Link href={href.client(client.id)}>{client.name}</Link>}
              {client && <span aria-hidden="true">/</span>}
              <Link href={href.project(project.id)}>{project.name}</Link>
            </span>
          </div>

          <div className="panel-scroll">
            <section className="panel-section" aria-label="Versions">
              <div className="panel-section-header">
                <h2>Versions</h2>
                <FileAddButton label="Importer un fichier comme nouvelle version" onFile={onImportVersion} />
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
            <section className="panel-section" aria-label="Livrables">
              <div className="panel-section-header">
                <button type="button" className="panel-section-toggle" aria-expanded={livrablesOpen} onClick={() => setLivrablesOpen((open) => !open)}>
                  <ChevronDown aria-hidden="true" className={livrablesOpen ? "" : "is-closed"} />
                  <h2>Livrables</h2>
                  <span className="panel-section-count">{livrables.length}</span>
                </button>
                <FileAddButton label="Ajouter un fichier comme nouveau livrable" onFile={onImportLivrable} />
              </div>
              {livrablesOpen && (
                <ul>
                  {livrables.map((livrable) => (
                    <li key={livrable.id}>
                      <Link className={`panel-item ${livrable.active ? "is-active" : ""}`} href={livrable.href} aria-current={livrable.active ? "page" : undefined}>
                        <FileText className="panel-item-icon" aria-hidden="true" />
                        <span className="panel-item-label">{livrable.name}</span>
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

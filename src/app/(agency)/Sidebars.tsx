"use client";

import { useRef, useState, useSyncExternalStore } from "react";
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
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Plus,
  Search,
  Share2,
  SquareKanban,
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
import { AccountMenu, useCurrentUser } from "./CurrentUser";
import { avatarLetter } from "@/lib/authors";

/** `href`: the page it is about (src/app/(agency)/routes.ts notificationHref); none for older ones. */
type Notification = { id: number; message: string; href?: string };
type Client = { id: number; name: string; email: string };

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

/** The latest activity this member has seen in the bell, per browser and agency. */
const seenActivityKey = (organizationId: string) => `kora:notifications-vues:${organizationId}`;
const subscribeToStorage = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
function readSeenActivity(key: string) {
  try {
    return Number(window.localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * The bell: what is new (the client's messages not opened yet, the activity not seen yet), then what was
 * already seen. Activity counts as seen once the bell is closed; a message, once its thread is opened.
 */
/** Notices the bell leaves out: a reminder the agency sent itself tells it nothing new (feedback of 25 October 2026). */
const leftOut = (notification: Notification) => notification.message.startsWith("Relance envoyée");
/** When a notice came: its id is its time for every recent one; an older one goes last. */
const noticeTime = (notification: Notification) => (notification.id > 1e12 ? notification.id : 0);
/** At most this many read notices, the latest. */
const readShown = 15;

export function Notifications({
  notifications,
  feedback,
  readFeedback = [],
  onMarkAllRead,
  compact,
}: {
  notifications: Notification[];
  /** The client's messages not read yet, and the changes they asked for. */
  feedback: ClientFeedback[];
  /** The client's messages already read: they stay, under « Déjà lus ». */
  readFeedback?: ClientFeedback[];
  onMarkAllRead: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const { organizationId } = useCurrentUser();
  const key = seenActivityKey(organizationId ?? "");
  // Everything seen while rendered on the server: the browser then says what is new.
  const seenUpTo = useSyncExternalStore(subscribeToStorage, () => readSeenActivity(key), () => Number.MAX_SAFE_INTEGER);
  const shownActivity = notifications.filter((notification) => !leftOut(notification));
  const freshActivity = shownActivity.filter((notification) => notification.id > seenUpTo);
  const pastActivity = shownActivity.filter((notification) => notification.id <= seenUpTo);
  const unread = feedback.length + freshActivity.length;

  function markActivitySeen() {
    const latest = Math.max(seenUpTo === Number.MAX_SAFE_INTEGER ? 0 : seenUpTo, ...notifications.map((notification) => notification.id));
    try {
      window.localStorage.setItem(key, String(latest));
    } catch {
      // Not remembered: shown as new again next time.
    }
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }
  const activity = (notification: Notification, fresh: boolean) => {
    const content = (
      <>
        <span className={`notification-dot ${fresh ? "is-new" : ""}`} aria-hidden="true" />
        <span>{notification.message}</span>
        {fresh && <span className="sr-only"> (nouveau)</span>}
      </>
    );
    return notification.href ? (
      <Link className={`notification-item is-link ${fresh ? "is-new" : ""}`} href={notification.href} onClick={() => setOpen(false)}>
        {content}
      </Link>
    ) : (
      <span className={`notification-item ${fresh ? "is-new" : ""}`}>{content}</span>
    );
  };
  const message = (item: ClientFeedback, fresh: boolean) => (
    <Link className={`notification-message ${fresh ? "is-new" : ""}`} href={item.href} onClick={() => setOpen(false)}>
      <span className="thread-avatar" aria-hidden="true">
        {avatarLetter(item.initials)}
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
  );
  // The client's messages and the activity together, the newest first; asked changes (a state, undated) on top.
  type Entry = { key: string; at: number; node: React.ReactNode; padded: boolean };
  const newestFirst = (entries: Entry[]) => [...entries].sort((left, right) => right.at - left.at);
  const fresh = newestFirst([
    ...feedback.map((item) => ({ key: item.key, at: item.kind === "changes" ? Number.MAX_SAFE_INTEGER : (item.createdAt ?? 0), node: message(item, true), padded: false })),
    ...freshActivity.map((notification) => ({ key: `a-${notification.id}`, at: noticeTime(notification), node: activity(notification, true), padded: true })),
  ]);
  const read = newestFirst([
    ...readFeedback.map((item) => ({ key: item.key, at: item.createdAt ?? 0, node: message(item, false), padded: false })),
    ...pastActivity.map((notification) => ({ key: `a-${notification.id}`, at: noticeTime(notification), node: activity(notification, false), padded: true })),
  ]).slice(0, readShown);

  return (
    <div className={`notifications ${compact ? "is-compact" : ""}`}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) markActivitySeen();
        }}
      >
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
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onMarkAllRead();
                  markActivitySeen();
                }}
              >
                Tout marquer comme lu
              </Button>
            )}
          </div>
          <div className="max-h-[min(480px,calc(100vh-8rem))] overflow-y-auto">
            <p className="notification-section">Nouveaux{unread ? ` · ${unread}` : ""}</p>
            {fresh.length === 0 ? (
              <p className="notification-empty">Rien de nouveau.</p>
            ) : (
              <ul className="notification-list">
                {fresh.map((entry) => (
                  <li key={entry.key} className={entry.padded ? "px-4" : undefined}>
                    {entry.node}
                  </li>
                ))}
              </ul>
            )}
            {read.length > 0 && (
              <>
                <p className="notification-section">Déjà lus</p>
                <ul className="notification-list is-read grid gap-2 pb-3">
                  {read.map((entry) => (
                    <li key={entry.key} className={entry.padded ? "px-4" : undefined}>
                      {entry.node}
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

/** A space in the sidebar, its projects one click away: its chevron opens them under it (open for the space one is in). */
function SpaceNavItem({ client, projects, view }: { client: Client; projects: SidebarProject[]; view: AgencyView }) {
  const inside = (view.kind === "client" && view.clientId === client.id) || ("projectId" in view && projects.some((project) => project.id === view.projectId));
  const [open, setOpen] = useState(inside);
  return (
    <li>
      <div className="nav-row">
        <Link className={`nav-item ${view.kind === "client" && view.clientId === client.id ? "active" : ""}`} href={href.client(client.id)} title={client.name}>
          <SpaceAvatar client={client} size="sm" />
          <span className="nav-label">{client.name}</span>
        </Link>
        {projects.length > 0 && (
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-label={`${open ? "Masquer" : "Afficher"} les projets de ${client.name}`}
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronRight aria-hidden="true" className={open ? "rotate-90" : undefined} />
          </button>
        )}
      </div>
      {open && projects.length > 0 && (
        <ul aria-label={`Projets de ${client.name}`}>
          {projects.map((project) => {
            const active = "projectId" in view && view.projectId === project.id;
            return (
              <li key={project.id}>
                <Link className={`nav-item nav-sub ${active ? "active" : ""}`} href={href.project(project.id)} aria-current={active ? "page" : undefined}>
                  <span className="nav-icon">
                    <FolderClosed />
                  </span>
                  <span className="nav-label">{project.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export type SidebarProject = { id: number; name: string; clientId?: number };

/** Home pages (Figma home): account, search, shortcuts, starred, all client spaces. */
export type SidebarFavorite = { key: string; label: string; href: string; kind: "project" | "livrable" };

export function HomeSidebar({
  view,
  clients,
  favorites,
  notifications,
  feedback,
  readFeedback,
  onMarkAllRead,
  onSearch,
  onNewClient,
  projects,
}: {
  view: AgencyView;
  clients: Client[];
  /** The projects, under their space when it is opened. */
  projects: SidebarProject[];
  favorites: SidebarFavorite[];
  notifications: Notification[];
  feedback: ClientFeedback[];
  readFeedback: ClientFeedback[];
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
        <AccountMenu />
        <Notifications notifications={notifications} feedback={feedback} readFeedback={readFeedback} onMarkAllRead={onMarkAllRead} />
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
          <p className="nav-empty">Vos projets et livrables ajoutés en favoris s’affichent ici.</p>
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
            <SpaceNavItem key={client.id} client={client} projects={projects.filter((project) => (project.clientId ?? 1) === client.id)} view={view} />
          ))}
        </ul>
      </nav>
      <div className="sidebar-bottom">
        {navLink(href.team(), view.kind === "team", <Users />, "Équipe")}
        {navLink(href.help(), view.kind === "help", <CircleHelp />, "Aide")}
      </div>
    </aside>
  );
}

/** Deliverables of the project, in the side panel (the open one is active). */
export type SidebarLivrable = { id: number; name: string; href: string; active: boolean };

/** How a version comes: a file of the deliverable's kind, or an action (the site's address of a « Lien »). */
export type NewVersion = { onFile: (file: File) => void; accept?: string } | { onSelect: () => void; label: string };

/** "+" of a panel section that picks a file (hidden input, like the menus). */
function FileAddButton({ label, accept, onFile }: { label: string; accept?: string; onFile: (file: File) => void }) {
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
        accept={accept}
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
  livrableName,
  livrableMenu,
  project,
  systemMenu,
  versions,
  view,
  panel,
  onPanel,
  canvasHref,
  requestsHref,
  onNavigate,
  panelWidth,
  onPanelResize,
  livrables,
  newVersion,
  onNewLivrable,
}: {
  livrableName: string;
  /** Shortcuts of the open deliverable, under its name. */
  livrableMenu: MenuEntry[];
  /** The deliverable's project: the breadcrumb before its name leads back to it, and only there. */
  project: { name: string; href: string };
  /** Main menu, under the logo. */
  systemMenu: MenuEntry[];
  versions: SidebarVersion[];
  view: AgencyView;
  /** Panel content, or null when collapsed. */
  panel: PanelMode | null;
  onPanel: (mode: PanelMode | null) => void;
  /** Canvas of the deliverable (from its requests' board). */
  canvasHref: string;
  /** The board of the deliverable's requests, inside it (its rail stays). */
  requestsHref: string;
  /** Switches view inside the deliverable's tab. */
  onNavigate: (target: string) => void;
  panelWidth: number;
  onPanelResize: (width: number) => void;
  livrables: SidebarLivrable[];
  /** The « + » of the versions: the next version of the open deliverable, of the same nature. */
  newVersion: NewVersion;
  /** « + »: the new deliverable dialog, in this project. */
  onNewLivrable: () => void;
}) {
  const [livrablesOpen, setLivrablesOpen] = useState(true);
  // The open deliverable is the canvas itself: the list shows the project's others.
  const others = livrables.filter((livrable) => !livrable.active);
  return (
    <aside className={`sidebar project-sidebar ${panel ? "" : "is-collapsed"}`} aria-label="Navigation du livrable">
      <nav className="rail" aria-label="Outils">
        <Hint label={panel ? "Masquer le panneau" : "Afficher le panneau"} shortcut="Ctrl \" side="right">
          <button
            className="rail-button rail-panel-toggle"
            onClick={() => onPanel(panel ? null : "livrables")}
            aria-label={panel ? "Masquer le panneau" : "Afficher le panneau"}
            aria-expanded={Boolean(panel)}
          >
            {panel ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
        </Hint>
        {view.kind === "deliverable" && !view.pane ? (
          <Hint label="Versions" side="right">
            <button
              className={`rail-button ${panel ? "is-active" : ""}`}
              onClick={() => onPanel("livrables")}
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
        {/* The board of this deliverable's requests, in the deliverable (feedback of 26 October 2026). */}
        <Hint label="Pipeline des demandes" side="right">
          <button
            className={`rail-button ${view.kind === "deliverable" && view.pane === "requests" ? "is-active" : ""}`}
            onClick={() => onNavigate(view.kind === "deliverable" && view.pane === "requests" ? canvasHref : requestsHref)}
            aria-label="Pipeline des demandes"
            aria-pressed={view.kind === "deliverable" && view.pane === "requests"}
          >
            <SquareKanban />
          </button>
        </Hint>
        <MenuButton
          className="rail-logo"
          label="Menu principal"
          trigger={<Settings />}
          menuClassName="system-menu"
          tooltip
          entries={systemMenu}
        />
        <span className="rail-spacer" />
        <AccountMenu compact />
      </nav>

      {panel && (
        <div className="panel" style={{ width: panelWidth }}>
          <ResizeHandle edge="right" width={panelWidth} min={200} max={420} defaultWidth={248} label="Largeur du panneau des versions" onResize={onPanelResize} />
          {/* One line: the project to go back to, then the open deliverable, whose name opens its menu. */}
          <nav className="panel-header panel-breadcrumb" aria-label="Fil d’Ariane">
            <Link href={project.href}>
              <span>{project.name}</span>
            </Link>
            <span className="panel-breadcrumb-separator" aria-hidden="true">
              /
            </span>
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
          </nav>

          <div className="panel-scroll">
            <section className="panel-section" aria-label="Versions">
              <div className="panel-section-header">
                <h2>Versions</h2>
                {"onSelect" in newVersion ? (
                  <Hint label={newVersion.label}>
                    <button type="button" className="nav-section-action" aria-label={newVersion.label} onClick={newVersion.onSelect}>
                      <Plus />
                    </button>
                  </Hint>
                ) : (
                  <FileAddButton label="Importer un fichier comme nouvelle version" accept={newVersion.accept} onFile={newVersion.onFile} />
                )}
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
            <section className="panel-section" aria-label="Autres livrables">
              <div className="panel-section-header">
                <button type="button" className="panel-section-toggle" aria-expanded={livrablesOpen} onClick={() => setLivrablesOpen((open) => !open)}>
                  <ChevronDown aria-hidden="true" className={livrablesOpen ? "" : "is-closed"} />
                  <h2>Autres livrables</h2>
                  <span className="panel-section-count">{others.length}</span>
                </button>
                <Hint label="Ajouter un livrable au projet">
                  <button type="button" className="nav-section-action" aria-label="Ajouter un livrable au projet" onClick={onNewLivrable}>
                    <Plus />
                  </button>
                </Hint>
              </div>
              {livrablesOpen && others.length === 0 && <p className="panel-empty">Aucun autre livrable dans ce projet.</p>}
              {livrablesOpen && (
                <ul>
                  {others.map((livrable) => (
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

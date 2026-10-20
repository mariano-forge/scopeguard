"use client";

import Link from "next/link";
import { Check, Clock, House, PenLine, Plus, Search, X } from "lucide-react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { href } from "./routes";
import type { DeliverableType } from "@/components/deliverableKinds";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import { Hint } from "@/components/hint";

export type TabStatus =
  | { kind: "changes-requested" }
  /** Unread messages from the client space. */
  | { kind: "messages"; count: number }
  | { kind: "awaiting-client"; count: number }
  | { kind: "approved" }
  | { kind: "none" };

export type TabInfo = {
  livrableId: number;
  href: string;
  name: string;
  type: DeliverableType;
  /** "Client / Projet", shown as tooltip to tell same-named files apart. */
  context: string;
  status: TabStatus;
};

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

function statusLabel(status: TabStatus) {
  switch (status.kind) {
    case "changes-requested":
      return "Modifications demandées par le client";
    case "messages":
      return status.count > 1 ? `${status.count} nouveaux messages du client` : "1 nouveau message du client";
    case "awaiting-client":
      return `${plural(status.count, "proposition")} en attente du client`;
    case "approved":
      return "Version approuvée";
    default:
      return "";
  }
}

export function StatusMark({ status, inTab }: { status: TabStatus; inTab?: boolean }) {
  if (status.kind === "none") return null;
  // Tabs only alert on what's new (client messages) and decisions; "changes requested" lives in the notifications.
  if (inTab && status.kind === "changes-requested") return null;
  const label = statusLabel(status);
  return (
    <span className={`tab-status tab-status-${status.kind}`} title={label}>
      {status.kind === "messages" ? (
        status.count
      ) : status.kind === "approved" ? (
        <Check />
      ) : status.kind === "awaiting-client" ? (
        <Clock />
      ) : (
        <PenLine />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Figma-like file tabs: Home is pinned, every opened deliverable gets a tab with its review status. */
export function TabBar({
  tabs,
  activeLivrableId,
  homeActive,
  onClose,
  onOpen,
  onAdd,
  recents,
}: {
  tabs: TabInfo[];
  activeLivrableId: number | null;
  homeActive: boolean;
  onClose: (livrableId: number) => void;
  /** Search among all the deliverables (the command palette, Ctrl K). */
  onOpen: () => void;
  /** « Ajouter un livrable »: the new deliverable dialog. */
  onAdd: () => void;
  /** Recently opened deliverables not in a tab, most recent first. */
  recents: Pick<TabInfo, "livrableId" | "href" | "name" | "type" | "context">[];
}) {
  const router = useRouter();
  // The search opens once the menu is gone (after its closing animation): opened sooner, the menu would
  // take the focus back from the search field.
  const searchNext = useRef(false);
  return (
    <div className="tab-bar">
      <Link className="tab-logo" href={href.home()} aria-label="Kora · Accueil" title="Kora · Accueil">
        <span className="tab-logo-mark" aria-hidden="true" />
      </Link>
      <nav className="tab-list" aria-label="Livrables ouverts">
        <Link
          className={`tab tab-home ${homeActive ? "is-active" : ""}`}
          href={href.home()}
          aria-current={homeActive ? "page" : undefined}
        >
          <House />
          <span className="sr-only">Accueil</span>
        </Link>
        {tabs.map((tab) => {
          const active = tab.livrableId === activeLivrableId;
          return (
            <div
              className={`tab ${active ? "is-active" : ""}`}
              key={tab.livrableId}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onClose(tab.livrableId);
                }
              }}
            >
              <Link className="tab-link" href={tab.href} aria-current={active ? "page" : undefined} title={`${tab.context} / ${tab.name}`}>
                <DeliverableIcon type={tab.type} />
                <span className="tab-name">{tab.name}</span>
                <StatusMark status={tab.status} inTab />
              </Link>
              <button
                type="button"
                className="tab-close"
                onClick={() => onClose(tab.livrableId)}
                aria-label={`Fermer ${tab.name}`}
              >
                <X />
              </button>
            </div>
          );
        })}
        {/* « + »: add a deliverable, or open one of the recent ones; searching stays at hand. */}
        {/* Not modal: the search opened from it takes the focus at once, nothing holds it back. */}
        <DropdownMenu modal={false}>
          <Hint label="Ajouter ou ouvrir un livrable">
            <DropdownMenuTrigger asChild>
              <button type="button" className="tab-new" aria-label="Ajouter ou ouvrir un livrable">
                <Plus />
              </button>
            </DropdownMenuTrigger>
          </Hint>
          {/* Each item moves the focus elsewhere (the search, a dialog, a page): it is not given back to « + ». */}
          <DropdownMenuContent align="start" className="tab-new-menu w-72" onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (searchNext.current) onOpen();
              searchNext.current = false;
            }}
          >
            <DropdownMenuItem onSelect={onAdd}>
              <Plus /> Ajouter un livrable
            </DropdownMenuItem>
            {recents.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Récents</DropdownMenuLabel>
                {recents.map((recent) => (
                  <DropdownMenuItem key={recent.livrableId} onSelect={() => router.push(recent.href)} title={`${recent.context} / ${recent.name}`}>
                    <DeliverableIcon type={recent.type} />
                    <span className="truncate">{recent.name}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => (searchNext.current = true)}>
              <Search /> Rechercher un livrable…
              <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Check, Clock, House, PenLine, X } from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { href } from "./routes";

export type TabStatus =
  | { kind: "changes-requested" }
  | { kind: "to-qualify"; count: number }
  | { kind: "awaiting-client"; count: number }
  | { kind: "approved" }
  | { kind: "none" };

export type TabInfo = {
  livrableId: number;
  href: string;
  name: string;
  /** "Client / Projet", shown as tooltip to tell same-named files apart. */
  context: string;
  status: TabStatus;
};

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

function statusLabel(status: TabStatus) {
  switch (status.kind) {
    case "changes-requested":
      return "Modifications demandées par le client";
    case "to-qualify":
      return `${plural(status.count, "demande")} à qualifier`;
    case "awaiting-client":
      return `${plural(status.count, "proposition")} en attente du client`;
    case "approved":
      return "Version approuvée";
    default:
      return "";
  }
}

function StatusMark({ status }: { status: TabStatus }) {
  if (status.kind === "none") return null;
  const label = statusLabel(status);
  return (
    <span className={`tab-status tab-status-${status.kind}`} title={label}>
      {status.kind === "to-qualify" ? (
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
}: {
  tabs: TabInfo[];
  activeLivrableId: number | null;
  homeActive: boolean;
  onClose: (livrableId: number) => void;
}) {
  return (
    <div className="tab-bar">
      <Link className="tab-bar-brand" href={href.home()} aria-label="Kora, accueil">
        <KoraMark />
      </Link>
      <nav className="tab-list" aria-label="Livrables ouverts">
        <Link
          className={`tab tab-home ${homeActive ? "is-active" : ""}`}
          href={href.home()}
          aria-current={homeActive ? "page" : undefined}
          title="Accueil"
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
                <span className="tab-name">{tab.name}</span>
                <StatusMark status={tab.status} />
              </Link>
              <button
                type="button"
                className="tab-close"
                onClick={() => onClose(tab.livrableId)}
                aria-label={`Fermer ${tab.name}`}
                title="Fermer l’onglet"
              >
                <X />
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

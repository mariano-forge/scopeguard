"use client";

// Phones: no tabs. A bar instead, with the menu (the page's sidebar, opened as a drawer), the Kora mark
// back to the home page, where one is, and search.

import Link from "next/link";
import { Menu, Search, X } from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { Button } from "@/components/ui/button";
import { href, type AgencyView } from "./routes";

const titles: Partial<Record<AgencyView["kind"], string>> = {
  home: "Vue d’ensemble",
  todo: "À traiter",
  recents: "Récents",
  shared: "Partagés avec moi",
  trash: "Corbeille",
  spaces: "Espaces",
};

/** The name of the page: its own (a space, a project, a deliverable) or the section's. */
export function mobileTitle(view: AgencyView, names: { space?: string; project?: string; livrable?: string }) {
  if (view.kind === "client") return names.space ?? "Espace";
  if (view.kind === "project" || view.kind === "requests" || view.kind === "scope" || view.kind === "tracking") return names.project ?? "Projet";
  if (view.kind === "deliverable" || view.kind === "dashboard") return names.livrable ?? "Livrable";
  return titles[view.kind] ?? "Kora";
}

export function MobileBar({ title, navOpen, onNav, onSearch }: { title: string; navOpen: boolean; onNav: () => void; onSearch: () => void }) {
  return (
    <header className="mobile-bar">
      <Button variant="ghost" size="icon" aria-label={navOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={navOpen} onClick={onNav}>
        {navOpen ? <X /> : <Menu />}
      </Button>
      <Link href={href.home()} className="mobile-bar-home" aria-label="Accueil">
        <KoraMark />
      </Link>
      <span className="mobile-bar-title">{title}</span>
      <Button variant="ghost" size="icon" aria-label="Rechercher" onClick={onSearch}>
        <Search />
      </Button>
    </header>
  );
}

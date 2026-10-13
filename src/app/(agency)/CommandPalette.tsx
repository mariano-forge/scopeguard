"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, FileText, Folder, MessageSquareText, Plus, Search, type LucideIcon } from "lucide-react";

export type PaletteItem = {
  id: string;
  group: "Actions" | "Livrables" | "Projets" | "Clients" | "Demandes";
  label: string;
  /** Secondary text, also searched (client, project, version…). */
  hint?: string;
  href?: string;
  run?: () => void;
  icon?: LucideIcon;
};

const groupOrder: PaletteItem["group"][] = ["Actions", "Livrables", "Projets", "Clients", "Demandes"];
const icons = {
  Actions: Plus,
  Livrables: FileText,
  Projets: Folder,
  Clients: Building2,
  Demandes: MessageSquareText,
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Every query word must appear. Results stay grouped; within a group, label-start matches come first. */
function score(item: PaletteItem, words: string[]) {
  const label = normalize(item.label);
  const haystack = `${label} ${normalize(item.hint ?? "")}`;
  if (!words.every((word) => haystack.includes(word))) return -1;
  return groupOrder.indexOf(item.group) * 10 + (label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2);
}

type PaletteProps = {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  /** Shown before typing (open tabs, recents, to-do). */
  suggestions: PaletteItem[];
};

/** ⌘K / Ctrl+K: jump to any client, project, deliverable or request, or run an action. */
export function CommandPalette({ open, ...props }: PaletteProps) {
  // Mounted only while open, so every opening starts from an empty query.
  return open ? <PaletteDialog {...props} /> : null;
}

function PaletteDialog({ onClose, items, suggestions }: Omit<PaletteProps, "open">) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return suggestions;
    return items
      .map((item) => ({ item, rank: score(item, words) }))
      .filter((entry) => entry.rank >= 0)
      .sort((left, right) => left.rank - right.rank)
      .slice(0, 30)
      .map((entry) => entry.item);
  }, [items, suggestions, query]);

  // Focus the field, and give focus back to where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function choose(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else if (item.href) router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const optionId = (index: number) => `${listId}-option-${index}`;

  return createPortal(
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher dans Kora"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="palette-search">
          <Search />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Rechercher un client, un projet, un livrable, une demande…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
            aria-autocomplete="list"
          />
          <kbd>Échap</kbd>
        </div>
        <ul className="palette-results" id={listId} role="listbox" aria-label="Résultats">
          {results.length === 0 && (
            <li className="palette-empty" role="presentation">
              Aucun résultat pour « {query} ».
            </li>
          )}
          {results.map((item, index) => {
            const Icon = item.icon ?? icons[item.group];
            const showGroup = results[index - 1]?.group !== item.group;
            return (
              <li key={item.id} role="presentation">
                {showGroup && (
                  <span className="palette-group" role="presentation">
                    {item.group}
                  </span>
                )}
                <div
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`palette-option ${index === activeIndex ? "is-active" : ""}`}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                >
                  <Icon />
                  <span className="palette-label">{item.label}</span>
                  {item.hint && <span className="palette-hint">{item.hint}</span>}
                  {index === activeIndex && <CornerDownLeft className="palette-enter" />}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

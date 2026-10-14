"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ListFilter } from "lucide-react";

export type LivrableGroup = { key: string; label: string; livrables: { id: number; name: string }[] };

/**
 * "Tous les livrables" multi-select for one home section: check or uncheck deliverables, by project.
 * `value` null means every deliverable (also future ones).
 */
export function LivrableFilter({
  groups,
  value,
  onChange,
  label,
}: {
  groups: LivrableGroup[];
  value: number[] | null;
  onChange: (value: number[] | null) => void;
  /** Accessible name, e.g. "Filtrer le registre". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const all = groups.flatMap((group) => group.livrables.map((livrable) => livrable.id));
  const selected = new Set(value ?? all);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function commit(next: Set<number>) {
    onChange(next.size === all.length ? null : all.filter((id) => next.has(id)));
  }
  function toggle(ids: number[], on: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    commit(next);
  }

  const summary =
    value === null || selected.size === all.length
      ? "Tous les livrables"
      : selected.size === 0
        ? "Aucun livrable"
        : selected.size === 1
          ? groups.flatMap((group) => group.livrables).find((livrable) => selected.has(livrable.id))?.name
          : `${selected.size} livrables`;

  return (
    <div className="livrable-filter" ref={rootRef}>
      <button
        type="button"
        className={`livrable-filter-trigger ${value !== null ? "is-filtered" : ""}`}
        aria-label={`${label} : ${summary}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ListFilter aria-hidden="true" />
        <span>{summary}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="livrable-filter-panel" role="dialog" aria-label={label}>
          <label className="livrable-filter-option is-all">
            <input
              type="checkbox"
              checked={selected.size === all.length}
              ref={(input) => {
                if (input) input.indeterminate = selected.size > 0 && selected.size < all.length;
              }}
              onChange={(event) => commit(new Set(event.target.checked ? all : []))}
            />
            Tous les livrables
          </label>
          <div className="livrable-filter-groups">
            {groups.map((group) => {
              const ids = group.livrables.map((livrable) => livrable.id);
              const count = ids.filter((id) => selected.has(id)).length;
              return (
                <fieldset key={group.key}>
                  <legend>
                    <label className="livrable-filter-option is-group">
                      <input
                        type="checkbox"
                        checked={count === ids.length}
                        ref={(input) => {
                          if (input) input.indeterminate = count > 0 && count < ids.length;
                        }}
                        onChange={(event) => toggle(ids, event.target.checked)}
                      />
                      {group.label}
                    </label>
                  </legend>
                  {group.livrables.map((livrable) => (
                    <label className="livrable-filter-option" key={livrable.id}>
                      <input type="checkbox" checked={selected.has(livrable.id)} onChange={(event) => toggle([livrable.id], event.target.checked)} />
                      {livrable.name}
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

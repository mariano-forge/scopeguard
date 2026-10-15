"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * Dropdown in the shadcn/Radix spirit: a button opening a listbox.
 * Keyboard: Enter/Space/↓ open, ↑↓ move, Home/End, Enter selects, Escape closes, Tab leaves.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  prefix,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name of the control. */
  label: string;
  /** Visible text before the value, e.g. "Trier par". */
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openList() {
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }
  function choose(index: number) {
    onChange(options[index].value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div className="select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label} : ${current.label}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            openList();
          }
        }}
      >
        {prefix && <span className="select-prefix">{prefix}</span>}
        <span>{current.label}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          className="select-menu"
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") setActive((index) => Math.min(index + 1, options.length - 1));
            else if (event.key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
            else if (event.key === "Home") setActive(0);
            else if (event.key === "End") setActive(options.length - 1);
            else if (event.key === "Enter" || event.key === " ") choose(active);
            else if (event.key === "Escape") {
              setOpen(false);
              buttonRef.current?.focus();
            } else if (event.key === "Tab") setOpen(false);
            else return;
            if (event.key !== "Tab") event.preventDefault();
          }}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`select-option ${index === active ? "is-active" : ""}`}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

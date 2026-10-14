"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type MenuEntry =
  | { kind: "section"; label: string }
  | {
      kind?: "item";
      label: string;
      icon?: React.ReactNode;
      /** Keyboard shortcut or short hint shown on the right. */
      hint?: string;
      href?: string;
      /** Opens in a new tab (client preview). */
      external?: boolean;
      onSelect?: () => void;
      /** Picks a file instead of running an action. */
      onFile?: (file: File) => void;
      accept?: string;
      disabled?: boolean;
    };

/** A trigger and its dropdown (Figma main menu / file menu). Closes on outside click, Escape or a choice. */
export function MenuButton({
  trigger,
  label,
  className,
  menuClassName,
  entries,
  header,
}: {
  trigger: React.ReactNode;
  label: string;
  className?: string;
  menuClassName?: string;
  entries: MenuEntry[];
  header?: React.ReactNode;
}) {
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
    <div className="menu-root" ref={rootRef}>
      <button
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`app-menu ${menuClassName ?? ""}`} role="menu" aria-label={label}>
          {header}
          {entries.map((entry, index) => {
            if (entry.kind === "section")
              return (
                <p className="app-menu-section" key={`s${index}`} role="presentation">
                  {entry.label}
                </p>
              );
            const body = (
              <>
                <span className="app-menu-icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <span className="app-menu-label">{entry.label}</span>
                {entry.hint && <kbd>{entry.hint}</kbd>}
              </>
            );
            if (entry.onFile)
              return (
                <label className={`app-menu-item ${entry.disabled ? "is-disabled" : ""}`} role="menuitem" key={entry.label}>
                  {body}
                  <input
                    type="file"
                    accept={entry.accept}
                    disabled={entry.disabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      setOpen(false);
                      if (file) entry.onFile?.(file);
                    }}
                  />
                </label>
              );
            if (entry.href)
              return (
                <Link
                  className="app-menu-item"
                  role="menuitem"
                  key={entry.label}
                  href={entry.href}
                  target={entry.external ? "_blank" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {body}
                </Link>
              );
            return (
              <button
                type="button"
                className="app-menu-item"
                role="menuitem"
                key={entry.label}
                disabled={entry.disabled}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect?.();
                }}
              >
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

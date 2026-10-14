"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/hint";

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

/**
 * A trigger and its shadcn dropdown (main menu, deliverable menu, export).
 * `tooltip`: icon-only triggers also show their label as a tooltip.
 */
export function MenuButton({
  trigger,
  label,
  className,
  menuClassName,
  entries,
  header,
  tooltip,
  side = "bottom",
  align = "start",
}: {
  trigger: React.ReactNode;
  label: string;
  className?: string;
  menuClassName?: string;
  entries: MenuEntry[];
  header?: React.ReactNode;
  tooltip?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  // File items open a hidden input kept outside the menu (the menu closes on select).
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const button = (
    <button type="button" className={className} aria-label={label}>
      {trigger}
    </button>
  );

  return (
    <div className="menu-root">
      <DropdownMenu>
        {tooltip ? (
          <Hint label={label} side={side === "top" ? "top" : "right"}>
            <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
          </Hint>
        ) : (
          <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent side={side} align={align} className={`app-menu min-w-64 ${menuClassName ?? ""}`} aria-label={label}>
          {header}
          {entries.map((entry, index) => {
            if (entry.kind === "section")
              return (
                <div key={`s${index}`}>
                  {index > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="app-menu-section text-xs font-medium text-muted-foreground">{entry.label}</DropdownMenuLabel>
                </div>
              );
            const body = (
              <>
                {entry.icon}
                <span className="app-menu-label">{entry.label}</span>
                {entry.hint && <DropdownMenuShortcut>{entry.hint}</DropdownMenuShortcut>}
              </>
            );
            if (entry.href)
              return (
                <DropdownMenuItem key={entry.label} asChild disabled={entry.disabled} className="app-menu-item">
                  <Link href={entry.href} target={entry.external ? "_blank" : undefined}>
                    {body}
                  </Link>
                </DropdownMenuItem>
              );
            return (
              <DropdownMenuItem
                key={entry.label}
                disabled={entry.disabled}
                className="app-menu-item"
                onSelect={() => (entry.onFile ? fileInputs.current[entry.label]?.click() : entry.onSelect?.())}
              >
                {body}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {entries.map((entry) =>
        entry.kind !== "section" && entry.onFile ? (
          <input
            key={`file-${entry.label}`}
            ref={(input) => {
              fileInputs.current[entry.label] = input;
            }}
            type="file"
            accept={entry.accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) entry.onFile?.(file);
            }}
          />
        ) : null,
      )}
    </div>
  );
}

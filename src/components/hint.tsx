"use client";

import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * shadcn tooltip on an icon button (or any focusable element): shows on hover and keyboard focus.
 * Use it instead of the native `title`, which is slow, unstyled and invisible to keyboard users.
 */
export function Hint({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: React.ReactNode;
  /** e.g. "Ctrl K", shown after the label. */
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {shortcut && <kbd className="ml-1 font-mono text-xs opacity-80">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

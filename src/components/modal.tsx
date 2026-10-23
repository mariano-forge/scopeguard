"use client";

import * as React from "react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// "full": as wide as the window allows, up to 1200 px (laying screens out, src/app/(agency)/ScreensLayoutDialog.tsx).
const sizes = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-2xl", full: "sm:max-w-[min(1200px,calc(100vw-4rem))]" } as const;

/**
 * Every Kora modal: shadcn Dialog with a title, an optional description, the body and the actions.
 * With `onSubmit`, body and actions are wrapped in a form (Enter submits).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  onSubmit,
  size = "md",
  className,
  role,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Action buttons, bottom right. */
  footer?: React.ReactNode;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  size?: keyof typeof sizes;
  className?: string;
  /** "alertdialog" for confirmations. */
  role?: "dialog" | "alertdialog";
}) {
  const body = (
    <>
      {children && <div className="grid gap-4">{children}</div>}
      {footer && <DialogFooter>{footer}</DialogFooter>}
    </>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* The role is only passed when asked for: `role={undefined}` would erase Radix's own role="dialog". */}
      <DialogContent className={cn(sizes[size], "max-h-[calc(100vh-4rem)] overflow-y-auto", className)} {...(role ? { role } : {})}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {onSubmit ? (
          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
            {body}
          </form>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Label + field (+ hint). Pass the same `id` to the field. */
export function Field({
  id,
  label,
  optional,
  hint,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  optional?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
        {optional && <span className="font-normal text-muted-foreground">(facultatif)</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Input with its unit on the right ("€", "jours"). */
export function AddonInput({ addon, className, ...props }: React.ComponentProps<typeof Input> & { addon: string }) {
  return (
    <div className="relative">
      <Input className={cn("pr-14", className)} {...props} />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{addon}</span>
    </div>
  );
}

/** Native select styled like the shadcn Input. */
export const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-paper px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

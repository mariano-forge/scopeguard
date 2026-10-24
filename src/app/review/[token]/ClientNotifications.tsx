"use client";

// The client's bell, on their review page: what happened on their side since they last looked — an agency
// reply, a quote to decide, one of their requests qualified, a newer version shared with them. Built from
// what the page already receives (src/db/reviewAccess.ts readReviewState): nothing more is sent for it.
// What was seen is kept in the browser, with the agency's answers already read in their threads.

import { useState } from "react";
import { Bell } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { timeLabel, useNow } from "@/app/(agency)/editor/CanvasComments";

/** One thing to tell: its key in the seen list, when (ms, when known), what, and what opening it does. */
export type ClientNotice = { key: string; at?: number; title: string; detail?: string; onOpen: () => void };

export function ClientNotifications({ notices, seen, onSeen }: { notices: ClientNotice[]; seen: string[] | null; onSeen: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const now = useNow();
  const sorted = [...notices].sort((left, right) => (right.at ?? Number.MAX_SAFE_INTEGER) - (left.at ?? Number.MAX_SAFE_INTEGER));
  const fresh = seen === null ? [] : sorted.filter((notice) => !seen.includes(notice.key));
  const past = seen === null ? sorted : sorted.filter((notice) => seen.includes(notice.key)).slice(0, 6);
  // Closing the bell: what it showed is seen.
  const markAll = () => onSeen(notices.map((notice) => notice.key));

  const item = (notice: ClientNotice, isNew: boolean) => (
    <button
      type="button"
      className={`notification-message ${isNew ? "is-new" : ""}`}
      onClick={() => {
        setOpen(false);
        markAll();
        notice.onOpen();
      }}
    >
      <span className={`notification-dot ${isNew ? "is-new" : ""}`} aria-hidden="true" />
      <span className="grid min-w-0 gap-0.5 text-left">
        <span className="flex items-baseline gap-2 text-sm">
          <b className="truncate font-medium">{notice.title}</b>
          {notice.at !== undefined && timeLabel({ time: "", createdAt: notice.at }, now) && <small className="ml-auto shrink-0 text-xs text-muted-foreground">{timeLabel({ time: "", createdAt: notice.at }, now)}</small>}
        </span>
        {notice.detail && <span className="line-clamp-2 text-sm text-muted-foreground">{notice.detail}</span>}
      </span>
      {isNew && <span className="sr-only"> (nouveau)</span>}
    </button>
  );

  return (
    <div className="notifications is-compact">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) markAll();
        }}
      >
        <Hint label="Notifications">
          <PopoverTrigger asChild>
            <button className="sidebar-icon-button" aria-label={`Notifications${fresh.length ? ` (${fresh.length} non lues)` : ""}`}>
              <Bell />
              {fresh.length > 0 && <span className="notification-count">{fresh.length > 99 ? "99+" : fresh.length}</span>}
            </button>
          </PopoverTrigger>
        </Hint>
        <PopoverContent align="end" className="notification-panel w-96 gap-0 p-0" aria-label="Notifications">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-heading text-sm font-semibold">Notifications</p>
            {fresh.length > 0 && (
              <Button variant="ghost" size="sm" onClick={markAll}>
                Tout marquer comme lu
              </Button>
            )}
          </div>
          <div className="max-h-[min(480px,calc(100vh-8rem))] overflow-y-auto">
            <p className="notification-section">Nouveaux{fresh.length ? ` · ${fresh.length}` : ""}</p>
            {fresh.length === 0 ? (
              <p className="notification-empty">Rien de nouveau.</p>
            ) : (
              <ul className="notification-list">
                {fresh.map((notice) => (
                  <li key={notice.key}>{item(notice, true)}</li>
                ))}
              </ul>
            )}
            {past.length > 0 && (
              <>
                <p className="notification-section">Déjà lus</p>
                <ul className="notification-list is-read">
                  {past.map((notice) => (
                    <li key={notice.key}>{item(notice, false)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

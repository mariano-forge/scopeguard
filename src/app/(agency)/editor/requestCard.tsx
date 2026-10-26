"use client";

// A request's card (feedback of 26 October 2026): the same in the editor's panel (EditorInspector.tsx), on a
// project's board (ProjectRequests.tsx) and in the staging site's panel (SitePanel.tsx). Kept in a module of
// its own, light: the site's panel loads it without the editor's panel.

import { Gift, MessageSquare, ReceiptText } from "lucide-react";
import { SourceIcon } from "@/components/SourceIcon";
import { Hint } from "@/components/hint";
import { avatarLetter, sideOf } from "@/lib/authors";
import type { StatusTone } from "@/lib/outsideStatus";
import { sourceLine } from "@/lib/requestSource";
import { requestKind, requestText, timeLabel, TimecodeChip, type ThreadComment } from "./CanvasComments";

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`status-pill is-${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

/** What a card says of an out-of-scope request's proposal: its amount, offered or quoted. */
export type CardAmount = { label: string; offer: boolean };

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

/**
 * A request's card (feedback of 26 October 2026), the same in the editor's panel and on a project's board: what
 * heads it (its status, or its deliverable) and its amount, offered or quoted; its title; who and when, the
 * moment of a video, its source's mark; its messages. `fresh`: those of the other side not read yet.
 */
export function RequestCardLines({ comment, now, head, amount, fresh = 0 }: { comment: ThreadComment; now: number; head?: React.ReactNode; amount?: CardAmount | null; fresh?: number }) {
  const replies = comment.replies?.length ?? 0;
  const kind = requestKind(comment);
  return (
    <>
      {(head || amount) && (
        <span className="thread-row-status">
          {head}
          {/* A gift or a quote, said by its mark, named on hover. */}
          {amount && (
            <Hint label={amount.offer ? "Offert au client" : "Devis"}>
              <span className={`thread-row-amount ${amount.offer ? "is-offer" : ""}`}>
                {amount.offer ? <Gift aria-hidden="true" /> : <ReceiptText aria-hidden="true" />}
                {amount.label}
              </span>
            </Hint>
          )}
        </span>
      )}
      <span className={`thread-row-text ${kind !== "comment" || comment.title ? "is-title" : ""}`}>{requestText(comment)}</span>
      <span className="thread-row-meta">
        <span className={`thread-avatar ${sideOf(comment) === "agency" ? "is-agency" : "is-client"}`} aria-hidden="true">
          {avatarLetter(comment.initials)}
        </span>
        <span>{comment.author}</span>
        {timeLabel(comment, now) && <small>· {timeLabel(comment, now)}</small>}
        {comment.timecode !== undefined && <TimecodeChip seconds={comment.timecode} />}
        {/* Where it came from, at the end of the name's line: the channel's mark, the whole line on hover. */}
        {comment.source && (
          <Hint label={sourceLine(comment.source)}>
            <span className="thread-row-source">
              <SourceIcon channel={comment.source.channel} size={16} />
              <span id={`source-${comment.id}`} className="sr-only">
                {sourceLine(comment.source)}
              </span>
            </span>
          </Hint>
        )}
      </span>
      {(replies > 0 || fresh > 0) && (
        <span className="thread-row-foot">
          {/* Words only, as in a pin's hover preview. */}
          <span className={`thread-row-replies ${fresh > 0 ? "is-unread" : ""}`}>
            <MessageSquare aria-hidden="true" />
            {fresh > 0 ? `${plural(fresh, "message")} non lu${fresh > 1 ? "s" : ""}` : plural(replies, "réponse")}
          </span>
        </span>
      )}
    </>
  );
}

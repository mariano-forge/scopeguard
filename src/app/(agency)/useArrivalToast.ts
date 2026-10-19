"use client";

// A client's message arriving while the agency works (the state is fetched every 2 s, src/lib/stateSync.ts):
// said at once, with a way to open it. What was already unread when the page opened is not announced:
// the bell lists it.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClientFeedback } from "./Sidebars";

export function useArrivalToast(feedback: ClientFeedback[], ready: boolean) {
  const router = useRouter();
  // The messages known so far; null until the agency's state has loaded once.
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!ready) return;
    const keys = new Set(feedback.map((item) => item.key));
    if (known.current) {
      for (const item of feedback) {
        if (known.current.has(item.key)) continue;
        toast(item.kind === "message" ? `${item.author} a écrit` : `${item.author} demande des modifications`, {
          description: item.kind === "message" ? `${item.message.slice(0, 120)} · ${item.context}` : item.context,
          action: { label: "Voir", onClick: () => router.push(item.href) },
        });
      }
    }
    known.current = keys;
  }, [feedback, ready, router]);
}

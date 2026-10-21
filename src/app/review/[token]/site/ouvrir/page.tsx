"use client";

// The review page's tab, opened from Kora's panel on the staging site (src/lib/siteHandoff.ts): it
// tells the panel it is ready, takes its ticket (from that window only, on Kora's origin), opens the
// usual session and goes to the review. Without a ticket, the review asks for the code as always.

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { useParams } from "next/navigation";
import type { HandoffMessage } from "@/lib/siteReview";

export default function SiteHandoffPage() {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    const review = `/review/${encodeURIComponent(token)}`;
    const opener = window.opener as Window | null;
    if (!opener) {
      window.location.replace(review);
      return;
    }
    // The panel may never answer (closed meanwhile): the review asks for the code.
    const fallback = setTimeout(() => window.location.replace(review), 5000);
    async function receive(event: MessageEvent<HandoffMessage>) {
      if (event.origin !== window.location.origin || event.source !== opener || event.data?.type !== "kora:handoff-ticket") return;
      clearTimeout(fallback);
      await fetch(`/api/review/${encodeURIComponent(token)}/site/handoff/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: event.data.ticket }),
      }).catch(() => null);
      window.location.replace(review);
    }
    window.addEventListener("message", receive);
    opener.postMessage({ type: "kora:handoff-ready" } satisfies HandoffMessage, window.location.origin);
    return () => {
      clearTimeout(fallback);
      window.removeEventListener("message", receive);
    };
  }, [token]);

  return (
    <AuthShell plain>
      <p className="gate-loading" role="status">
        <Loader2 aria-hidden="true" /> Ouverture de la revue…
      </p>
    </AuthShell>
  );
}

"use client";

// The member confirms who they are; the ticket goes to the panel that opened this window, on Kora's
// own origin, never to the staging site's page (src/lib/siteAgency.ts).

import { useState } from "react";
import { Building2 } from "lucide-react";
import { GateHeading } from "@/components/GatePieces";
import { Button } from "@/components/ui/button";
import type { TicketMessage } from "@/lib/siteReview";

export function AgencyHandoff({ token, name, deliverable }: { token: string; name: string; deliverable: string }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function confirm() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/review/${encodeURIComponent(token)}/site/ticket`, { method: "POST" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { ticket?: string } | null;
    setPending(false);
    if (!response?.ok || !body?.ticket) return setError("Impossible de vous reconnaître pour l’instant. Réessayez.");
    if (!window.opener) return setError("Revenez sur le site de recette et rouvrez le panneau Kora.");
    // The panel closes this window once it has the ticket: closed sooner, its message could arrive
    // without its sender, which the panel refuses.
    window.opener.postMessage({ type: "kora:agency-ticket", ticket: body.ticket } satisfies TicketMessage, window.location.origin);
    setSent(true);
  }

  return (
    <div className="gate-form">
      <GateHeading icon={<Building2 />} deliverable={deliverable} title="Annoter le site au nom de l’agence">
        Le panneau Kora du site de recette s’ouvrira en tant que <b>{name}</b>, pour 12 heures, sur ce site seulement.
      </GateHeading>
      {error && (
        <p role="alert" className="gate-error">
          {error}
        </p>
      )}
      {sent ? (
        <p role="status" className="gate-aside">
          C’est fait : revenez sur le site de recette. Cette fenêtre se ferme d’elle-même.
        </p>
      ) : (
        <Button size="lg" className="w-full" disabled={pending} onClick={() => void confirm()}>
          Continuer en tant que {name}
        </Button>
      )}
    </div>
  );
}

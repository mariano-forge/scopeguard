"use client";

// « Figma » in « Paramètres de l’agence » (US-054): connect the agency's Figma account, so that Kora reads
// the comments of its files, or disconnect it. Shown only when this server can connect to Figma.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { actionRequest } from "@/lib/actionRequest";
import { Button } from "@/components/ui/button";
import type { FigmaConnectionStatus } from "@/db/figmaConnection";

type Status = { available: boolean; canManage: boolean; connection: FigmaConnectionStatus };

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function FigmaSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/integrations/figma", { cache: "no-store" }).catch(() => null);
      const body = response?.ok ? ((await response.json().catch(() => null)) as Status | null) : null;
      if (!cancelled && body) setStatus(body);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.available) return null;

  async function disconnect() {
    setPending(true);
    const answer = await actionRequest("/api/integrations/figma", "DELETE", undefined, () => false);
    setPending(false);
    if (!answer) return;
    setStatus((current) => current && { ...current, connection: null });
    toast("Figma est déconnecté", { description: "Pour retirer aussi l’accès côté Figma : Paramètres du compte Figma › Applications connectées." });
  }

  const { connection, canManage } = status;
  return (
    <section aria-labelledby="figma-settings-title" className="flex flex-col gap-2 border-t pt-4">
      <h3 id="figma-settings-title" className="text-sm font-semibold">
        Figma
      </h3>
      {connection ? (
        <p className="text-sm text-muted-foreground">
          Connecté au compte Figma <b className="text-foreground">{connection.handle}</b>, par {connection.connectedBy} le {day(connection.connectedAt)}.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Connectez le compte Figma de l’agence : les commentaires de vos clients sur vos fichiers arriveront dans Kora, pour les qualifier.</p>
      )}
      {canManage && (
        <div>
          {connection ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => void disconnect()}>
              Déconnecter Figma
            </Button>
          ) : (
            // A navigation, not a request: Figma's consent page opens in this tab, then comes back.
            <Button type="button" variant="outline" onClick={() => window.location.assign(new URL("/api/integrations/figma/connect", window.location.origin))}>
              Connecter Figma
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

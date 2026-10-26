"use client";

// « Compte Figma », from the account menu (US-054): each member connects their own Figma account, which reads
// the Figma files they work on and the comments of the « Figma » deliverables they make; or disconnects it.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { actionRequest } from "@/lib/actionRequest";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import type { FigmaConnectionStatus } from "@/db/figmaConnection";
import { FigmaConnectButton } from "./FigmaConnect";

type Status = { available: boolean; connection: FigmaConnectionStatus };

const day = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export function FigmaAccountDialog({ onClose }: { onClose: () => void }) {
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

  async function disconnect() {
    setPending(true);
    const answer = await actionRequest("/api/integrations/figma", "DELETE", undefined, () => false);
    setPending(false);
    if (!answer) return;
    setStatus((current) => current && { ...current, connection: null });
    toast("Votre compte Figma est déconnecté", { description: "Pour retirer aussi l’accès côté Figma : Paramètres du compte Figma › Applications connectées." });
  }

  const connection = status?.connection;
  return (
    <Modal
      open
      onClose={onClose}
      title="Compte Figma"
      description="Votre compte Figma lit les fichiers que vous importez dans Kora, et les commentaires de vos clients sur ces fichiers."
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {!status ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement…
        </p>
      ) : !status.available ? (
        <p className="text-sm text-muted-foreground">La connexion à Figma n’est pas configurée sur ce serveur.</p>
      ) : connection ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm">
            Connecté au compte Figma <b>{connection.handle}</b> depuis le {day(connection.connectedAt)}. Vos commentaires dans Figma sont ceux de l’organisation : ils restent dans Figma.
          </p>
          <Button type="button" variant="outline" disabled={pending} onClick={() => void disconnect()}>
            Déconnecter mon compte Figma
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Connectez votre compte Figma pour importer des fichiers Figma dans Kora et recevoir les commentaires de vos clients.</p>
          <FigmaConnectButton />
        </div>
      )}
    </Modal>
  );
}

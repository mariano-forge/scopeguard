"use client";

// « Paramètres de l’agence »: its name, changed by its owner or an administrator (Better Auth refuses the
// others on the server). The new name shows at once: the page reads it again.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, Modal } from "@/components/modal";
import { useCurrentUser } from "./CurrentUser";

export function AgencyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useCurrentUser();
  const router = useRouter();
  const [name, setName] = useState(user.organizationName ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = name.trim();
    if (!next) return setError("Donnez un nom à votre organisation.");
    if (!user.organizationId || next === user.organizationName) return onClose();
    setPending(true);
    const { error: failed } = await authClient.organization.update({ organizationId: user.organizationId, data: { name: next } });
    setPending(false);
    if (failed) return setError("Le nom n’a pas pu être changé. Seuls le propriétaire et les administrateurs le peuvent.");
    toast("Nom de l’organisation enregistré");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paramètres de l’organisation"
      description="Le nom que voient vos collègues et vos clients (e-mails, page de revue)."
      onSubmit={save}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <Field id="agency-name" label="Nom de l’organisation">
        <Input id="agency-name" maxLength={80} value={name} onChange={(event) => (setName(event.target.value), setError(""))} />
      </Field>
      {error && <FormError>{error}</FormError>}
    </Modal>
  );
}

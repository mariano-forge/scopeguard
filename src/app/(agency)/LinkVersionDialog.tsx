"use client";

// « Nouvelle version » of a « Lien »: a version of a staging site is its address, not a file. The field
// starts from the current version's address, which a new version often keeps. The toolbar line already on
// the site keeps working: its key is the deliverable's, and opens its latest shared version (src/lib/siteKey.ts).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, Modal } from "@/components/modal";
import { undeployedSiteProblem, withoutToolbarFlag } from "@/lib/siteReview";
import { isHttpUrl } from "@/components/deliverableKinds";

export function LinkVersionDialog({ url, onClose, onCreate }: { url: string; onClose: () => void; onCreate: (url: string) => Promise<void> }) {
  const [address, setAddress] = useState(() => withoutToolbarFlag(url));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isHttpUrl(address.trim())) return setError("Saisissez une adresse complète, par exemple https://recette.client.fr.");
    const undeployed = undeployedSiteProblem(address.trim());
    if (undeployed) return setError(undeployed);
    setSaving(true);
    try {
      await onCreate(withoutToolbarFlag(address.trim()));
    } catch {
      setError("La version n’a pas pu être enregistrée.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle version du site"
      description="L’adresse du site pour cette version. La barre Kora déjà installée reste valable : rien à recoller."
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Créer la version"}
          </Button>
        </>
      }
    >
      <Field id="link-version-url" label="Adresse du site">
        <Input id="link-version-url" inputMode="url" value={address} onChange={(event) => setAddress(event.target.value)} autoFocus />
      </Field>
      {error && <FormError>{error}</FormError>}
    </Modal>
  );
}

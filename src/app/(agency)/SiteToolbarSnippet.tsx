"use client";

// In « Partager la revue » of a « Lien » deliverable: the line to put on the staging site, once for every
// version (its fixed key, src/lib/siteKey.ts), and the address to send the client, which shows the Kora
// toolbar on their device (public/kora-toolbar.js).

import { useEffect, useState } from "react";
import { Field } from "@/components/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { siteClientUrl } from "@/lib/siteReview";

export function SiteToolbarSnippet({ deliverableId, siteUrl }: { deliverableId: number; siteUrl: string }) {
  const [key, setKey] = useState<string | null>(null);
  const clientUrl = siteClientUrl({ type: "Link", url: siteUrl });

  useEffect(() => {
    if (!clientUrl) return;
    let cancelled = false;
    fetch(`/api/deliverables/${deliverableId}/site-key`, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { key?: string }).key : null))
      .then((value) => !cancelled && typeof value === "string" && setKey(value))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [deliverableId, clientUrl]);

  // The panel only opens on a site in https (src/lib/siteReview.ts): said here rather than failing there.
  if (!clientUrl)
    return (
      <p role="note" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
        <b>Barre Kora indisponible :</b> le site de recette doit être en <code>https://</code> pour que le client y commente. Changez l’adresse du livrable.
      </p>
    );
  const snippet = key ? `<script src="${window.location.origin}/kora-toolbar.js" data-site="${key}" defer></script>` : "Préparation du script…";
  return (
    <>
      <Field
        id="site-snippet"
        label="Script de recette"
        hint="À placer une seule fois sur le site de recette, avant </body> : il ouvre toujours la dernière version partagée. La barre Kora ne s’ouvre que sur ce site, et seulement pour qui a le lien ci-dessous."
      >
        <Textarea id="site-snippet" readOnly rows={3} className="font-mono text-xs" value={snippet} onFocus={(event) => event.target.select()} />
      </Field>
      <Field id="site-client-url" label="Lien du site pour le client" hint="Il est aussi dans les e-mails d’invitation. Le client s’y vérifie par un code, comme pour la revue.">
        <Input id="site-client-url" readOnly value={clientUrl} onFocus={(event) => event.target.select()} />
      </Field>
    </>
  );
}

"use client";

// In « Partager la revue » of a « Lien » deliverable: the line to put on the staging site, and the
// address to send the client, which shows the Kora toolbar on their device (public/kora-toolbar.js).

import { Field } from "@/components/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { originOf, securedSite } from "@/lib/siteReview";

export function SiteToolbarSnippet({ token, siteUrl }: { token: string; siteUrl: string }) {
  // The panel only opens on a site in https (src/lib/siteReview.ts): said here rather than failing there.
  const origin = originOf(siteUrl);
  if (!origin || !securedSite(origin))
    return (
      <p role="note" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
        <b>Barre Kora indisponible :</b> le site de recette doit être en <code>https://</code> pour que le client y commente. Changez l’adresse du livrable.
      </p>
    );
  const snippet = `<script src="${window.location.origin}/kora-toolbar.js" data-review="${token}" defer></script>`;
  const clientUrl = (() => {
    try {
      const url = new URL(siteUrl);
      url.search = url.search ? `${url.search}&kora` : "?kora";
      return url.toString();
    } catch {
      return siteUrl;
    }
  })();
  return (
    <>
      <Field id="site-snippet" label="Script de recette" hint="À placer sur le site de recette, avant </body>. La barre Kora ne s’ouvre que sur ce site, et seulement pour qui a le lien ci-dessous.">
        <Textarea id="site-snippet" readOnly rows={2} className="font-mono text-xs" value={snippet} onFocus={(event) => event.target.select()} />
      </Field>
      <Field id="site-client-url" label="Lien du site pour le client" hint="Le client s’y vérifie par un code, comme pour la revue.">
        <Input id="site-client-url" readOnly value={clientUrl} onFocus={(event) => event.target.select()} />
      </Field>
    </>
  );
}

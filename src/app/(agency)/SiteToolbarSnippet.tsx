"use client";

// On the agency's « Tableau de recette » of a « Lien » deliverable: how to set up the Kora toolbar, in two
// steps. The line to put on the staging site once for every version (its fixed key, src/lib/siteKey.ts),
// and the address to send the client, which shows the toolbar on their device (public/kora-toolbar.js).

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { siteClientUrl } from "@/lib/siteReview";

/** A value to copy, with its button that says it was copied. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copié" : "Copier"}
    </Button>
  );
}

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
      <p role="note" className="site-setup-warning">
        <b>Barre Kora indisponible :</b> le site de recette doit être en <code>https://</code> pour que le client y commente. Changez l’adresse du livrable.
      </p>
    );
  const snippet = key ? `<script src="${window.location.origin}/kora-toolbar.js" data-site="${key}" defer></script>` : "Préparation du script…";
  return (
    <ol className="site-setup">
      <li>
        <span className="site-setup-step" aria-hidden="true">
          1
        </span>
        <div className="site-setup-body">
          <Label htmlFor="site-snippet">Script de recette</Label>
          <p>Collez-le une seule fois sur le site, juste avant <code>&lt;/body&gt;</code> : il ouvre toujours la dernière version partagée.</p>
          <div className="site-setup-value">
            <Textarea id="site-snippet" readOnly rows={2} className="font-mono text-xs" value={snippet} onFocus={(event) => event.target.select()} />
            {key && <CopyButton value={snippet} label="Copier le script" />}
          </div>
        </div>
      </li>
      <li>
        <span className="site-setup-step" aria-hidden="true">
          2
        </span>
        <div className="site-setup-body">
          <Label htmlFor="site-client-url">Lien du site pour le client</Label>
          <p>Envoyez-le à votre client (il est aussi dans les e-mails d’invitation) : il s’y vérifie par un code, puis commente directement sur le site.</p>
          <div className="site-setup-value">
            <Input id="site-client-url" readOnly value={clientUrl} onFocus={(event) => event.target.select()} />
            <CopyButton value={clientUrl} label="Copier le lien du site" />
          </div>
        </div>
      </li>
    </ol>
  );
}

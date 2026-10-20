"use client";

// On the agency's « Tableau de recette » of a « Lien » deliverable: how to set up the Kora toolbar, in three
// steps. The line to put on the staging site once for every version (its fixed key, src/lib/siteKey.ts),
// the address to send the client, which shows the toolbar on their device (public/kora-toolbar.js), and
// where their requests then arrive.

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { siteClientUrl } from "@/lib/siteReview";
import { SiteGuideSteps } from "./editor/SiteGuide";

/** A value to copy, in one line, with its button that says it was copied. The script reads as code. */
function CopyField({ id, label, value, copyLabel, code }: { id: string; label: string; value: string; copyLabel?: string; code?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`site-copy ${code ? "is-code" : ""}`}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input id={id} readOnly value={value} spellCheck={false} onFocus={(event) => event.target.select()} />
      {copyLabel && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={copyLabel}
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copié" : "Copier"}
        </Button>
      )}
    </div>
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
    <SiteGuideSteps
      steps={[
        {
          title: "Installez la barre Kora",
          text: (
            <>
              Collez cette ligne une seule fois sur votre site ou prototype, avant <code>&lt;/body&gt;</code>.
            </>
          ),
          children: <CopyField id="site-snippet" label="Script de recette" value={snippet} copyLabel={key ? "Copier le script" : undefined} code />,
        },
        {
          title: "Invitez votre client",
          text: "Envoyez-lui ce lien, ou passez par « Partager la revue ».",
          children: <CopyField id="site-client-url" label="Lien du site pour le client" value={clientUrl} copyLabel="Copier le lien du site" />,
        },
        {
          title: "Qualifiez ses demandes",
          text: (
            <>
              Chacune arrive ci-dessous. Classez-la <span className="decision-badge decision-included">Inclus</span> si elle est prévue au devis,{" "}
              <span className="decision-badge decision-outside">Hors scope</span> si elle est à chiffrer,{" "}
              <span className="decision-badge decision-pending">À clarifier</span> s’il faut en parler.
            </>
          ),
        },
      ]}
    />
  );
}

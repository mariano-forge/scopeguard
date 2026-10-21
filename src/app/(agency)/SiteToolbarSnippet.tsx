"use client";

// On the agency's « Tableau de recette » of a « Lien » deliverable: how to set up the Kora toolbar, in three
// steps. The line to put on the staging site, the deliverable's (src/lib/siteKey.ts): one per site, valid
// for all its versions, so it says nothing of the agency's other sites; the address to send the client,
// which shows the toolbar on their device (public/kora-toolbar.js); and where their requests then arrive.

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { siteClientUrl } from "@/lib/siteReview";
import { SiteGuideSteps, useLocalAccessNote } from "./editor/SiteGuide";

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

/** The deliverable's toolbar line, to copy (GET /api/deliverables/:id/site-key): the same for all its versions. */
function SiteScriptField({ id, deliverableId }: { id: string; deliverableId: number }) {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deliverables/${deliverableId}/site-key`, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { key?: string }).key : null))
      .then((value) => !cancelled && typeof value === "string" && setKey(value))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [deliverableId]);
  const line = key ? `<script src="${window.location.origin}/kora-toolbar.js" data-site="${key}" defer></script>` : null;
  return <CopyField id={id} label="Script de recette" value={line ?? "Préparation du script…"} copyLabel={line ? "Copier le script" : undefined} code />;
}

/**
 * The toolbar met for the first time, in « Nouveau livrable » for a « Lien »: an invitation to set it up and
 * what it does. Its line is the deliverable's: given on its board, once it is created.
 */
export function SiteScriptIntro() {
  return (
    <section className="script-intro" aria-labelledby="script-intro-title">
      <div>
        <h3 id="script-intro-title">Recevoir les retours directement depuis le site ?</h3>
        <p>
          Juste après la création, Kora vous donne une ligne à coller dans le code du site, avant <code>&lt;/body&gt;</code>. Le décideur pourra cliquer sur un élément et écrire sa
          demande : elle arrivera dans Kora, sur ce livrable, avec une capture.
        </p>
      </div>
      <p className="script-intro-note">Une ligne par site, valable pour toutes ses versions.</p>
    </section>
  );
}

export function SiteToolbarSnippet({ siteUrl, deliverableId }: { siteUrl: string; deliverableId: number }) {
  const clientUrl = siteClientUrl({ type: "Link", url: siteUrl });
  const localAccess = useLocalAccessNote();

  // The panel only opens on a site in https (src/lib/siteReview.ts): said here rather than failing there.
  if (!clientUrl)
    return (
      <p role="note" className="site-setup-warning">
        <b>Barre Kora indisponible :</b> le site de recette doit être en <code>https://</code> pour que le décideur y commente. Changez l’adresse du livrable.
      </p>
    );
  return (
    <>
      <SiteGuideSteps
        steps={[
          {
            title: "Installez la barre Kora",
            text: (
              <>
                Collez cette ligne une fois dans le code de ce site, avant <code>&lt;/body&gt;</code> : elle sert pour toutes ses versions. Déjà en place ? Rien à refaire.
                {localAccess && ` ${localAccess}`}
              </>
            ),
            children: <SiteScriptField id="site-snippet" deliverableId={deliverableId} />,
          },
          {
            title: "Invitez le décideur",
            text: "Envoyez-lui ce lien, ou passez par « Partager la revue ».",
            children: <CopyField id="site-client-url" label="Lien du site pour le décideur" value={clientUrl} copyLabel="Copier le lien pour le décideur" />,
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
    </>
  );
}

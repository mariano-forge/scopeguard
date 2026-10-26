"use client";

// On the agency's « Tableau de recette » of a « Lien » deliverable: how to set up the Kora toolbar, in three
// steps. The line to put on the staging site, the deliverable's (src/lib/siteKey.ts): one per site, valid
// for all its versions, so it says nothing of the agency's other sites; the address to send the client,
// which shows the toolbar on their device (public/kora-toolbar.js); and where their requests then arrive.
// The first step also asks what the site is built with, and says when the toolbar is seen there (SiteInstall.tsx).

import { useState } from "react";
import { Check, Copy, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { siteClientUrl } from "@/lib/siteReview";
import { SiteGuideSteps, useLocalAccessNote } from "./editor/SiteGuide";
import { InstallStatus, PlatformPicker, platforms, useSiteInstall } from "./SiteInstall";

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

/**
 * The toolbar met for the first time, in « Nouveau livrable » for a « Lien »: one line that points to the guide
 * its board opens on, once it is created (feedback of 26 October 2026: shorter, a pointer to the tutorial).
 */
export function SiteScriptIntro() {
  return (
    <p className="script-intro" role="note" aria-label="Retours sur le site">
      <MousePointerClick aria-hidden="true" />
      Pour recevoir les retours directement sur le site, suivez le guide qui s’ouvre sur le livrable une fois créé.
    </p>
  );
}

export function SiteToolbarSnippet({ siteUrl, deliverableId }: { siteUrl: string; deliverableId: number }) {
  const clientUrl = siteClientUrl({ type: "Link", url: siteUrl });
  const localAccess = useLocalAccessNote();
  const { key, seenAt } = useSiteInstall(deliverableId);
  const [platformId, setPlatformId] = useState("html");
  const platform = platforms.find((option) => option.id === platformId) ?? platforms[0];
  const line = key ? platform.line(`${window.location.origin}/kora-toolbar.js`, key) : null;

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
            title: "Ajoutez la barre Kora à votre site",
            lead: <PlatformPicker value={platform.id} onChange={setPlatformId} />,
            // Short sentences that say what to do (feedback of 26 October 2026).
            text: (
              <>
                Copiez la ligne ci-dessous.{" "}
                {platform.id === "html" ? (
                  <>
                    Collez-la dans le code de votre site, juste avant <code>&lt;/body&gt;</code>.
                  </>
                ) : (
                  <>Où la coller : {platform.where}</>
                )}{" "}
                Une seule fois suffit : elle sert pour toutes les versions. Si elle est déjà en place, passez à l’étape 2.
                {localAccess && ` ${localAccess}`}
              </>
            ),
            children: (
              <>
                <CopyField id="site-snippet" label="Script de recette" value={line ?? "Préparation du script…"} copyLabel={line ? "Copier le script" : undefined} code />
                <InstallStatus host={new URL(clientUrl).host} seenAt={seenAt} />
              </>
            ),
          },
          {
            title: "Envoyez le lien au décideur",
            text: "Copiez ce lien et envoyez-le au décideur. En l’ouvrant, il voit la barre Kora sur le site et peut commenter. Vous pouvez aussi l’inviter avec « Partager la revue ».",
            children: <CopyField id="site-client-url" label="Lien du site pour le décideur" value={clientUrl} copyLabel="Copier le lien pour le décideur" />,
          },
          {
            title: "Qualifiez chaque demande",
            text: (
              <>
                Chaque commentaire du décideur arrive ici, avec une capture de ce qu’il visait. Ouvrez-le et classez-le :{" "}
                <span className="decision-badge decision-included">Inclus</span> si c’est prévu au devis,{" "}
                <span className="decision-badge decision-outside">Hors scope</span> si c’est à chiffrer,{" "}
                <span className="decision-badge decision-pending">À clarifier</span> s’il faut en parler.
              </>
            ),
          },
        ]}
      />
    </>
  );
}

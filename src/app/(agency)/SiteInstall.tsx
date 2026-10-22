"use client";

// Inside the first step of a « Lien »'s board (SiteToolbarSnippet.tsx), in its design: what the site is
// built with, which says where the line goes (and, for Next.js, writes it as a Script), and whether Kora
// has seen the toolbar on the site yet (src/db/siteSeen.ts), told live, without reloading.

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import "./siteInstall.css";

export type Platform = { id: string; label: string; where: React.ReactNode; line: (src: string, key: string) => string };

const htmlLine = (src: string, key: string) => `<script src="${src}" data-site="${key}" defer></script>`;

export const platforms: Platform[] = [
  // Said by the step itself, as the board always said it.
  { id: "html", label: "HTML", where: null, line: htmlLine },
  {
    id: "next",
    label: "Next.js",
    where: (
      <>
        Dans <code>app/layout.tsx</code>, dans le <code>&lt;body&gt;</code>, avec <code>import Script from &quot;next/script&quot;</code>. Pas dans une page seule, ni en dehors d’un composant : la barre ne
        s’y lancerait pas, sans aucune erreur.
      </>
    ),
    line: (src, key) => `<Script src="${src}" data-site="${key}" strategy="afterInteractive" />`,
  },
  { id: "wordpress", label: "WordPress", where: <>Avec une extension du type « Insert Headers and Footers » (zone pied de page), ou dans le <code>footer.php</code> du thème.</>, line: htmlLine },
  { id: "webflow", label: "Webflow", where: <>Dans <i>Project settings → Custom code → Footer code</i>, puis publiez le site.</>, line: htmlLine },
  { id: "shopify", label: "Shopify", where: <>Dans <code>theme.liquid</code>, juste avant <code>&lt;/body&gt;</code>.</>, line: htmlLine },
  { id: "gtm", label: "Tag Manager", where: <>Une balise « HTML personnalisé » déclenchée sur toutes les pages, puis publiez le conteneur.</>, line: htmlLine },
];

/** The deliverable's key and when the toolbar was seen on its site: asked again every few seconds until it is. */
export function useSiteInstall(deliverableId: number) {
  const [state, setState] = useState<{ for: number; key: string | null; seenAt: string | null }>({ for: deliverableId, key: null, seenAt: null });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function check() {
      const response = await fetch(`/api/deliverables/${deliverableId}/site-key`, { cache: "no-store" }).catch(() => null);
      const body = response?.ok ? ((await response.json().catch(() => null)) as { key?: unknown; seenAt?: unknown } | null) : null;
      if (cancelled) return;
      const seenAt = typeof body?.seenAt === "string" ? body.seenAt : null;
      setState({ for: deliverableId, key: typeof body?.key === "string" ? body.key : null, seenAt });
      if (!seenAt) timer = setTimeout(check, 4000);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deliverableId]);
  // Another deliverable: nothing known of it yet.
  return state.for === deliverableId ? state : { key: null, seenAt: null };
}

/** « Votre site est fait avec » : one choice, the others a click away. */
export function PlatformPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="site-platforms" role="group" aria-label="Votre site est fait avec">
      <span aria-hidden="true">Votre site :</span>
      {platforms.map((platform) => (
        <button key={platform.id} type="button" className="site-platform" aria-pressed={platform.id === value} onClick={() => onChange(platform.id)}>
          {platform.label}
        </button>
      ))}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Whether the toolbar was seen on the site, said as it changes. */
export function InstallStatus({ host, seenAt }: { host: string; seenAt: string | null }) {
  return (
    <p role="status" className={`site-install-status ${seenAt ? "is-seen" : ""}`}>
      {seenAt ? <Check aria-hidden="true" /> : <LoaderCircle aria-hidden="true" className="animate-spin" />}
      {seenAt ? (
        <span>
          <b>Barre détectée</b> sur {host}, le {when(seenAt)}.
        </span>
      ) : (
        <span>
          <b>En attente de la barre sur {host}…</b> Une fois la ligne collée et le site publié, ouvrez-le (« Ouvrir le site », en haut) : ce message change de lui-même. Rien ne change ?
          Vérifiez que la ligne est sur toutes les pages.
        </span>
      )}
    </p>
  );
}

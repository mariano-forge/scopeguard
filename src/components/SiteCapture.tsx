// The capture of the staging site's window when a request was placed there (src/lib/siteCapture.ts),
// with the click on it: what the client saw, whatever the site has become since. Shown in the request's
// thread (agency and client) and in Kora's panel on the site.

import type { SiteAnchor } from "@/lib/siteReview";

export function SiteCapture({ site }: { site: SiteAnchor }) {
  return (
    <figure className="grid gap-1">
      {site.capture && (
        <a className="relative block overflow-hidden rounded-[var(--r-field)] border border-[var(--border)]" href={site.capture} target="_blank" rel="noopener">
          {/* A plain image: a file of the agency's storage behind /api/files (Kora has no next/image endpoint). */}
          <img className="block w-full" src={site.capture} alt={`Capture de la page ${site.url} au moment de la demande`} />
          {site.view && (
            <span
              aria-hidden
              className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--paper)] bg-[var(--action-fill)] shadow"
              style={{ left: `${site.view.x}%`, top: `${site.view.y}%` }}
            />
          )}
        </a>
      )}
      <figcaption className="text-xs text-[var(--graphite)]">
        Sur le site de recette : {site.url} · écran de {site.viewport} px
      </figcaption>
    </figure>
  );
}

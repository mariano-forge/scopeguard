// The capture of the staging site's window when a request was placed there (src/lib/siteCapture.ts):
// what the client saw, whatever the site has become since, with the element and the click drawn in the
// image itself by the toolbar (public/kora-toolbar.js). Shown in the request's
// thread (agency and client) and in Kora's panel on the site.

import type { SiteAnchor } from "@/lib/siteReview";

export function SiteCapture({ site }: { site: SiteAnchor }) {
  return (
    <figure className="site-capture grid gap-1">
      {site.capture && (
        <a className="block overflow-hidden rounded-[var(--r-field)] border border-[var(--border)]" href={site.capture} target="_blank" rel="noopener">
          {/* A plain image: a file of the agency's storage behind /api/files (Kora has no next/image endpoint). */}
          <img className="block w-full" src={site.capture} alt={`Capture de la page ${site.url} au moment de la demande`} />
        </a>
      )}
      <figcaption className="text-xs text-[var(--graphite)]">
        Sur le site de recette : {site.url} · écran de {site.viewport} px
      </figcaption>
    </figure>
  );
}

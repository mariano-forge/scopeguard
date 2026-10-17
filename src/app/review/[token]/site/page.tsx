// Kora's panel on the agency's staging site (US-048), opened in a frame by public/kora-toolbar.js:
//   /review/:token/site?parent=<origin of the page that frames it>
// src/proxy.ts lets only `parent` frame it; this page checks that `parent` is the site of the shared
// deliverable (a « Lien »), and shows nothing otherwise: no other site gets a framed Kora to click on.

import { getDb } from "@/db/client";
import { findReviewAccess, reviewedSiteOrigin } from "@/db/reviewAccess";
import { parentOrigin } from "@/lib/siteReview";
import { SitePanel } from "./SitePanel";

export default async function SitePanelPage({ params, searchParams }: PageProps<"/review/[token]/site">) {
  const { token } = await params;
  const { parent } = await searchParams;
  const db = getDb();
  const access = await findReviewAccess(db, token);
  const site = access ? await reviewedSiteOrigin(db, access) : null;
  if (!site || site !== parentOrigin(typeof parent === "string" ? parent : null))
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-6 text-center text-sm text-[var(--graphite)]">
        <p>Ce panneau Kora ne s’ouvre que sur le site de la revue, avec un lien valable.</p>
      </main>
    );
  return <SitePanel token={token} parent={site} />;
}

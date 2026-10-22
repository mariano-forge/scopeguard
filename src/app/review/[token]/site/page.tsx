// Kora's panel on the agency's staging site (US-048), opened in a frame by public/kora-toolbar.js:
//   /review/:token/site?parent=<origin of the page that frames it>
// src/proxy.ts lets only `parent` frame it; this page checks that `parent` is the site of the shared
// deliverable (a « Lien »), and shows nothing otherwise: no other site gets a framed Kora to click on.

import { headers } from "next/headers";
import { AuthShell } from "@/components/AuthShell";
import { WrongSiteNote } from "@/components/GatePieces";
import { getDb } from "@/db/client";
import { findReviewAccess, livrableIdOfVersion, reviewedSiteOrigin } from "@/db/reviewAccess";
import { markSiteSeen } from "@/db/siteSeen";
import { parentOrigin } from "@/lib/siteReview";
import { SitePanel } from "./SitePanel";

export default async function SitePanelPage({ params, searchParams }: PageProps<"/review/[token]/site">) {
  const { token } = await params;
  const { parent } = await searchParams;
  const db = getDb();
  const access = await findReviewAccess(db, token);
  const site = access ? await reviewedSiteOrigin(db, access) : null;
  const origin = parentOrigin(typeof parent === "string" ? parent : null);
  if (!site || site !== origin)
    return (
      <AuthShell plain>
        <WrongSiteNote origin={origin} />
      </AuthShell>
    );
  // A line with a version's token (before the fixed key) loads this page directly: the toolbar is
  // installed too (src/db/siteSeen.ts).
  if ((await headers()).get("sec-fetch-dest") === "iframe") {
    const livrableId = await livrableIdOfVersion(db, access!.organizationId, access!.deliverableId);
    if (livrableId) await markSiteSeen(db, access!.organizationId, livrableId);
  }
  return <SitePanel token={token} parent={site} />;
}

// Kora's panel on a staging site, by the key of the toolbar's line (<script … data-site="<key>">,
// src/lib/siteKey.ts): the agency's key finds the deliverable by the page's address, a deliverable's key
// names it; then its latest version shared with an active link opens (its panel, /review/:token/site).
// Framed by the deliverable's site only, as the panel (src/proxy.ts); anyone else, or a key not signed by
// Kora, gets nothing but a sentence saying why.

import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { GateHeading, WrongSiteNote } from "@/components/GatePieces";
import { getDb } from "@/db/client";
import { latestSharedSite, livrablesOnSite } from "@/db/reviewAccess";
import { readSiteKey } from "@/lib/siteKey";
import { parentOrigin } from "@/lib/siteReview";

const note = (title: string, text: string) => (
  <AuthShell plain>
    <GateHeading title={title}>
      {text}
    </GateHeading>
  </AuthShell>
);

const versionLabel = (version: number) => `V${String(version).padStart(2, "0")}`;

export default async function SiteKeyPage({ params, searchParams }: PageProps<"/review/site/[key]">) {
  const { key } = await params;
  const { parent } = await searchParams;
  const claim = readSiteKey(key);
  const origin = parentOrigin(typeof parent === "string" ? parent : null);
  const db = getDb();
  let found = claim?.livrableId ? await latestSharedSite(db, claim.organizationId, claim.livrableId) : null;
  // The agency's line: the deliverable whose latest version is this page; of several, the one shared here.
  if (claim && claim.livrableId === null && origin) {
    const livrables = await livrablesOnSite(db, claim.organizationId, origin);
    if (!livrables.length)
      return note(
        "Ce site n’est pas encore dans Kora",
        `Administrateur : dans Kora, ajoutez un livrable « Lien » à l’adresse ${origin}, puis partagez-le : le panneau s’ouvrira ici.`,
      );
    const candidates = await Promise.all(livrables.map((livrableId) => latestSharedSite(db, claim.organizationId, livrableId)));
    found = candidates.find((candidate) => candidate?.shared?.site === origin) ?? candidates[0];
  }
  // A line changed by hand, or whose deliverable was deleted: it leads nowhere, whatever the page.
  if (claim?.livrableId === null && !origin)
    return (
      <AuthShell plain>
        <WrongSiteNote origin={origin} />
      </AuthShell>
    );
  if (!found)
    return note(
      "Cette ligne de script ne mène à aucun livrable",
      "Son livrable a été supprimé, ou la ligne a été modifiée. Administrateur : dans Kora, copiez la ligne de la barre (« Paramétrer la barre Kora ») et remplacez celle-ci.",
    );
  const { latest, shared } = found;
  if (origin && shared?.site === origin) redirect(`/review/${encodeURIComponent(shared.token)}/site?parent=${encodeURIComponent(origin)}`);
  if (!origin || latest.site !== origin)
    return (
      <AuthShell plain>
        <WrongSiteNote origin={origin} />
      </AuthShell>
    );
  // This page is the latest version's site, but the panel opens the latest shared version only.
  if (shared)
    return note(
      `La ${versionLabel(latest.version)} n’est pas encore partagée`,
      `La version partagée (${versionLabel(shared.version)}) est à une autre adresse. Administrateur : partagez la ${versionLabel(latest.version)} depuis Kora pour ouvrir le panneau ici.`,
    );
  return note("Rien à revoir pour l’instant", "Aucune version de ce site n’est partagée pour l’instant. Administrateur : partagez-en une depuis Kora pour ouvrir le panneau ici.");
}

// Kora's panel on a staging site, by the deliverable's fixed key (<script … data-site="<key>">,
// src/lib/siteKey.ts): the latest version shared with an active link opens (its panel,
// /review/:token/site). Framed by the deliverable's site only, as the panel (src/proxy.ts); anyone else,
// or a key not signed by Kora, gets nothing.

import { redirect } from "next/navigation";
import { Info } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { GateHeading } from "@/components/GatePieces";
import { getDb } from "@/db/client";
import { latestSharedSite } from "@/db/reviewAccess";
import { readSiteKey } from "@/lib/siteKey";
import { parentOrigin } from "@/lib/siteReview";

const note = (title: string, text: string) => (
  <AuthShell plain>
    <GateHeading icon={<Info />} title={title}>
      {text}
    </GateHeading>
  </AuthShell>
);

export default async function SiteKeyPage({ params, searchParams }: PageProps<"/review/site/[key]">) {
  const { key } = await params;
  const { parent } = await searchParams;
  const deliverable = readSiteKey(key);
  const found = deliverable ? await latestSharedSite(getDb(), deliverable.organizationId, deliverable.livrableId) : null;
  const origin = parentOrigin(typeof parent === "string" ? parent : null);
  if (!found?.site || found.site !== origin) return note("Panneau indisponible ici", "Ce panneau Kora ne s’ouvre que sur le site de la revue.");
  if (!found.token) return note("Rien à revoir pour l’instant", "Aucune version de ce site n’est partagée pour l’instant. L’agence vous préviendra dès qu’elle le sera.");
  redirect(`/review/${encodeURIComponent(found.token)}/site?parent=${encodeURIComponent(origin)}`);
}

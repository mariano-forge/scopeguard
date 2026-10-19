// « Je suis de l'agence », opened by Kora's panel on the staging site in a window of its own: here the
// member's Kora session is there (a frame from another site never gets it). Once they confirm, the
// window hands the panel a ticket for this link and closes (src/lib/siteAgency.ts). Not framable.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { reviewedDeliverableName } from "@/db/reviewAuth";
import { Link2Off, LogIn, UserX } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { GateHeading } from "@/components/GatePieces";
import { Button } from "@/components/ui/button";
import { getCurrentUser, isMemberOf } from "@/lib/session";
import { AgencyHandoff } from "./AgencyHandoff";

export default async function SiteAgencyPage({ params }: PageProps<"/review/[token]/site/agence">) {
  const { token } = await params;
  const db = getDb();
  const access = await findReviewAccess(db, token);
  const user = await getCurrentUser();
  const member = Boolean(access && user && (await isMemberOf(user.id, access.organizationId)));
  const back = `/connexion?suite=${encodeURIComponent(`/review/${token}/site/agence`)}`;
  return (
    <AuthShell plain>
      {!access ? (
        <GateHeading icon={<Link2Off />} tone="warning" title="Lien indisponible">
          Ce lien de revue n’est plus valable.
        </GateHeading>
      ) : !user ? (
        <div className="gate-form">
          <GateHeading icon={<LogIn />} title="Connectez-vous à Kora">
            Pour annoter le site de recette au nom de l’agence, connectez-vous d’abord à votre compte Kora.
          </GateHeading>
          <Button asChild size="lg" className="w-full">
            <a href={back}>Se connecter</a>
          </Button>
        </div>
      ) : !member ? (
        <GateHeading icon={<UserX />} tone="warning" title="Revue d’une autre agence">
          Votre compte n’est pas membre de l’agence de cette revue.
        </GateHeading>
      ) : (
        <AgencyHandoff token={token} name={user.name} deliverable={await reviewedDeliverableName(db, access)} />
      )}
    </AuthShell>
  );
}

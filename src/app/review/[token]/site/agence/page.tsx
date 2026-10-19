// « Je suis de l'agence », opened by Kora's panel on the staging site in a window of its own: here the
// member's Kora session is there (a frame from another site never gets it). Once they confirm, the
// window hands the panel a ticket for this link and closes (src/lib/siteAgency.ts). Not framable.

import { getDb } from "@/db/client";
import { findReviewAccess } from "@/db/reviewAccess";
import { reviewedDeliverableName } from "@/db/reviewAuth";
import { AuthShell } from "@/components/AuthShell";
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
        <p className="text-sm">Ce lien de revue n’est plus valable.</p>
      ) : !user ? (
        <div className="grid gap-3 text-sm">
          <h1 className="font-heading text-lg font-bold">Connectez-vous à Kora</h1>
          <p className="text-[var(--graphite)]">Pour annoter le site de recette au nom de l’agence, connectez-vous d’abord à votre compte Kora.</p>
          <a className="font-medium text-[var(--action-text)] underline-offset-2 hover:underline" href={back}>
            Se connecter
          </a>
        </div>
      ) : !member ? (
        <p className="text-sm">Votre compte n’est pas membre de l’agence de cette revue.</p>
      ) : (
        <AgencyHandoff token={token} name={user.name} deliverable={await reviewedDeliverableName(db, access)} />
      )}
    </AuthShell>
  );
}

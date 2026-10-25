import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { pendingAgencyInvitations } from "@/lib/agencyInvitations";
import { getCurrentUser } from "@/lib/session";
import { CreateAgencyForm } from "./CreateAgencyForm";
import { OnboardingSteps } from "./OnboardingSteps";

export const metadata: Metadata = { title: "Bienvenue · Kora" };

/** After sign-up, a member without an agency creates theirs (and owns it) or joins one they were invited to. */
export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (user.organizationId) redirect("/");
  const invitations = await pendingAgencyInvitations(user.email);

  return (
    <AuthShell>
      <div className="grid gap-5">
        <OnboardingSteps current={0} />
        <div className="grid gap-1">
          <h1 className="font-heading text-lg font-bold">Bienvenue, {user.name}</h1>
          <p className="text-sm text-[var(--graphite)]">
            Créez l’espace de votre organisation : vous en serez propriétaire et pourrez y inviter vos collègues.
          </p>
        </div>

        {invitations.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Vous êtes invité à rejoindre :</p>
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between gap-3 rounded-[var(--r-field)] border border-[var(--border)] px-3 py-2">
                <span className="min-w-0 text-sm">
                  <b className="block truncate">{invitation.organizationName}</b>
                  <span className="text-[var(--graphite)]">invité par {invitation.inviterName}</span>
                </span>
                <Button asChild size="sm">
                  <Link href={`/invitation/${invitation.id}`}>Voir</Link>
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-1 text-xs text-[var(--graphite)]">
              <span className="h-px flex-1 bg-[var(--border)]" />
              ou créez votre organisation
              <span className="h-px flex-1 bg-[var(--border)]" />
            </div>
          </div>
        )}

        <CreateAgencyForm />
      </div>
    </AuthShell>
  );
}

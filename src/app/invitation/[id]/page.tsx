import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { agencyInvitation } from "@/lib/agencyInvitations";
import { maskEmail } from "@/lib/maskEmail";
import { getCurrentUser } from "@/lib/session";
import { InvitationActions } from "./InvitationActions";

export const metadata: Metadata = { title: "Invitation · Kora" };

/** Opened from the invitation e-mail. Signed-out visitors are sent to /connexion first (src/proxy.ts). */
export default async function InvitationPage({ params }: PageProps<"/invitation/[id]">) {
  const { id } = await params;
  const [invitation, user] = await Promise.all([agencyInvitation(id), getCurrentUser()]);

  const message = (title: string, text: React.ReactNode) => (
    <AuthShell>
      <div className="grid gap-4">
        <h1 className="font-heading text-lg font-bold">{title}</h1>
        <p className="text-sm text-[var(--graphite)]">{text}</p>
        <Button asChild size="lg" variant="outline">
          <Link href="/">Aller à Kora</Link>
        </Button>
      </div>
    </AuthShell>
  );

  if (!invitation || !user) return message("Invitation introuvable", "Ce lien d’invitation n’existe pas. Demandez à votre organisation de vous inviter à nouveau.");
  if (invitation.status === "accepted" && user.organizations.some((agency) => agency.name === invitation.organizationName))
    return message("Déjà membre", `Vous faites déjà partie de ${invitation.organizationName}.`);
  if (invitation.status !== "pending" || invitation.expired)
    return message("Invitation expirée", "Cette invitation n’est plus valable. Demandez à votre organisation de vous en envoyer une nouvelle.");
  if (invitation.email.toLowerCase() !== user.email.toLowerCase())
    return (
      <AuthShell>
        <div className="grid gap-4">
          <h1 className="font-heading text-lg font-bold">Ce n’est pas le bon compte</h1>
          <p className="text-sm text-[var(--graphite)]">
            Cette invitation est destinée à <b>{maskEmail(invitation.email)}</b>, mais vous êtes connecté en tant que <b>{user.email}</b>. Déconnectez-vous, puis
            connectez-vous ou créez un compte avec la bonne adresse.
          </p>
          <InvitationActions invitationId={id} mode="switch-account" />
        </div>
      </AuthShell>
    );

  return (
    <AuthShell>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <h1 className="font-heading text-lg font-bold">Rejoindre {invitation.organizationName}</h1>
          <p className="text-sm text-[var(--graphite)]">
            {invitation.inviterName} vous invite à rejoindre l’organisation <b>{invitation.organizationName}</b> sur Kora.
          </p>
        </div>
        <InvitationActions invitationId={id} mode="answer" />
      </div>
    </AuthShell>
  );
}

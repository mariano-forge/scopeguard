import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleSignInEnabled } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { agencyInvitation } from "@/lib/agencyInvitations";
import { AuthShell } from "@/components/AuthShell";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Connexion · Kora" };

/** Where to go after signing in: a path of this site only (never "//other.site"). */
function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = safeNext(params.suite);
  if (await getCurrentUser()) redirect(next);
  // Coming from an agency invitation: pre-fill its address and start on account creation.
  const invitationId = /^\/invitation\/([^/?#]+)$/.exec(next)?.[1];
  const invitation = invitationId ? await agencyInvitation(invitationId) : null;

  return (
    <AuthShell>
      <SignInForm
        next={next}
        googleEnabled={googleSignInEnabled()}
        oauthError={typeof params.error === "string" ? params.error : undefined}
        invitation={invitation && invitation.status === "pending" ? { email: invitation.email, organizationName: invitation.organizationName } : undefined}
      />
    </AuthShell>
  );
}

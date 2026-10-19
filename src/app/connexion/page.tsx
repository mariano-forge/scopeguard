import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { socialSignIns } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { agencyInvitation } from "@/lib/agencyInvitations";
import { maskEmail } from "@/lib/maskEmail";
import { AuthShell } from "@/components/AuthShell";
import { SiteNav } from "../decouvrir/SiteChrome";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Connexion · Kora" };

/** An address typed on the landing page ("Commencer"), to fill in: a plausible e-mail, or nothing. */
function startEmail(value: string | string[] | undefined) {
  return typeof value === "string" && value.length <= 200 && /^[^\s@]+@[^\s@]+$/.test(value) ? value : undefined;
}

/** Where to go after signing in: a path of this site only (never "//other.site"). */
function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export default async function SignInPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = safeNext(params.suite);
  if (await getCurrentUser()) redirect(next);
  // Coming from an agency invitation: start on account creation, naming the agency and the address
  // masked. Whoever holds the link must not learn the address; the server checks it when accepting.
  const invitationId = /^\/invitation\/([^/?#]+)$/.exec(next)?.[1];
  const invitation = invitationId ? await agencyInvitation(invitationId) : null;

  return (
    <AuthShell nav={<SiteNav signIn={false} />}>
      <SignInForm
        next={next}
        providers={socialSignIns()}
        oauthError={typeof params.error === "string" ? params.error : undefined}
        email={startEmail(params.email)}
        invitation={invitation && invitation.status === "pending" ? { maskedEmail: maskEmail(invitation.email), organizationName: invitation.organizationName } : undefined}
      />
    </AuthShell>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleSignInEnabled } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
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

  return (
    <AuthShell>
      <SignInForm next={next} googleEnabled={googleSignInEnabled()} oauthError={typeof params.error === "string" ? params.error : undefined} />
    </AuthShell>
  );
}

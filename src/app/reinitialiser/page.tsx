import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Nouveau mot de passe · Kora" };

/** Opened from the reset link: /reinitialiser?token=… (or ?error=INVALID_TOKEN when it expired). */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reinitialiser">) {
  const { token, error } = await searchParams;
  return (
    <AuthShell>
      <ResetPasswordForm token={typeof token === "string" && !error ? token : null} />
    </AuthShell>
  );
}

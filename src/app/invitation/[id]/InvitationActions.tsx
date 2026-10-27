"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function InvitationActions({ invitationId, mode }: { invitationId: string; mode: "answer" | "switch-account" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setPending(true);
    setError("");
    const { data, error: failed } = await authClient.organization.acceptInvitation({ invitationId });
    if (failed || !data) {
      setPending(false);
      setError(
        failed?.code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED"
          ? "Cette organisation a atteint son nombre maximal de membres."
          : "L’invitation n’a pas pu être acceptée. Elle a peut-être expiré.",
      );
      return;
    }
    await authClient.organization.setActive({ organizationId: data.invitation.organizationId });
    // Full load: the agency app starts again on the new agency's data.
    window.location.assign("/");
  }

  async function decline() {
    setPending(true);
    await authClient.organization.rejectInvitation({ invitationId });
    router.replace("/");
    router.refresh();
  }

  async function switchAccount() {
    setPending(true);
    await authClient.signOut();
    router.replace(`/connexion?suite=${encodeURIComponent(`/invitation/${invitationId}`)}`);
    router.refresh();
  }

  if (mode === "switch-account")
    return (
      <Button size="lg" disabled={pending} onClick={() => void switchAccount()}>
        Changer de compte
      </Button>
    );

  return (
    <div className="grid gap-2">
      {error && (
        <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
          {error}
        </p>
      )}
      <Button size="lg" disabled={pending} onClick={() => void accept()}>
        Rejoindre l’organisation
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => void decline()}>
        Refuser
      </Button>
    </div>
  );
}

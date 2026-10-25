"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "Studio Nord" -> "studio-nord-k3f9q2": the slug must be unique, the name need not be. */
function slugOf(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "agence"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CreateAgencyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const agencyName = name.trim();
    if (!agencyName) return;
    setPending(true);
    setError("");
    const { data, error: failed } = await authClient.organization.create({ name: agencyName, slug: slugOf(agencyName) });
    if (failed || !data) {
      setPending(false);
      setError(
        failed?.code === "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS"
          ? "Vous faites déjà partie d’une organisation."
          : "L’organisation n’a pas pu être créée. Réessayez.",
      );
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    // Then its first client, project and colleagues.
    router.replace("/demarrer");
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="agency-name">Nom de votre organisation</Label>
        <Input id="agency-name" required maxLength={80} autoFocus placeholder="Studio Nord" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      {error && (
        <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || !name.trim()}>
        Créer mon organisation
      </Button>
    </form>
  );
}

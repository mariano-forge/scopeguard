"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/modal";

type Status = { kind: "idle" } | { kind: "pending" } | { kind: "done"; email: string } | { kind: "error"; message: string };

/** The demo request: mailed to the team (POST /api/demo), answered by e-mail. */
export function DemoForm() {
  const id = useId();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setStatus({ kind: "pending" });
    const response = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) }).catch(() => null);
    const body: { error?: unknown } = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok) {
      setStatus({ kind: "done", email: String(fields.email ?? "") });
      return;
    }
    setStatus({ kind: "error", message: typeof body.error === "string" ? body.error : "L’envoi n’a pas abouti. Réessayez dans un instant." });
  }

  if (status.kind === "done")
    return (
      <div className="demo-card demo-done" role="status">
        <svg className="demo-check" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="30" pathLength="1" />
          <path d="M20 33 L 28 41 L 45 24" pathLength="1" />
        </svg>
        <h2>C’est noté.</h2>
        <p>
          Nous vous écrivons à <b>{status.email}</b> pour convenir d’un créneau.
        </p>
        <Link href="/" className="lp-link">
          <ArrowLeft /> Retour à l’accueil
        </Link>
      </div>
    );

  return (
    <form className="demo-card" onSubmit={submit} aria-label="Réserver une démo">
      <div className="demo-row">
        <Field id={`${id}-name`} label="Nom">
          <Input id={`${id}-name`} name="name" required maxLength={100} autoComplete="name" />
        </Field>
        <Field id={`${id}-agency`} label="Agence" optional>
          <Input id={`${id}-agency`} name="agency" maxLength={100} autoComplete="organization" />
        </Field>
      </div>
      <Field id={`${id}-email`} label="E-mail professionnel">
        <Input id={`${id}-email`} name="email" type="email" required maxLength={200} autoComplete="email" placeholder="vous@votre-agence.fr" />
      </Field>
      <Field id={`${id}-message`} label="Message" optional>
        <Textarea id={`${id}-message`} name="message" maxLength={1000} rows={4} placeholder="Vos livrables, vos projets en cours, ce qui coince aujourd’hui…" />
      </Field>
      {/* Honeypot: people never see it, bots fill it (the server then sends nothing). */}
      <input name="website" className="demo-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {status.kind === "error" && <FormError>{status.message}</FormError>}
      <Button type="submit" size="lg" className="lp-btn demo-submit" disabled={status.kind === "pending"}>
        {status.kind === "pending" ? "Envoi…" : "Envoyer la demande"}
      </Button>
    </form>
  );
}

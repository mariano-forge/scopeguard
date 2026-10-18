"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError, Modal } from "@/components/modal";

type Status = { kind: "idle" } | { kind: "pending" } | { kind: "done" } | { kind: "error"; message: string };

/** "Réserver une démo": opens the request form; the request goes to the team by e-mail (POST /api/demo). */
export function DemoButton({
  label = "Réserver une démo",
  variant = "default",
  className,
}: {
  label?: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setStatus({ kind: "pending" });
    // Not an action on an agency's state: a plain call, answered with { ok } or { error }.
    const response = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fields) }).catch(() => null);
    const body: { error?: unknown } = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok) {
      setStatus({ kind: "done" });
      return;
    }
    setStatus({ kind: "error", message: typeof body.error === "string" ? body.error : "L’envoi n’a pas abouti. Réessayez dans un instant." });
  }

  return (
    <>
      <Button
        size="lg"
        variant={variant}
        className={className}
        onClick={() => {
          setStatus({ kind: "idle" });
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={status.kind === "done" ? "Demande envoyée" : "Réserver une démo"}
        description={status.kind === "done" ? undefined : "Trente minutes, sur vos propres livrables. Nous revenons vers vous par e-mail."}
        onSubmit={status.kind === "done" ? undefined : submit}
        footer={
          status.kind === "done" ? (
            <Button type="button" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={status.kind === "pending"}>
                {status.kind === "pending" ? "Envoi…" : "Envoyer la demande"}
              </Button>
            </>
          )
        }
      >
        {status.kind === "done" ? (
          <p role="status" className="text-sm">
            Merci ! Nous vous écrivons à l’adresse indiquée pour convenir d’un créneau.
          </p>
        ) : (
          <>
            <Field id={`${id}-name`} label="Nom">
              <Input id={`${id}-name`} name="name" required maxLength={100} autoComplete="name" autoFocus />
            </Field>
            <Field id={`${id}-email`} label="E-mail">
              <Input id={`${id}-email`} name="email" type="email" required maxLength={200} autoComplete="email" placeholder="vous@votre-agence.fr" />
            </Field>
            <Field id={`${id}-agency`} label="Agence" optional>
              <Input id={`${id}-agency`} name="agency" maxLength={100} autoComplete="organization" />
            </Field>
            <Field id={`${id}-message`} label="Message" optional>
              <Textarea id={`${id}-message`} name="message" maxLength={1000} rows={3} placeholder="Vos livrables, votre volume de projets, ce qui vous fait perdre du temps aujourd’hui…" />
            </Field>
            {/* Honeypot: people never see it, bots fill it (the server then sends nothing). */}
            <input name="website" className="demo-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {status.kind === "error" && <FormError>{status.message}</FormError>}
          </>
        )}
      </Modal>
    </>
  );
}

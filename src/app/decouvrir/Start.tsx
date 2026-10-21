"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Commencer": a work e-mail, then the onboarding page (/commencer?email=) with it already filled in.
 * A plain GET form, checked here first so the message is ours, in French, rather than the browser's.
 */
export function Start({ id, tone = "light" }: { id: string; tone?: "light" | "on-blue" }) {
  const [error, setError] = useState("");

  function check(event: React.FormEvent<HTMLFormElement>) {
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const problem = !email ? "Indiquez votre e-mail professionnel." : emailPattern.test(email) ? "" : "Cette adresse e-mail n’est pas valide.";
    setError(problem);
    if (problem) event.preventDefault();
  }

  return (
    <div className="lp-start-wrap">
      <form action="/commencer" method="get" noValidate className={`lp-start is-${tone}`} aria-label="Créer un compte" onSubmit={check}>
        <label htmlFor={id} className="sr-only">
          E-mail professionnel
        </label>
        <Input
          id={id}
          name="email"
          type="email"
          maxLength={200}
          autoComplete="email"
          placeholder="Votre e-mail professionnel"
          className="lp-start-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={() => error && setError("")}
        />
        <Button type="submit" size="lg" className="lp-btn lp-start-button">
          Commencer <ArrowRight />
        </Button>
      </form>
      {error && (
        <p id={`${id}-error`} role="alert" className="lp-start-error">
          {error}
        </p>
      )}
    </div>
  );
}

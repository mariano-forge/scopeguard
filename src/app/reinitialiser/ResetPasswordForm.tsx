"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maxPasswordLength, minPasswordLength, passwordProblem, passwordRules } from "@/lib/passwordPolicy";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  // The password as typed, for the rules ticked under the field.
  const [typed, setTyped] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== form.get("confirmation")) return setError("Les deux mots de passe ne sont pas identiques.");
    setError("");
    setPending(true);
    const { error: failed } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (!failed) return setDone(true);
    setError(
      failed.status === 429
        ? "Trop de tentatives. Patientez quelques minutes."
        : failed.code === "PASSWORD_TOO_WEAK" && failed.message
          ? failed.message
          : failed.code === "PASSWORD_TOO_SHORT"
            ? `Le mot de passe doit contenir au moins ${minPasswordLength} caractères.`
            : "Ce lien n'est plus valable. Demandez-en un nouveau depuis la page de connexion.",
    );
  }

  if (!token || done)
    return (
      <div className="grid gap-4">
        <h1 className="font-heading text-lg font-bold">{done ? "Mot de passe modifié" : "Lien expiré"}</h1>
        <p className="text-sm text-[var(--graphite)]">
          {done
            ? "Votre mot de passe a été changé et vos autres sessions ont été fermées. Vous pouvez vous connecter."
            : "Ce lien de réinitialisation n'est plus valable (il expire au bout d'une heure). Demandez-en un nouveau."}
        </p>
        <Button asChild size="lg">
          <Link href="/connexion">Aller à la connexion</Link>
        </Button>
      </div>
    );

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <h1 className="font-heading text-lg font-bold">Nouveau mot de passe</h1>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={minPasswordLength}
          maxLength={maxPasswordLength}
          autoComplete="new-password"
          autoFocus
          aria-describedby="password-rules"
          onChange={(event) => setTyped(event.target.value)}
        />
        <ul id="password-rules" className="auth-rules">
          {passwordRules.map((rule) => (
            <li key={rule.id} data-met={rule.test(typed) ? "" : undefined}>
              {rule.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirmation">Confirmation</Label>
        <Input id="confirmation" name="confirmation" type="password" required maxLength={maxPasswordLength} autoComplete="new-password" />
      </div>
      {error && (
        <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        Enregistrer
      </Button>
    </form>
  );
}

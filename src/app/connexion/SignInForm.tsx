"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const minPasswordLength = 10;

/** Better Auth error codes, in French. Wrong e-mail and wrong password give the same message. */
function errorMessage(code: string | undefined, status?: number) {
  if (status === 429) return "Trop de tentatives. Patientez une minute avant de réessayer.";
  switch (code?.toLowerCase().replace(/\s+/g, "_")) {
    case "invalid_email_or_password":
      return "E-mail ou mot de passe incorrect.";
    case "user_already_exists":
    case "user_already_exists_use_another_email":
      return "Un compte existe déjà avec cet e-mail. Connectez-vous, ou utilisez « Mot de passe oublié ».";
    case "password_too_short":
      return `Le mot de passe doit contenir au moins ${minPasswordLength} caractères.`;
    case "password_too_long":
      return "Le mot de passe est trop long (128 caractères au plus).";
    case "invalid_email":
      return "Cette adresse e-mail n'est pas valide.";
    case "account_not_linked":
    case "unable_to_link_account":
      return "Un compte avec mot de passe existe déjà pour cet e-mail Google. Connectez-vous avec votre mot de passe.";
    case undefined:
    case "":
      return "";
    default:
      return "La connexion n'a pas abouti. Réessayez.";
  }
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function Field({ id, label, ...input }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...input} />
    </div>
  );
}

export function SignInForm({ next, googleEnabled, oauthError }: { next: string; googleEnabled: boolean; oauthError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "forgot">("sign-in");
  const [error, setError] = useState(errorMessage(oauthError));
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError("");
    setNotice("");
    setPending(true);

    if (mode === "forgot") {
      const { error: failed } = await authClient.requestPasswordReset({ email, redirectTo: "/reinitialiser" });
      setPending(false);
      if (failed?.status === 429) return setError(errorMessage(undefined, 429));
      // Same answer whether the account exists or not.
      setNotice(
        process.env.NODE_ENV === "development"
          ? "Si un compte existe pour cet e-mail, un lien de réinitialisation a été créé. En développement, il s'affiche dans la console du serveur."
          : "Si un compte existe pour cet e-mail, un lien de réinitialisation lui sera envoyé.",
      );
      return;
    }

    const { error: failed } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: String(form.get("name") ?? "").trim(), email, password })
        : await authClient.signIn.email({ email, password });
    if (failed) {
      setPending(false);
      setError(errorMessage(failed.code, failed.status));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setError("");
    setPending(true);
    const { error: failed } = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/connexion" });
    if (failed) {
      setPending(false);
      setError(errorMessage(failed.code, failed.status));
    }
  }

  const feedback = (
    <>
      {error && (
        <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-[var(--r-field)] bg-[var(--status-low-bg)] px-3 py-2 text-sm text-[var(--status-low-text)]">
          {notice}
        </p>
      )}
    </>
  );

  if (mode === "forgot")
    return (
      <form className="grid gap-4" onSubmit={submit}>
        <div>
          <h1 className="font-heading text-lg font-bold">Mot de passe oublié</h1>
          <p className="text-sm text-[var(--graphite)]">Indiquez l’e-mail de votre compte pour recevoir un lien de réinitialisation.</p>
        </div>
        <Field id="email" label="E-mail" type="email" autoComplete="email" autoFocus />
        {feedback}
        <Button type="submit" size="lg" disabled={pending}>
          Envoyer le lien
        </Button>
        <Button type="button" variant="link" onClick={() => (setMode("sign-in"), setNotice(""), setError(""))}>
          Retour à la connexion
        </Button>
      </form>
    );

  return (
    <div className="grid gap-4">
      <Tabs value={mode} onValueChange={(value) => (setMode(value as "sign-in" | "sign-up"), setError(""), setNotice(""))}>
        <TabsList className="w-full">
          <TabsTrigger value="sign-in">Se connecter</TabsTrigger>
          <TabsTrigger value="sign-up">Créer un compte</TabsTrigger>
        </TabsList>
        <TabsContent value={mode}>
          <form className="mt-4 grid gap-4" onSubmit={submit}>
            {mode === "sign-up" && <Field id="name" label="Nom complet" autoComplete="name" maxLength={100} />}
            <Field id="email" label="E-mail" type="email" autoComplete="email" />
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                {mode === "sign-in" && (
                  <button type="button" className="text-sm text-[var(--action-text)] underline-offset-2 hover:underline" onClick={() => (setMode("forgot"), setError(""))}>
                    Mot de passe oublié ?
                  </button>
                )}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={mode === "sign-up" ? minPasswordLength : undefined}
                maxLength={128}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              />
              {mode === "sign-up" && <p className="text-xs text-[var(--graphite)]">Au moins {minPasswordLength} caractères.</p>}
            </div>
            {feedback}
            <Button type="submit" size="lg" disabled={pending}>
              {mode === "sign-up" ? "Créer mon compte" : "Se connecter"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-[var(--graphite)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            ou
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => void signInWithGoogle()}>
            <GoogleIcon />
            Continuer avec Google
          </Button>
        </>
      )}
    </div>
  );
}

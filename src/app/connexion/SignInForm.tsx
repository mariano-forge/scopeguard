"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maxPasswordLength, minPasswordLength, passwordProblem, passwordRules } from "@/lib/passwordPolicy";

/** Seconds before « Renvoyer l'e-mail » can be pressed again. */
const resendSeconds = 30;

/** First name and last name, asked apart, kept as one name (as the account stores it). */
const fullName = (form: FormData) => [form.get("given-name"), form.get("family-name")].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");

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
      return `Le mot de passe est trop long (${maxPasswordLength} caractères au plus).`;
    case "invalid_email":
      return "Cette adresse e-mail n'est pas valide.";
    case "email_not_verified":
      return "Confirmez d’abord votre adresse : nous venons de vous renvoyer le lien de confirmation par e-mail.";
    case "invalid_token":
    case "token_expired":
      return "Ce lien de confirmation n’est plus valable. Connectez-vous : un nouveau lien vous sera envoyé.";
    case "account_not_linked":
    case "unable_to_link_account":
      return "Un compte avec mot de passe existe déjà pour cet e-mail. Connectez-vous avec votre mot de passe.";
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

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}

/** The sign-in providers this server offers (src/lib/auth.ts, socialSignIns), with their label and mark. */
const providerButtons = {
  google: { label: "Continuer avec Google", Icon: GoogleIcon },
  microsoft: { label: "Continuer avec Microsoft", Icon: MicrosoftIcon },
} as const;

function Field({ id, label, ...input }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...input} />
    </div>
  );
}

export function SignInForm({
  next,
  providers,
  oauthError,
  invitation,
  email: startEmail,
  onboarding = false,
}: {
  next: string;
  /** Google, Microsoft: those whose keys are set on the server. */
  providers: readonly ("google" | "microsoft")[];
  oauthError?: string;
  /** Opened from an agency invitation: the agency, and the invited address masked (never whole). */
  invitation?: { maskedEmail: string; organizationName: string };
  /** The address typed on the landing page, already filled in. */
  email?: string;
  /** The onboarding page (/commencer): account creation first, with its steps shown. */
  onboarding?: boolean;
}) {
  const router = useRouter();
  // Sign-in or account creation is read from the address (?compte=nouveau | existant), so every link
  // that changes it (the header's « Essayer gratuitement », the landing page) switches the form.
  const compte = useSearchParams().get("compte");
  const [forgot, setForgot] = useState(false);
  const fallback = invitation || onboarding ? "sign-up" : "sign-in";
  const mode = forgot ? "forgot" : compte === "nouveau" ? "sign-up" : compte === "existant" ? "sign-in" : fallback;
  const [error, setError] = useState(errorMessage(oauthError));
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  // The new password as typed, for the rules ticked under the field (account creation only).
  const [newPassword, setNewPassword] = useState("");
  // Account created: the address the confirmation link went to, and the wait before sending it again.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // A deadline, not a count of ticks: a background tab slows its timers, the deadline stays true.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const startWait = () => {
    const sent = Date.now();
    setNow(sent);
    setResendAt(sent + resendSeconds * 1000);
  };
  const [resent, setResent] = useState("");

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

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

    // A new password: the rule (the server applies it too), then the confirmation.
    if (mode === "sign-up") {
      const problem = passwordProblem(password, { email, name: fullName(form) });
      if (problem || password !== String(form.get("confirmation") ?? "")) {
        setPending(false);
        setError(problem ?? "Les deux mots de passe ne correspondent pas.");
        return;
      }
    }

    // The confirmation link brings the person back here (an invitation, the page they asked for).
    const { data, error: failed } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name: fullName(form), email, password, callbackURL: next })
        : await authClient.signIn.email({ email, password, callbackURL: next });
    if (failed) {
      setPending(false);
      setError(failed.code === "PASSWORD_TOO_WEAK" && failed.message ? failed.message : errorMessage(failed.code, failed.status));
      return;
    }
    // Sign-up opens no session until the address is confirmed (and says nothing about existing accounts).
    if (!data?.token) {
      setPending(false);
      setSentTo(email);
      startWait();
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function signInWith(provider: "google" | "microsoft") {
    setError("");
    setPending(true);
    const { error: failed } = await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: "/connexion" });
    if (failed) {
      setPending(false);
      setError(errorMessage(failed.code, failed.status));
    }
  }

  async function resend() {
    if (!sentTo) return;
    setPending(true);
    setResent("");
    // The same answer whether the account exists or not (Better Auth); only too many tries are said.
    const { error: failed } = await authClient.sendVerificationEmail({ email: sentTo, callbackURL: next });
    setPending(false);
    setResent(failed?.status === 429 ? "Trop de tentatives. Patientez quelques minutes." : "E-mail renvoyé.");
    startWait();
  }

  // Account created: a screen of its own, the address, a way to send the link again or fix the address.
  if (sentTo)
    return (
      <div className="auth-sent">
        <span className="auth-sent-icon">
          <MailCheck />
        </span>
        <header>
          <h1>Vérifiez vos e-mails</h1>
          <p role="status">
            Nous avons envoyé un lien de confirmation à <b>{sentTo}</b>. Il est valable 24&nbsp;heures.
          </p>
        </header>
        <Button type="button" variant="outline" size="lg" className="h-11 w-full" disabled={pending || wait > 0} onClick={() => void resend()}>
          {wait > 0 ? `Renvoyer l’e-mail dans ${wait} s` : "Renvoyer l’e-mail"}
        </Button>
        <p className="auth-sent-note" aria-live="polite">
          {resent || "Pensez à regarder dans vos indésirables."}
        </p>
        <p className="auth-switch">
          Mauvaise adresse&nbsp;?
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => (setSentTo(null), setResent(""))}>
            Modifier l’adresse
          </Button>
        </p>
      </div>
    );

  const switchMode = (to: "sign-in" | "sign-up" | "forgot") => {
    setForgot(to === "forgot");
    setError("");
    setNotice("");
    if (to === "forgot") return;
    // The address carries the mode (the rest of it, ?suite=, is kept); Next.js follows replaceState.
    const params = new URLSearchParams(window.location.search);
    if (to === fallback) params.delete("compte");
    else params.set("compte", to === "sign-up" ? "nouveau" : "existant");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  };

  const feedback = (
    <>
      {error && (
        <p role="alert" className="rounded-lg bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-[var(--status-low-bg)] px-3 py-2 text-sm text-[var(--status-low-text)]">
          {notice}
        </p>
      )}
    </>
  );

  if (mode === "forgot")
    return (
      <form className="grid gap-4" onSubmit={submit}>
        <header>
          <h1>Mot de passe oublié</h1>
          <p>Indiquez l’e-mail de votre compte&nbsp;: nous vous envoyons un lien.</p>
        </header>
        <Field id="email" label="E-mail" type="email" autoComplete="email" autoFocus className="h-11" />
        {feedback}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          Envoyer le lien
        </Button>
        <Button type="button" variant="link" onClick={() => switchMode("sign-in")}>
          Retour à la connexion
        </Button>
      </form>
    );

  const signUp = mode === "sign-up";
  return (
    <div className="grid gap-4">
      <header>
        <h1>{signUp ? "Créer votre compte" : "Se connecter à Kora"}</h1>
        {signUp && <p>{onboarding ? "Votre compte d’abord, votre agence juste après." : "Votre compte d’abord, votre agence ensuite."}</p>}
      </header>
      {invitation && (
        <p className="rounded-lg bg-[var(--status-low-bg)] px-3 py-2 text-sm text-[var(--status-low-text)]">
          Rejoignez <b>{invitation.organizationName}</b> : créez votre compte ou connectez-vous avec l’adresse invitée, <b>{invitation.maskedEmail}</b>.
        </p>
      )}

      {providers.length > 0 && (
        <>
          {providers.map((provider) => {
            const { label, Icon } = providerButtons[provider];
            return (
              <Button key={provider} type="button" variant="outline" size="lg" className="h-11 w-full" disabled={pending} onClick={() => void signInWith(provider)}>
                <Icon />
                {label}
              </Button>
            );
          })}
          <div className="auth-or">ou</div>
        </>
      )}

      <form className="grid gap-4" onSubmit={submit}>
        {signUp && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="given-name" label="Prénom" autoComplete="given-name" maxLength={60} autoFocus={onboarding && Boolean(startEmail)} className="h-11" />
            <Field id="family-name" label="Nom" autoComplete="family-name" maxLength={60} className="h-11" />
          </div>
        )}
        <Field id="email" label="E-mail" type="email" autoComplete="email" defaultValue={startEmail} className="h-11" />
        {signUp ? (
          // The password and its confirmation side by side, the rules under both: one row, not two.
          <div className="grid gap-1.5">
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="password"
                label="Mot de passe"
                type="password"
                autoComplete="new-password"
                minLength={minPasswordLength}
                maxLength={maxPasswordLength}
                aria-describedby="password-rules"
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-11"
              />
              <Field id="confirmation" label="Confirmation" type="password" autoComplete="new-password" maxLength={maxPasswordLength} className="h-11" />
            </div>
            <ul id="password-rules" className="auth-rules">
              {passwordRules.map((rule) => (
                <li key={rule.id} data-met={rule.test(newPassword) ? "" : undefined}>
                  {rule.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Mot de passe</Label>
              <Button type="button" variant="link" className="auth-forgot h-auto p-0" onClick={() => switchMode("forgot")}>
                Mot de passe oublié ?
              </Button>
            </div>
            <Input id="password" name="password" type="password" required className="h-11" maxLength={maxPasswordLength} autoComplete="current-password" />
          </div>
        )}
        {feedback}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {signUp ? "Créer mon compte" : "Se connecter"}
        </Button>
      </form>

      <p className="auth-switch">
        {signUp ? "Déjà un compte ?" : "Pas encore de compte ?"}
        <Button type="button" variant="link" className="h-auto p-0" onClick={() => switchMode(signUp ? "sign-in" : "sign-up")}>
          {signUp ? "Se connecter" : "Créer un compte"}
        </Button>
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Step = "email" | "code" | "request" | "requested";

/**
 * Shown before the review when this device has no verified address for the link: the client
 * receives a 6-digit code by e-mail (pre-filled from a personal invitation), or asks the agency for
 * access. See src/db/reviewAuth.ts.
 */
export function AccessGate({
  token,
  deliverable,
  invitedEmail,
  verifiedEmail,
  onVerified,
}: {
  token: string;
  deliverable: string;
  /** From the personal invitation address. */
  invitedEmail: string | null;
  /** Verified on this device, but not invited to this link. */
  verifiedEmail: string | null;
  onVerified: () => void;
}) {
  const [step, setStep] = useState<Step>(verifiedEmail ? "request" : "email");
  const [email, setEmail] = useState(verifiedEmail ?? invitedEmail ?? "");
  const [editingEmail, setEditingEmail] = useState(!invitedEmail);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const api = `/api/review/${encodeURIComponent(token)}/access`;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function post(path: string, body: Record<string, string>) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 404) setError("Ce lien n'est plus valable.");
      else if (!response.ok) setError(result.error ?? "Une erreur est survenue. Réessayez.");
      return response.ok;
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (await post("/code", { email })) {
      setStep("code");
      setCode("");
      setResendIn(60);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (await post("/verify", { email, code })) onVerified();
  }

  async function requestAccess(event: React.FormEvent) {
    event.preventDefault();
    if (await post("/request", { email, message })) setStep("requested");
  }

  const errorBox = error && (
    <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
      {error}
    </p>
  );
  const heading = (title: string, text: React.ReactNode) => (
    <div className="grid gap-1">
      <p className="text-xs font-semibold tracking-wide text-[var(--graphite)] uppercase">Revue · {deliverable || "livrable"}</p>
      <h1 className="font-heading text-lg font-bold">{title}</h1>
      <p className="text-sm text-[var(--graphite)]">{text}</p>
    </div>
  );

  return (
    <AuthShell>
      {step === "email" && (
        <form className="grid gap-4" onSubmit={sendCode}>
          {heading("Confirmez votre adresse", "Pour protéger cette revue, nous envoyons un code à usage unique à votre adresse e-mail.")}
          {editingEmail ? (
            <div className="grid gap-1.5">
              <Label htmlFor="access-email">Votre e-mail</Label>
              <Input id="access-email" type="email" required autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-[var(--r-field)] border border-[var(--border)] px-3 py-2 text-sm">
              <span className="truncate font-medium">{email}</span>
              <button type="button" className="shrink-0 text-[var(--action-text)] underline-offset-2 hover:underline" onClick={() => setEditingEmail(true)}>
                Ce n’est pas moi
              </button>
            </div>
          )}
          {errorBox}
          <Button type="submit" size="lg" disabled={pending || !email.trim()}>
            Recevoir un code
          </Button>
        </form>
      )}

      {step === "code" && (
        <form className="grid gap-4" onSubmit={verify}>
          {heading(
            "Saisissez votre code",
            <>
              Si <b>{email}</b> a accès à cette revue, un code à 6 chiffres vient d’y être envoyé. Il est valable 10 minutes.
            </>,
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="access-code">Code</Label>
            <Input
              id="access-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="text-center font-mono text-lg tracking-[0.5em]"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
          </div>
          {errorBox}
          <Button type="submit" size="lg" disabled={pending || code.length !== 6}>
            Accéder à la revue
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" className="text-[var(--action-text)] underline-offset-2 hover:underline disabled:text-[var(--graphite)] disabled:no-underline" disabled={resendIn > 0 || pending} onClick={() => void sendCode()}>
              {resendIn > 0 ? `Renvoyer le code (${resendIn} s)` : "Renvoyer le code"}
            </button>
            <button type="button" className="text-[var(--action-text)] underline-offset-2 hover:underline" onClick={() => (setStep("email"), setEditingEmail(true), setError(""))}>
              Changer d’adresse
            </button>
          </div>
          <p className="border-t border-[var(--border)] pt-3 text-sm text-[var(--graphite)]">
            Pas de code ? Votre adresse n’est peut-être pas invitée.{" "}
            <button type="button" className="text-[var(--action-text)] underline-offset-2 hover:underline" onClick={() => (setStep("request"), setError(""))}>
              Demander l’accès à l’agence
            </button>
          </p>
        </form>
      )}

      {step === "request" && (
        <form className="grid gap-4" onSubmit={requestAccess}>
          {heading(
            "Demander l’accès",
            verifiedEmail ? (
              <>
                Votre adresse <b>{verifiedEmail}</b> n’a pas accès à cette revue. L’agence peut vous l’ouvrir.
              </>
            ) : (
              "L’agence recevra votre demande et pourra vous inviter. Vous recevrez alors un lien par e-mail."
            ),
          )}
          {!verifiedEmail && (
            <div className="grid gap-1.5">
              <Label htmlFor="request-email">Votre e-mail</Label>
              <Input id="request-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="request-message">Message (facultatif)</Label>
            <Textarea id="request-message" maxLength={500} placeholder="Ex. : je remplace Claire pendant ses congés." value={message} onChange={(event) => setMessage(event.target.value)} />
          </div>
          {errorBox}
          <Button type="submit" size="lg" disabled={pending || !email.trim()}>
            Envoyer la demande
          </Button>
          {!verifiedEmail && (
            <Button type="button" variant="link" onClick={() => (setStep("email"), setError(""))}>
              J’ai été invité : recevoir un code
            </Button>
          )}
        </form>
      )}

      {step === "requested" && (
        <div className="grid gap-4" role="status">
          {heading("Demande envoyée", "L’agence a été prévenue. Si elle accepte, vous recevrez un e-mail avec votre lien d’accès.")}
        </div>
      )}
    </AuthShell>
  );
}

/**
 * After a client's first verification: their full name, shown on what they write instead of their
 * address. Asked once per address (review_profiles).
 */
export function ProfileGate({ token, deliverable, email, onSaved }: { token: string; deliverable: string; email: string; onSaved: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch(`/api/review/${encodeURIComponent(token)}/access/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { name?: string; error?: string } | null;
    setPending(false);
    if (response?.ok && result?.name) onSaved(result.name);
    else setError(result?.error ?? "Enregistrement impossible. Réessayez.");
  }

  return (
    <AuthShell>
      <form className="grid gap-4" onSubmit={save}>
        <div className="grid gap-1">
          <p className="text-xs font-semibold tracking-wide text-[var(--graphite)] uppercase">Revue · {deliverable || "livrable"}</p>
          <h1 className="font-heading text-lg font-bold">Comment vous appelez-vous ?</h1>
          <p className="text-sm text-[var(--graphite)]">
            Votre nom accompagnera vos retours et vos validations. Votre adresse <b>{email}</b> est vérifiée.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profile-name">Nom complet</Label>
          <Input id="profile-name" required minLength={2} maxLength={80} autoComplete="name" autoFocus placeholder="Claire Martin" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {error && (
          <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-high-bg)] px-3 py-2 text-sm text-[var(--status-high-text)]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending || name.trim().length < 2}>
          Accéder à la revue
        </Button>
      </form>
    </AuthShell>
  );
}

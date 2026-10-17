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
  invitation,
  verifiedEmail,
  site = false,
  onVerified,
}: {
  token: string;
  deliverable: string;
  /** A personal link: the invited address, masked, and the invitation that asks the code for it. */
  invitation: { id: string | null; masked: string } | null;
  /** Verified on this device, but not invited to this link. */
  verifiedEmail: string | null;
  /** In Kora's panel on the agency's staging site: the session is opened for that site (src/db/reviewAuth.ts). */
  site?: boolean;
  onVerified: () => void;
}) {
  const [step, setStep] = useState<Step>(verifiedEmail ? "request" : "email");
  const [email, setEmail] = useState(verifiedEmail ?? "");
  // A personal link asks the code by its invitation: the page only ever shows the address masked.
  const [byInvitation, setByInvitation] = useState(Boolean(invitation?.id));
  const shownEmail = byInvitation ? (invitation?.masked ?? "") : email;
  /** Who the code is for: the invitation, or the address typed. */
  const target = (): Record<string, string> => (byInvitation && invitation?.id ? { invitation: invitation.id } : { email });
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

  async function post(path: string, body: Record<string, string | boolean>) {
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
    if (await post("/code", target())) {
      setStep("code");
      setCode("");
      setResendIn(60);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (await post("/verify", { ...target(), code, ...(site ? { site } : {}) })) onVerified();
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
          {!byInvitation ? (
            <div className="grid gap-1.5">
              <Label htmlFor="access-email">Votre e-mail</Label>
              <Input id="access-email" type="email" required autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-[var(--r-field)] border border-[var(--border)] px-3 py-2 text-sm">
              <span className="truncate font-medium">{shownEmail}</span>
              <button type="button" className="shrink-0 text-[var(--action-text)] underline-offset-2 hover:underline" onClick={() => setByInvitation(false)}>
                Ce n’est pas moi
              </button>
            </div>
          )}
          {errorBox}
          <Button type="submit" size="lg" disabled={pending || !shownEmail.trim()}>
            Recevoir un code
          </Button>
        </form>
      )}

      {step === "code" && (
        <form className="grid gap-4" onSubmit={verify}>
          {heading(
            "Saisissez votre code",
            <>
              Si <b>{shownEmail}</b> est invitée sur cette revue, un code à 6 chiffres vient d’y être envoyé. Il est valable 10 minutes.
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
            <button type="button" className="text-[var(--action-text)] underline-offset-2 hover:underline" onClick={() => (setStep("email"), setByInvitation(false), setError(""))}>
              Changer d’adresse
            </button>
          </div>
          {/* A code only reaches invited addresses: someone given the link by a colleague asks the agency. */}
          <div className="grid gap-2 border-t border-[var(--border)] pt-4 text-sm text-[var(--graphite)]">
            <p>
              <b className="text-[var(--ink)]">Pas de code ?</b> Il n’est envoyé qu’aux adresses invitées par l’agence. Si ce lien vous a été transmis par quelqu’un d’autre, demandez l’accès.
            </p>
            <Button type="button" variant="outline" onClick={() => (setStep("request"), setError(""))}>
              Demander l’accès à l’agence
            </Button>
          </div>
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
          {heading("Demande envoyée", "L’agence a été prévenue par e-mail. Si elle accepte, vous recevrez votre lien personnel à cette adresse.")}
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

"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GateAccount, GateError, GateHeading } from "@/components/GatePieces";
import { CodeField } from "@/components/CodeField";
import { ArrowLeft, PenLine, RotateCw } from "lucide-react";

type Step = "email" | "code" | "denied";

/**
 * Shown before the review when this device has no verified address for the link: the client
 * receives a 6-digit code by e-mail (pre-filled from a personal invitation). Only invited addresses get
 * one; any other is told it has no access, without a form to ask for it (21 October 2026). See
 * src/db/reviewAuth.ts.
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
  const [step, setStep] = useState<Step>(verifiedEmail ? "denied" : "email");
  const [email, setEmail] = useState(verifiedEmail ?? "");
  // A personal link asks the code by its invitation: the page only ever shows the address masked.
  const [byInvitation, setByInvitation] = useState(Boolean(invitation?.id));
  const shownEmail = byInvitation ? (invitation?.masked ?? "") : email;
  /** Who the code is for: the invitation, or the address typed. */
  const target = (): Record<string, string> => (byInvitation && invitation?.id ? { invitation: invitation.id } : { email });
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const api = `/api/review/${encodeURIComponent(token)}/access`;

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function post(path: string, body: Record<string, string | boolean>): Promise<false | Record<string, unknown>> {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${api}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (response.status === 404) setError("Ce lien n'est plus valable.");
      else if (!response.ok) setError(result.error ?? "Une erreur est survenue. Réessayez.");
      return response.ok ? result : false;
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    const sent = await post("/code", target());
    if (sent && sent.invited === false) setStep("denied");
    else if (sent) {
      setStep("code");
      setCode("");
      setResendIn(60);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (await post("/verify", { ...target(), code, ...(site ? { site } : {}) })) onVerified();
  }

  /** Back to the address field, empty: the code goes to the address typed next. */
  function changeAddress() {
    setStep("email");
    setByInvitation(false);
    setEmail("");
    setError("");
  }

  const errorBox = error && <GateError>{error}</GateError>;

  return (
    <AuthShell plain showcase>
      {step === "email" && (
        <form className="gate-form" onSubmit={sendCode}>
          <GateHeading deliverable={deliverable} title="Accédez à la revue">
            Pour commenter ce livrable, confirmez qu’il s’agit bien de vous : vous allez recevoir un code à usage unique par e-mail.
          </GateHeading>
          {!byInvitation ? (
            <div className="grid gap-1.5">
              <Label htmlFor="access-email">Votre e-mail</Label>
              <Input id="access-email" type="email" required autoComplete="email" autoFocus placeholder="vous@entreprise.fr" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          ) : (
            <GateAccount
              email={shownEmail}
              action={
                <Button type="button" variant="link" className="gate-link" onClick={() => setByInvitation(false)}>
                  Ce n’est pas moi
                </Button>
              }
            />
          )}
          {errorBox}
          <Button type="submit" size="lg" className="w-full" disabled={pending || !shownEmail.trim()}>
            Recevoir un code
          </Button>
        </form>
      )}

      {step === "code" && (
        <form className="gate-form" onSubmit={verify}>
          <GateHeading deliverable={deliverable} title="Vérifiez vos e-mails">
            Un code à 6 chiffres vient d’être envoyé à <b>{shownEmail}</b>. Il est valable 10 minutes.
          </GateHeading>
          <div className="grid gap-1.5">
            <Label htmlFor="access-code">Code à 6 chiffres</Label>
            <CodeField id="access-code" value={code} onChange={setCode} />
          </div>
          {errorBox}
          <Button type="submit" size="lg" className="w-full" disabled={pending || code.length !== 6}>
            Accéder à la revue
          </Button>
          {/* Nothing came: send it again (once a minute), or type another address. */}
          <div className="gate-retry">
            <p>Rien reçu ?</p>
            <div className="gate-retry-actions">
              <Button type="button" variant="outline" size="sm" disabled={resendIn > 0 || pending} onClick={() => void sendCode()}>
                <RotateCw aria-hidden="true" /> {resendIn > 0 ? `Renvoyer le code (${resendIn} s)` : "Renvoyer le code"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={changeAddress}>
                <PenLine aria-hidden="true" /> Changer d’adresse
              </Button>
            </div>
          </div>
        </form>
      )}

      {step === "denied" && (
        <div className="gate-form" role="status">
          {/* The address that has no access, as entered (or verified on this device), in the title: the person sees which. */}
          <GateHeading
            deliverable={deliverable}
            title={
              <>
                <span className="gate-email">{shownEmail || verifiedEmail}</span> n’est pas invitée sur cette revue
              </>
            }
          >
            Rapprochez-vous de l’administrateur pour être invité, ou utilisez l’adresse à laquelle vous avez reçu l’invitation.
          </GateHeading>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={changeAddress}>
            <ArrowLeft aria-hidden="true" /> Modifier l’adresse
          </Button>
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
    <AuthShell plain showcase>
      <form className="gate-form" onSubmit={save}>
        <GateHeading deliverable={deliverable} title="Comment vous appelez-vous ?">
          Votre nom accompagnera vos retours et vos validations, à la place de votre adresse.
        </GateHeading>
        <GateAccount email={email} verified />
        <div className="grid gap-1.5">
          <Label htmlFor="profile-name">Nom complet</Label>
          <Input id="profile-name" required minLength={2} maxLength={80} autoComplete="name" autoFocus placeholder="Claire Martin" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {error && (
          <GateError>{error}</GateError>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending || name.trim().length < 2}>
          Accéder à la revue
        </Button>
      </form>
    </AuthShell>
  );
}

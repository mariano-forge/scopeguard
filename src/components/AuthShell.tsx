import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { ClientShowcase } from "@/components/ClientShowcase";
import { FilmLoop } from "@/app/decouvrir/Film";
import "./auth.css";

/** Why Kora, then its four gestures played one after the other (the landing page's scenes). */
function Shot() {
  return (
    <div className="auth-shot">
      <p className="auth-shot-title">
        Gardez le scope de vos projets <span>sous contrôle.</span>
      </p>
      <p className="auth-shot-text">Repérez chaque demande hors devis et faites-la valider en un clic.</p>
      <FilmLoop />
    </div>
  );
}

/**
 * The frame of every page where someone identifies themselves. For the agency (sign-in, new agency,
 * invitation, new password): the form on the left, Kora's four gestures playing on the right, under the site's
 * header when one is given (`nav`, the sign-in page). `plain` (the client's pages: access check, name,
 * unavailable link, the site panel's windows): Kora's bar and one card (src/components/GatePieces.tsx).
 */
export function AuthShell({
  children,
  plain = false,
  nav,
  showcase = false,
}: {
  children: React.ReactNode;
  plain?: boolean;
  nav?: React.ReactNode;
  /** Plain only: the client's welcome, what the review is for beside the card on a wide screen. */
  showcase?: boolean;
}) {
  const logo = (
    <Link href="/" className="auth-logo" aria-label="Kora, accueil">
      <KoraMark />
      <span>Kora</span>
    </Link>
  );
  // The client's pages: Kora's bar, then one card in the middle of the screen (the whole width on a phone
  // or in the staging site's panel).
  if (plain)
    return (
      <div className="auth-plain">
        <header className="auth-plain-bar">
          {logo}
          <span className="auth-plain-secure">
            <LockKeyhole aria-hidden="true" /> Accès sécurisé
          </span>
        </header>
        <main className={`auth-plain-body${showcase ? " has-showcase" : ""}`}>
          <div className="auth-card">{children}</div>
          {showcase && <ClientShowcase />}
        </main>
      </div>
    );

  const split = (
    <main className="auth is-split">
      <div className="auth-form">
        <div className="auth-column">
          {!nav && <div className="auth-form-logo">{logo}</div>}
          {children}
        </div>
      </div>
      <Shot />
    </main>
  );
  if (!nav) return split;
  return (
    <div className="auth-page">
      {nav}
      {split}
    </div>
  );
}

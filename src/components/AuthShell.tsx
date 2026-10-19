import Link from "next/link";
import { KoraMark } from "@/components/KoraMark";
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
 * header when one is given (`nav`, the sign-in page). `plain` (the client's access check, the site
 * panel's window): the form alone, centred. Fits the screen: nothing to scroll.
 */
export function AuthShell({ children, plain = false, nav }: { children: React.ReactNode; plain?: boolean; nav?: React.ReactNode }) {
  const logo = (
    <Link href="/" className="auth-logo" aria-label="Kora, accueil">
      <KoraMark />
      <span>Kora</span>
    </Link>
  );
  if (plain)
    return (
      <main className="auth">
        <div className="auth-column">
          {logo}
          {children}
        </div>
      </main>
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

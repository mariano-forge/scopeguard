import Link from "next/link";
import { KoraMark } from "@/components/KoraMark";
import "./auth.css";

/**
 * The frame of every page where someone identifies themselves (agency sign-in, new agency, invitation,
 * new password, client access check): the brand and the promise on one side, the form on the other.
 * On a phone, only the form and a small brand line.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <aside className="auth-brand">
        <Link href="/" className="auth-logo" aria-label="Kora, accueil">
          <KoraMark className="size-7" />
          <span>Kora</span>
        </Link>
        <div className="auth-brand-body">
          <p className="auth-promise">Chaque retour client devient une décision.</p>
          <ol className="auth-flow" aria-hidden="true">
            <li>
              <span className="auth-flow-dot" />
              Un commentaire, à l’endroit exact
            </li>
            <li>
              <span className="auth-flow-chip is-scope">Hors scope · 850 € HT</span>
            </li>
            <li>
              <span className="auth-flow-chip is-ok">Acceptée par le client</span>
            </li>
          </ol>
        </div>
        <p className="auth-brand-foot">La revue client qui protège votre marge.</p>
      </aside>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <KoraMark className="size-6" />
          <span>Kora</span>
        </div>
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}

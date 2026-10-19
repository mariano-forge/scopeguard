"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KoraMark } from "@/components/KoraMark";
import { Button } from "@/components/ui/button";
import "./site.css";

const sections = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#promesse", label: "Pourquoi Kora" },
  { href: "/#client", label: "Pour vos clients" },
  { href: "/#questions", label: "Questions" },
];

/**
 * The public site's header (landing, demo): transparent at the top, a bar once the page scrolls.
 * Kora's mark turns with the scroll: a CSS variable on the page, nothing re-renders.
 */
export function SiteNav({ signIn = true }: { /** « Se connecter »: not on the sign-in page itself. */ signIn?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 8);
      document.documentElement.style.setProperty("--spin", `${Math.round(window.scrollY * 0.3)}deg`);
    };
    // First reading on the next frame (a page reloaded halfway down), then on every scroll.
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--spin");
    };
  }, []);

  return (
    <header className="lp-nav" data-scrolled={scrolled ? "" : undefined}>
      <div className="lp-nav-inner">
        <Link href="/" className="lp-brand" aria-label="Kora, accueil">
          <KoraMark className="lp-brand-mark" />
          <span>Kora</span>
        </Link>
        <nav aria-label="Sections" className="lp-nav-links">
          {sections.map((section) => (
            <Link key={section.href} href={section.href}>
              {section.label}
            </Link>
          ))}
        </nav>
        <div className="lp-nav-actions">
          {signIn && (
            <Link href="/connexion" className="lp-nav-login">
              Se connecter
            </Link>
          )}
          <Button asChild size="lg" variant="outline" className="lp-nav-button lp-nav-demo">
            <Link href="/demo">Réserver une démo</Link>
          </Button>
          <Button asChild size="lg" className="lp-nav-button">
            <Link href="/commencer">Essayer Kora</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <Link href="/" className="lp-brand" aria-label="Kora, accueil">
            <KoraMark className="lp-brand-mark" />
            <span>Kora</span>
          </Link>
          <p>Livrables, retours et devis au même endroit, pour l’agence et pour son client.</p>
        </div>
        <nav aria-label="Produit">
          <b>Produit</b>
          {sections.map((section) => (
            <Link key={section.href} href={section.href}>
              {section.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Compte">
          <b>Compte</b>
          <Link href="/connexion">Se connecter</Link>
          <Link href="/commencer">Créer un compte</Link>
          <Link href="/demo">Réserver une démo</Link>
        </nav>
      </div>
      <p className="lp-footer-legal">© Kora</p>
    </footer>
  );
}

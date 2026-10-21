// The landing page's illustrations: Kora's own interface, redrawn small (the real pieces: a review page,
// a pin, the qualification, the quote, the client's answer, the journal). Pure markup, styled in
// landing.css (lp-mk-*); decorative, so hidden from assistive technology by their containers.

import { BadgeEuro, Clock, FileText, Lock } from "lucide-react";

/** A browser-like frame around a deliverable. */
export function Frame({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`lp-mk-frame ${className}`}>
      <div className="lp-mk-bar">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      <div className="lp-mk-body">{children}</div>
    </div>
  );
}

/** A mock web page: the deliverable the client reviews. */
export function Page({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lp-mk-page ${compact ? "is-compact" : ""}`}>
      <div className="lp-mk-nav">
        <b>northstar.</b>
        <span>Boutique</span>
        <span>Journal</span>
        <span>Contact</span>
      </div>
      <div className="lp-mk-hero">
        <div>
          <small>Collection automne</small>
          <strong>Des plantes qui durent.</strong>
          <p>Livrées en 48 h, garanties un an.</p>
          <em>Découvrir</em>
        </div>
        <div className="lp-mk-art">
          <Plant />
        </div>
      </div>
      {!compact && (
        <div className="lp-mk-row">
          <span className="is-a" />
          <span className="is-b" />
          <span className="is-c" />
        </div>
      )}
    </div>
  );
}

/** The deliverable's hero picture: a potted plant, drawn in a few shapes. */
export function Plant() {
  return (
    <svg viewBox="0 0 120 120" className="lp-mk-plant">
      <circle cx="60" cy="58" r="44" className="is-sun" />
      <path d="M60 86 C 58 64, 40 52, 26 50 C 30 66, 42 78, 60 86 Z" className="is-leaf" />
      <path d="M60 86 C 62 60, 78 44, 96 42 C 92 62, 80 78, 60 86 Z" className="is-leaf is-dark" />
      <path d="M60 86 C 56 62, 58 40, 64 26 C 72 44, 70 68, 60 86 Z" className="is-leaf" />
      <path d="M42 84 H 78 L 72 108 H 48 Z" className="is-pot" />
    </svg>
  );
}

export function Pin({ initials = "CM", className = "" }: { initials?: string; className?: string }) {
  return <span className={`lp-mk-pin ${className}`}>{initials}</span>;
}

/** Feature cards: one piece of the interface each. */
export function CardVisual({ kind }: { kind: "precise" | "scope" | "quote" | "proof" }) {
  if (kind === "precise")
    return (
      <Frame title="Accueil · V03" className="lp-mk-tilt">
        <Page compact />
        <Pin className="lp-mk-card-pin is-a" />
        <Pin initials="JD" className="lp-mk-card-pin is-b" />
        <Pin initials="CM" className="lp-mk-card-pin is-c" />
      </Frame>
    );
  if (kind === "scope")
    return (
      <div className="lp-mk-list">
        {[
          ["Agrandir le logo", "Inclus", ""],
          ["Section témoignages", "Hors scope", "is-out"],
          ["Corriger une coquille", "Inclus", ""],
          ["Page carrières", "Hors scope", "is-out"],
        ].map(([title, label, tone]) => (
          <span key={title}>
            <FileText />
            {title}
            <em className={tone}>{label}</em>
          </span>
        ))}
      </div>
    );
  if (kind === "quote")
    return (
      <div className="lp-mk-card lp-mk-bigquote">
        <small>
          <BadgeEuro /> Section témoignages
        </small>
        <b>850&nbsp;€</b>
        <span>HT · + 3 jours</span>
        <em>
          <Clock /> En attente du client
        </em>
      </div>
    );
  return (
    <ol className="lp-mk-journal is-large">
      <li>
        <time>14 oct.</time> Demande ajoutée par Claire
      </li>
      <li>
        <time>14 oct.</time> Qualifiée hors scope
      </li>
      <li>
        <time>15 oct.</time> Devis accepté
      </li>
      <li className="is-on">
        <time>16 oct.</time>
        <Lock /> V03 validée
      </li>
    </ol>
  );
}

/** The client's side: the review, with its one decision. */
export function ClientVisual() {
  return (
    <Frame title="Revue · Accueil · V03" className="lp-mk-client-frame">
      <Page compact />
      <div className="lp-mk-client-bar">
        <span>
          <BadgeEuro /> 850&nbsp;€ HT · + 3 jours
        </span>
        <em>Accepter</em>
      </div>
    </Frame>
  );
}


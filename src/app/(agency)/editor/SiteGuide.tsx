// The guide of a « Lien »'s board (SiteBoard.tsx): what the Kora toolbar does, and the steps to review the
// staging site with it. The agency's steps carry the values to copy (SiteToolbarSnippet.tsx); the client's
// only say where to click.

import { useSyncExternalStore } from "react";
import { Hand, MessageCirclePlus, MousePointer2 } from "lucide-react";

/** `lead`: a choice that shapes the step, read right after its title (the site's tool, SiteInstall.tsx). */
export type GuideStep = { title: string; lead?: React.ReactNode; text: React.ReactNode; children?: React.ReactNode };

const noChange = () => () => undefined;
/** Kora served from this computer (development): a public site that loads its toolbar from here makes the browser ask first. */
const koraIsLocal = () => ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);

/**
 * When Kora runs on this computer, the staging site (public) reaches it on the local network: the
 * browser may ask first (Chrome and Edge do, in their own words; others may not). Said in the steps
 * that open the toolbar; never with Kora online, which no browser asks about. Null otherwise.
 */
export function useLocalAccessNote() {
  const local = useSyncExternalStore(noChange, koraIsLocal, () => false);
  return local
    ? "Kora tourne ici sur cet ordinateur : votre navigateur peut demander l’autorisation d’accéder au réseau local. Acceptez-la pour que la barre s’affiche."
    : null;
}

/** Numbered steps, one under the other: what to do, then what to copy under it. */
export function SiteGuideSteps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="site-steps">
      {steps.map((step, index) => (
        <li key={step.title} className="site-step">
          <span className="site-step-number" aria-hidden="true">
            {index + 1}
          </span>
          <div className="site-step-text">
            <h4>{step.title}</h4>
            {step.lead}
            <p>{step.text}</p>
          </div>
          {step.children && <div className="site-step-value">{step.children}</div>}
        </li>
      ))}
    </ol>
  );
}

/**
 * The toolbar at work, in a loop (globals.css .site-bar-demo): on a staging page in miniature, a click on
 * an element, the request typed beside it, its pin, then the request landing in Kora with its capture.
 */
export function SiteBarDemo() {
  return (
    <div className="site-bar-demo" role="img" aria-label="Avec la barre Kora, on clique sur un élément du site et on écrit sa demande : elle arrive dans Kora, avec une capture.">
      <span className="demo-nav" />
      <span className="demo-heading" />
      <span className="demo-line" />
      <span className="demo-line is-short" />
      <span className="demo-target">
        <span className="demo-target-line" />
        <span className="demo-ripple" />
      </span>
      <span className="demo-bubble">
        <span className="demo-typed">Le titre est trop long</span>
      </span>
      <span className="demo-pin">CD</span>
      <span className="demo-card">
        <span className="demo-card-head">
          <b>Kora</b> Nouvelle demande
        </span>
        <span className="demo-card-shot">
          <span />
        </span>
        <span className="demo-card-text">Le titre est trop long</span>
      </span>
      <MousePointer2 className="demo-cursor" />
      <span className="demo-bar">
        <Hand />
        <MessageCirclePlus className="demo-bar-comment" />
        <i />
        <b>Kora</b>
      </span>
    </div>
  );
}

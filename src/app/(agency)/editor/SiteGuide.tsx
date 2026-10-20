// The guide of a « Lien »'s board (SiteBoard.tsx): what the Kora toolbar is, and the steps to review the
// staging site with it. The agency's steps carry the values to copy (SiteToolbarSnippet.tsx); the client's
// only say where to click.

import { Hand, MessageCirclePlus } from "lucide-react";

export type GuideStep = { title: string; text: React.ReactNode; children?: React.ReactNode };

/** Numbered steps, one row each: what to do on the left, what to copy on the right. */
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
            <p>{step.text}</p>
          </div>
          {step.children && <div className="site-step-value">{step.children}</div>}
        </li>
      ))}
    </ol>
  );
}

/** A staging page in miniature with the toolbar in its corner and a pin on what was clicked: what the guide names. */
export function SiteBarDemo() {
  return (
    <figure className="site-bar-demo">
      <div className="site-bar-demo-screen" aria-hidden="true">
        <span className="demo-nav" />
        <span className="demo-heading" />
        <span className="demo-line" />
        <span className="demo-line is-short" />
        <span className="demo-target">
          <span className="demo-pin">CD</span>
        </span>
        <span className="demo-bar">
          <Hand />
          <MessageCirclePlus />
          <i />
          <b>Kora</b>
        </span>
      </div>
      <figcaption>
        <b>La barre Kora</b>
        En bas à droite du site, visible seulement avec le lien Kora.
      </figcaption>
    </figure>
  );
}

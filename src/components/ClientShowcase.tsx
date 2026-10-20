// The right half of the client's welcome, on a wide screen: what the review is for, as a headline, a
// small scene played in a loop (a cursor clicks the deliverable, a pin appears, a comment is typed, the
// requests get their status, the version is validated) and three promises. The scene is decoration
// (hidden from screen readers); the headline and the promises are read. Styled in auth.css.

import { BadgeCheck, Check, ListChecks, MessageSquarePlus, MousePointer2 } from "lucide-react";

const promises = [
  { icon: <MessageSquarePlus />, title: "Commentez sur le livrable", text: "Un clic à l’endroit voulu : votre remarque y reste attachée." },
  { icon: <ListChecks />, title: "Suivez chaque demande", text: "Ce qui est prévu, ce qui est à chiffrer, ce qui reste à préciser." },
  { icon: <BadgeCheck />, title: "Validez en un clic", text: "Quand tout vous convient, la version est validée pour de bon." },
];

export function ClientShowcase() {
  return (
    <aside className="showcase" aria-labelledby="showcase-title">
      <div className="showcase-copy">
        <p className="showcase-eyebrow">Votre espace de revue</p>
        <h2 id="showcase-title">
          Vos retours, <span>là où ils comptent.</span>
        </h2>
      </div>

      <div className="showcase-scene" aria-hidden="true">
        <div className="showcase-window">
          <div className="showcase-chrome">
            <i />
            <i />
            <i />
            <span className="showcase-url">maquette-accueil.png</span>
          </div>
          <div className="showcase-doc">
            <span className="showcase-doc-nav" />
            <span className="showcase-doc-title" />
            <span className="showcase-doc-line" />
            <span className="showcase-doc-line is-short" />
            <span className="showcase-doc-image" />
            <span className="showcase-doc-line" />
            <span className="showcase-doc-line is-short" />
          </div>
          <span className="showcase-pin is-one">CD</span>
          <span className="showcase-pin is-two">CD</span>
          <span className="showcase-pin is-three">AM</span>
          <span className="showcase-bubble">
            <b>Claire</b>
            <span className="showcase-typed">Le logo un peu plus grand ?</span>
          </span>
          <MousePointer2 className="showcase-cursor" />
        </div>
        <span className="showcase-chip is-included">
          <i /> Inclus
        </span>
        <span className="showcase-chip is-outside">
          <i /> Hors scope · 450 €
        </span>
        <span className="showcase-approved">
          <span>
            <Check />
          </span>
          Version validée
        </span>
      </div>

      <ul className="showcase-promises">
        {promises.map((promise) => (
          <li key={promise.title}>
            <span className="showcase-promise-icon" aria-hidden="true">
              {promise.icon}
            </span>
            <b>{promise.title}</b>
            <small>{promise.text}</small>
          </li>
        ))}
      </ul>
    </aside>
  );
}

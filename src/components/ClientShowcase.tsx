// Beside the client's access card, on a wide screen: what the review is for, played as a small scene
// (a deliverable, its pins appearing, a comment typed, the version validated), and three promises.
// The scene is decoration (hidden from screen readers); the promises are read. Styled in auth.css.

import { BadgeCheck, Check, ListChecks, MessageSquarePlus } from "lucide-react";

const promises = [
  { icon: <MessageSquarePlus />, title: "Commentez sur le livrable", text: "Un clic à l’endroit voulu, votre remarque y reste attachée." },
  { icon: <ListChecks />, title: "Suivez chaque demande", text: "Ce qui est prévu, ce qui est à chiffrer, ce qui reste à préciser." },
  { icon: <BadgeCheck />, title: "Validez en un clic", text: "Quand tout vous convient, la version est validée pour de bon." },
];

export function ClientShowcase() {
  return (
    <aside className="showcase" aria-label="Votre espace de revue">
      <div className="showcase-scene" aria-hidden="true">
        <div className="showcase-doc">
          <span className="showcase-doc-bar" />
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
          <span className="showcase-typed">Le logo un peu plus grand ?</span>
        </span>
        <span className="showcase-approved">
          <Check /> Version validée
        </span>
      </div>
      <ul className="showcase-promises">
        {promises.map((promise) => (
          <li key={promise.title}>
            <span className="showcase-promise-icon" aria-hidden="true">
              {promise.icon}
            </span>
            <span>
              <b>{promise.title}</b>
              <small>{promise.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

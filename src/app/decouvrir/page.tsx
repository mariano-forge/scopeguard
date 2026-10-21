import type { Metadata } from "next";
import { BadgeEuro, Check, MessagesSquare, MousePointer2, ScrollText, X } from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { Faq } from "./Faq";
import { Film } from "./Film";
import { CardVisual, ClientVisual } from "./Mockups";
import { RevealRoot } from "./Reveal";
import { SiteFooter, SiteNav } from "./SiteChrome";
import { Start } from "./Start";
import "./landing.css";

export const metadata: Metadata = {
  title: "Kora · Gardez le scope de vos projets sous contrôle",
  description:
    "Repérez chaque demande hors devis et faites-la valider en un clic : votre marge reste intacte, et votre client sait ce qu’il paie.",
  openGraph: { title: "Kora · Gardez le scope de vos projets sous contrôle", description: "La revue client, au même endroit pour l’agence et pour le client.", locale: "fr_FR", type: "website" },
};

const delay = (index: number) => ({ "--i": index }) as React.CSSProperties;

/** Where each word of the title starts from before it settles: offsets and tilts, fixed (no randomness in render). */
const scatter = [
  [-18, 26, -7],
  [10, -30, 9],
  [24, 34, -12],
  [-14, -22, 6],
  [20, 28, -5],
  [-26, -18, 8],
  [16, 30, -6],
  [-22, -26, 7],
];

/** A collaborator's cursor, anchored on a word of the title: it comes, selects the word, leaves. */
function Collaborator({ name, side }: { name: string; side: "client" | "agency" }) {
  return (
    <span className={`lp-cursor is-${side}`}>
      <MousePointer2 />
      <b>{name}</b>
    </span>
  );
}

/**
 * The title's words, each in its own box, starting from its place in `scatter` (from `first` on);
 * `picked` words get selected by a collaborator's cursor, in a loop.
 */
function settle(words: string[], first: number, picked: Record<string, React.ReactNode> = {}) {
  return words.map((word, index) => {
    const [x, y, r] = scatter[first + index];
    const cursor = picked[word];
    return (
      <span
        key={word}
        className={`lp-word ${cursor ? "is-picked" : ""}`}
        style={{ "--x": `${x}px`, "--y": `${y}px`, "--r": `${r}deg`, "--w": first + index } as React.CSSProperties}
      >
        {word}
        {cursor}
      </span>
    );
  });
}

type Tone = "is-in" | "is-out" | "is-ask";
const label: Record<Tone, string> = { "is-in": "Inclus", "is-out": "Hors scope", "is-ask": "À clarifier" };

/** Remarks every project gets, each as Kora sorts it. */
const remarks: [string, string, Tone][][] = [
  [
    ["CM", "Le logo est trop petit sur mobile.", "is-in"],
    ["AM", "On peut ajouter une page FAQ ?", "is-out"],
    ["JD", "C’est quoi ce bleu ?", "is-ask"],
    ["CM", "Remplacez la photo d’équipe.", "is-in"],
    ["AM", "Et une version anglaise ?", "is-out"],
    ["JD", "Le bouton ne mène nulle part.", "is-in"],
  ],
  [
    ["AM", "Il manque les mentions légales.", "is-in"],
    ["CM", "On voudrait un blog aussi.", "is-out"],
    ["JD", "Plus de peps dans le titre ?", "is-ask"],
    ["AM", "Ajoutez nos réseaux sociaux.", "is-in"],
    ["CM", "Une animation au survol ?", "is-out"],
    ["JD", "On n’est pas sûrs de la police.", "is-ask"],
  ],
];

/** What a visitor sees at "/" (src/proxy.ts rewrites it here without a session). */
export default function LandingPage() {
  const avoided = [
    { icon: MessagesSquare, pain: "Les retours éparpillés", answer: "Tout se dit sur le livrable, à l’endroit exact." },
    { icon: BadgeEuro, pain: "Le travail fait sans accord", answer: "Chaque ajout est chiffré et accepté avant." },
    { icon: ScrollText, pain: "Les « on n’avait jamais dit ça »", answer: "Un historique commun fait foi." },
  ];
  const cards = [
    { kind: "precise", tone: "is-blue", title: "Des retours précis", text: "Fini les captures annotées et les PDF « v3-bis »." },
    { kind: "scope", tone: "is-violet", title: "Le hors scope repéré", text: "Chaque demande est classée avant d’être traitée." },
    { kind: "quote", tone: "is-yellow", title: "Des devis sans relance", text: "Le prix part du commentaire qui l’a motivé." },
    { kind: "proof", tone: "is-green", title: "Une preuve pour tout", text: "Qui a demandé quoi, et qui a validé quand." },
  ] as const;
  const compared = [
    ["Livrables", "Des pièces jointes et des liens partout", "Une page par livrable, chaque version gardée"],
    ["Retours", "E-mails, appels, PDF annotés", "Sur le livrable, à l’endroit exact"],
    ["Hors scope", "Repéré après coup", "Qualifié dès la demande"],
    ["Devis", "Relances et oublis", "Envoyé et accepté en ligne"],
    ["Transparence", "Chacun sa version des faits", "Le même historique pour tous"],
  ];

  return (
    <RevealRoot>
      <a className="lp-skip" href="#contenu">
        Aller au contenu
      </a>
      <SiteNav />

      <main id="contenu">
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero-copy">
            {/* Words arrive out of line, then snap into place: control. Then collaborators come and select words. */}
            <h1 id="lp-hero-title" className="lp-settle" aria-label="Gardez le scope de vos projets sous contrôle.">
              <span className="lp-settle-line" aria-hidden="true">
                {settle(["Gardez", "le", "scope", "de", "vos", "projets"], 0, { scope: <Collaborator name="Claire · cliente" side="client" /> })}
              </span>
              <span className="lp-settle-line" aria-hidden="true">
                {settle(["sous", "contrôle."], 6, { "contrôle.": <Collaborator name="Studio Bloom" side="agency" /> })}
              </span>
            </h1>
            <p className="lp-lead lp-in" style={delay(2)}>
              Repérez chaque demande hors devis et faites-la valider en un clic&nbsp;: votre marge reste intacte, et votre client sait ce qu’il paie.
            </p>
            <div className="lp-in" style={delay(3)}>
              <Start id="lp-start-hero" />
            </div>
          </div>
        </section>

        <section id="fonctionnement" className="lp-section" aria-labelledby="lp-film-title">
          <Film />
        </section>

        <section id="promesse" className="lp-section" aria-labelledby="lp-promise-title">
          <div className="lp-head">
            <h2 id="lp-promise-title" className="reveal">
              Ce que Kora vous évite
            </h2>
            <p className="lp-sub reveal" style={delay(1)}>
              Avec Kora, chaque retour se range en un clic. Simple pour vous, évident pour vos clients.
            </p>
          </div>
          <div className="lp-marquee reveal" style={delay(2)} aria-hidden="true">
            {remarks.map((row, index) => (
              <div key={index} className={`lp-marquee-row ${index % 2 ? "is-reverse" : ""}`}>
                <div className="lp-marquee-track">
                  {[...row, ...row].map(([who, text, tone], position) => (
                    <span key={position} className="lp-remark">
                      <i>{who}</i>«&nbsp;{text}&nbsp;»<em className={tone}>{label[tone]}</em>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ul className="lp-avoided">
            {avoided.map(({ icon: Icon, pain, answer }, index) => (
              <li key={pain} className="reveal" style={delay(index)}>
                <span className="lp-avoided-icon">
                  <Icon />
                </span>
                <s>{pain}</s>
                <span>{answer}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section" aria-labelledby="lp-cards-title">
          <div className="lp-head">
            <h2 id="lp-cards-title" className="lp-one-line reveal">
              Moins d’allers-retours, plus de décisions.
            </h2>
          </div>
          <div className="lp-cards">
            {cards.map((card, index) => (
              <article key={card.kind} className="lp-card reveal" style={delay(index % 2)}>
                <div className={`lp-card-art ${card.tone}`} aria-hidden="true">
                  <CardVisual kind={card.kind} />
                </div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" aria-labelledby="lp-compare-title">
          <div className="lp-head">
            <h2 id="lp-compare-title" className="reveal">
              Tout au même endroit.
            </h2>
            <p className="lp-sub reveal" style={delay(1)}>
              Livrables, retours, devis, décisions&nbsp;: une seule page, la même pour l’agence et pour le client.
            </p>
          </div>
          <div className="lp-compare reveal" style={delay(2)}>
            <table>
              <thead>
                <tr>
                  <td />
                  <th scope="col">Sans Kora</th>
                  <th scope="col" className="is-kora">
                    <KoraMark /> Avec Kora
                  </th>
                </tr>
              </thead>
              <tbody>
                {compared.map(([topic, without, withKora]) => (
                  <tr key={topic}>
                    <th scope="row">{topic}</th>
                    <td>
                      <X aria-hidden="true" />
                      {without}
                    </td>
                    <td className="is-kora">
                      <Check aria-hidden="true" />
                      {withKora}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>


        <section id="client" className="lp-section lp-split" aria-labelledby="lp-client-title">
          <div className="lp-split-copy">
            <h2 id="lp-client-title" className="reveal">
              Vos clients disent oui plus vite.
            </h2>
            <p className="lp-sub reveal" style={delay(1)}>
              Ni compte ni formation&nbsp;: ils ouvrent le lien et commentent. Chaque supplément leur arrive chiffré, ils l’acceptent en un clic, et vous démarrez sans relancer.
            </p>
          </div>
          <div className="lp-split-art reveal" style={delay(1)} aria-hidden="true">
            <ClientVisual />
          </div>
        </section>

        <section id="questions" className="lp-section lp-faq-section" aria-labelledby="lp-faq-title">
          <div className="lp-head">
            <h2 id="lp-faq-title" className="reveal">
              Questions fréquentes
            </h2>
          </div>
          <div className="reveal" style={delay(1)}>
            <Faq />
          </div>
        </section>

        <section className="lp-final reveal" aria-labelledby="lp-final-title">
          <div className="lp-final-copy">
            <h2 id="lp-final-title">Votre prochain projet mérite mieux qu’un fil d’e-mails.</h2>
            <p>Créez votre espace et invitez un client sur un premier livrable.</p>
            <Start id="lp-start-final" />
          </div>
          {/* The Kora mark, with what goes round it: requests sorted, priced, validated. */}
          <div className="lp-orbit" aria-hidden="true">
            <KoraMark className="lp-orbit-mark" />
            <div className="lp-orbit-ring">
              <span className="lp-orbit-slot" style={{ "--a": "-30deg" } as React.CSSProperties}>
                <span className="lp-orbit-chip is-out">Hors scope · page FAQ</span>
              </span>
              <span className="lp-orbit-slot" style={{ "--a": "90deg" } as React.CSSProperties}>
                <span className="lp-orbit-chip is-in">Devis accepté · 850&nbsp;€ HT</span>
              </span>
              <span className="lp-orbit-slot" style={{ "--a": "210deg" } as React.CSSProperties}>
                <span className="lp-orbit-chip is-ok">
                  <Check /> V03 validée par Claire
                </span>
              </span>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </RevealRoot>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeEuro, Check, FileCheck2, KeyRound, Link2, Lock, MessageSquareText, MousePointerClick, ScrollText } from "lucide-react";
import { KoraMark } from "@/components/KoraMark";
import { Button } from "@/components/ui/button";
import { DemoButton } from "./DemoButton";
import { RevealRoot } from "./Reveal";
import "./landing.css";

export const metadata: Metadata = {
  title: "Kora · Chaque retour client devient une décision",
  description:
    "Kora place la discussion sur le livrable, qualifie chaque demande — incluse ou hors scope — et fait accepter le supplément avant que le travail commence. Pour les agences qui travaillent au forfait.",
  openGraph: { title: "Kora · Chaque retour client devient une décision", description: "La revue client qui protège votre marge.", locale: "fr_FR", type: "website" },
};

/** What a visitor sees at "/" (src/proxy.ts rewrites it here without a session): the case for Kora, then a demo or the sign-in. */
export default function LandingPage() {
  const title = ["Chaque", "retour", "client", "devient", "une"];
  const messages = [
    ["JD", "Juste une petite modif : ajouter une section témoignages."],
    ["CM", "C’était pas compris dans le devis ?"],
    ["PL", "On avait validé quelle version, déjà ?"],
    ["SB", "Tu peux me renvoyer le PDF avec mes commentaires ?"],
    ["AR", "Ça prend cinq minutes, non ?"],
    ["CM", "Je pensais que c’était inclus."],
    ["JD", "Mon associé veut aussi changer le logo."],
    ["PL", "Voir mes remarques dans le mail du 12, en bas."],
    ["SB", "Pour la facture, on avait dit quoi ?"],
    ["AR", "Le bouton bleu, mais plus bleu."],
  ];

  return (
    <RevealRoot>
      <a className="landing-skip" href="#contenu">
        Aller au contenu
      </a>

      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="Kora, accueil">
          <KoraMark className="size-6" />
          <span>Kora</span>
        </Link>
        <nav aria-label="Sections">
          <a href="#etapes">Comment ça marche</a>
          <a href="#difference">Pourquoi Kora</a>
          <a href="#preuve">La preuve</a>
        </nav>
        <div className="landing-nav-actions">
          <Button asChild variant="ghost" size="lg">
            <Link href="/connexion">Se connecter</Link>
          </Button>
          <DemoButton />
        </div>
      </header>

      <main id="contenu">
        {/* ——— Hero: the promise, then the whole story in one animated scene ——— */}
        <section className="landing-section landing-hero" aria-labelledby="hero-title">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Pour les agences qui travaillent au forfait</p>
            <h1 id="hero-title">
              {title.map((word, index) => (
                <span key={word}>
                  <span className="landing-word" style={{ "--i": index } as React.CSSProperties}>
                    {word}
                  </span>{" "}
                </span>
              ))}
              <span className="landing-word" style={{ "--i": title.length } as React.CSSProperties}>
                <span className="landing-hl">décision.</span>
              </span>
            </h1>
            <p className="landing-lead">
              Kora place la discussion directement sur le livrable. Vous qualifiez chaque demande — incluse, ou hors scope et chiffrée — et le client accepte le
              supplément avant que le travail commence.
            </p>
            <div className="landing-actions">
              <DemoButton className="landing-cta" />
              <Button asChild variant="outline" size="lg" className="landing-cta">
                <Link href="/connexion">
                  Se connecter <ArrowRight />
                </Link>
              </Button>
            </div>
            <p className="landing-note">Vos clients n’ont ni compte ni mot de passe à créer : un lien, un code reçu par e-mail.</p>
          </div>

          <div className="landing-hero-art">
            <div className="scene" aria-hidden="true">
              <div className="scene-page">
                <i style={{ width: "38%" }} />
                <div className="scene-block" />
                <i style={{ width: "92%" }} />
                <i style={{ width: "84%" }} />
                <i style={{ width: "60%" }} />
                <span className="scene-pin">CM</span>
                <div className="scene-bubble">
                  <b>Claire · cliente</b>
                  Peut-on ajouter une section témoignages ?
                </div>
              </div>
              <div className="scene-panel">
                <span className="scene-chip">Hors scope · ajout à chiffrer</span>
                <div className="scene-quote">
                  <span>Section témoignages</span>
                  <b>850 € HT · + 3 jours</b>
                  <i className="scene-send">Envoyer la proposition</i>
                </div>
                <span className="scene-ok">
                  <Check /> Acceptée par la cliente
                </span>
              </div>
            </div>
            <p className="scene-caption">Un commentaire, une qualification, un devis accepté. Avant la première heure de travail.</p>
          </div>
        </section>

        {/* ——— The messages every agency has already received ——— */}
        <section className="landing-marquee" aria-labelledby="marquee-title">
          <div className="landing-section landing-marquee-head">
            <h2 id="marquee-title" className="reveal">
              Vous les avez déjà reçus.
            </h2>
            <p className="landing-lead reveal" style={{ "--i": 1 } as React.CSSProperties}>
              Chacun de ces messages a coûté des heures non facturées à une agence. Kora en fait une demande, puis une décision.
            </p>
          </div>
          {[messages.slice(0, 5), messages.slice(5)].map((row, rowIndex) => (
            <div key={rowIndex} className={`landing-marquee-row ${rowIndex === 1 ? "is-reverse" : ""}`}>
              {[0, 1].map((copy) => (
                <div key={copy} className="landing-marquee-track" aria-hidden={copy === 1 || rowIndex === 1}>
                  {row.map(([initials, text]) => (
                    <span key={text} className="landing-msg">
                      <i>{initials}</i>
                      {text}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* ——— How it works: three steps, told with the product's own pieces ——— */}
        <section id="etapes" className="landing-section" aria-labelledby="etapes-title">
          <p className="landing-eyebrow reveal">Comment ça marche</p>
          <h2 id="etapes-title" className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
            Trois gestes, et le hors scope ne se cache plus.
          </h2>
          <div className="landing-steps">
            <article className="landing-step reveal" style={{ "--i": 2 } as React.CSSProperties}>
              <span className="landing-step-n">01</span>
              <div className="landing-step-art" aria-hidden="true">
                <div className="art-share">
                  <span className="art-mail">
                    <Link2 /> c•••••@client.fr
                  </span>
                  <span className="art-code">482 913</span>
                </div>
              </div>
              <h3>Partagez un lien</h3>
              <p>Importez un PDF, une image ou une page de votre site de staging. Le client reçoit un lien et un code par e-mail. Rien à installer, rien à apprendre.</p>
            </article>
            <article className="landing-step reveal" style={{ "--i": 3 } as React.CSSProperties}>
              <span className="landing-step-n">02</span>
              <div className="landing-step-art" aria-hidden="true">
                <div className="art-page">
                  <i style={{ width: "70%" }} />
                  <i style={{ width: "50%" }} />
                  <span className="art-pin">
                    <MousePointerClick />
                  </span>
                  <span className="art-note">Le logo est trop petit.</span>
                </div>
              </div>
              <h3>Le client commente à l’endroit exact</h3>
              <p>Un clic sur la maquette, un commentaire. Fini les captures annotées à la main, les PDF « v3-bis » et les remarques en bas d’un e-mail.</p>
            </article>
            <article className="landing-step reveal" style={{ "--i": 4 } as React.CSSProperties}>
              <span className="landing-step-n">03</span>
              <div className="landing-step-art" aria-hidden="true">
                <div className="art-decide">
                  <span className="art-choice is-in">Inclus</span>
                  <span className="art-choice is-out">Hors scope</span>
                  <span className="art-accepted">
                    <BadgeEuro /> 850 € HT · acceptée
                  </span>
                </div>
              </div>
              <h3>Vous qualifiez, le client accepte</h3>
              <p>Inclus, ou hors scope. Le devis part du commentaire lui-même ; le client l’accepte ou le refuse avant que votre équipe commence.</p>
            </article>
          </div>
        </section>

        {/* ——— Before / after: the same request, without Kora and with it ——— */}
        <section id="difference" className="landing-section" aria-labelledby="difference-title">
          <p className="landing-eyebrow reveal">Pourquoi Kora</p>
          <h2 id="difference-title" className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
            La même demande, racontée deux fois.
          </h2>
          <div className="landing-compare">
            <div className="compare-card is-before reveal" style={{ "--i": 2 } as React.CSSProperties} aria-label="Sans Kora">
              <p className="compare-title">
                <span>Sans Kora</span>
                <span>Boîte mail</span>
              </p>
              <ul className="compare-mails">
                <li>
                  <i>CM</i>
                  <b>Re: Re: Re: maquette v3 FINAL (2)</b>
                  <time>lun. 09:12</time>
                </li>
                <li>
                  <i>AM</i>
                  <b>RE: section témoignages ??</b>
                  <time>lun. 11:40</time>
                </li>
                <li>
                  <i>CM</i>
                  <b>Tr: PDF annoté (v3-bis)</b>
                  <time>mar. 08:05</time>
                </li>
                <li>
                  <i>AM</i>
                  <b>Devis complément — à valider</b>
                  <time>mar. 14:22</time>
                </li>
                <li>
                  <i>CM</i>
                  <b>C’était pas inclus ?</b>
                  <time>jeu. 17:30</time>
                </li>
              </ul>
              <p className="compare-foot">14 e-mails · 3 PDF · 0 preuve</p>
            </div>
            <div className="compare-card is-after reveal" style={{ "--i": 3 } as React.CSSProperties} aria-label="Avec Kora">
              <p className="compare-title">
                <span>Avec Kora</span>
                <span>Sur le livrable</span>
              </p>
              <ul className="compare-rows">
                <li>
                  <Check /> Une demande, à l’endroit exact
                </li>
                <li>
                  <Check /> Une qualification : hors scope
                </li>
                <li>
                  <Check /> Un devis accepté avant le travail
                </li>
                <li>
                  <Check /> Une preuve horodatée
                </li>
              </ul>
              <p className="compare-foot">Et une facture qui ne surprend personne.</p>
            </div>
          </div>
        </section>

        {/* ——— Proof: the journal that settles the "it was included" conversation ——— */}
        <section id="preuve" className="landing-section landing-proof" aria-labelledby="preuve-title">
          <div className="landing-proof-copy">
            <p className="landing-eyebrow reveal">La preuve</p>
            <h2 id="preuve-title" className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
              Une preuve, pas un souvenir.
            </h2>
            <p className="landing-lead reveal" style={{ "--i": 2 } as React.CSSProperties}>
              Chaque commentaire, qualification, devis et validation est horodaté dans un journal en ajout seul. Quand un client demande « on avait dit quoi ? », la
              réponse existe déjà.
            </p>
            <ul className="landing-checks reveal" style={{ "--i": 3 } as React.CSSProperties}>
              <li>
                <ScrollText /> Journal en ajout seul : rien ne s’efface, rien ne se réécrit
              </li>
              <li>
                <FileCheck2 /> Synthèse exportable pour la facture
              </li>
              <li>
                <Lock /> Version validée verrouillée, avec qui et quand
              </li>
            </ul>
          </div>
          <ol className="landing-timeline reveal" style={{ "--i": 2 } as React.CSSProperties}>
            <li>
              <time>14 oct. 09:12</time>
              <span>
                <b>Claire M.</b> commente « Section témoignages » sur la page 2.
              </span>
            </li>
            <li>
              <time>14 oct. 11:40</time>
              <span>
                <b>Alex M.</b> qualifie la demande hors scope et envoie un devis : 850 € HT, + 3 jours.
              </span>
            </li>
            <li>
              <time>15 oct. 08:05</time>
              <span>
                <b>Claire M.</b> accepte le devis.
              </span>
            </li>
            <li className="is-final">
              <time>16 oct. 17:30</time>
              <span>
                <b>V03 validée</b> par Claire M. Le journal est figé.
              </span>
            </li>
          </ol>
        </section>

        {/* ——— For the client: simpler than an e-mail ——— */}
        <section className="landing-section landing-clients" aria-labelledby="clients-title">
          <p className="landing-eyebrow reveal">Côté client</p>
          <h2 id="clients-title" className="reveal" style={{ "--i": 1 } as React.CSSProperties}>
            Plus simple qu’un e-mail. Pour eux aussi.
          </h2>
          <div className="landing-features">
            <div className="landing-feature reveal" style={{ "--i": 2 } as React.CSSProperties}>
              <KeyRound />
              <h3>Un lien, un code</h3>
              <p>Pas de compte, pas de mot de passe. Le client confirme son adresse avec un code à usage unique et commence.</p>
            </div>
            <div className="landing-feature reveal" style={{ "--i": 3 } as React.CSSProperties}>
              <BadgeEuro />
              <h3>Le prix avant le oui</h3>
              <p>Pour une demande hors scope, il voit le montant et l’impact sur le planning, puis accepte, refuse ou propose autre chose.</p>
            </div>
            <div className="landing-feature reveal" style={{ "--i": 4 } as React.CSSProperties}>
              <MessageSquareText />
              <h3>Il valide, et ça s’arrête là</h3>
              <p>La bonne version, validée en un clic par la personne qui décide. Les autres contribuent, sans pouvoir engager l’agence.</p>
            </div>
          </div>
        </section>

        {/* ——— Final call ——— */}
        <section className="landing-final reveal" aria-labelledby="final-title">
          <h2 id="final-title">Arrêtez de faire gratuitement ce qui n’était pas prévu.</h2>
          <p>Une démo de trente minutes, sur vos propres livrables.</p>
          <div className="landing-actions is-center">
            <DemoButton className="landing-cta" />
            <Button asChild variant="outline" size="lg" className="landing-cta">
              <Link href="/connexion">Créer un compte</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-brand">
          <KoraMark className="size-5" />
          <span>Kora</span>
        </span>
        <span className="landing-footer-note">La revue client qui protège votre marge.</span>
        <nav aria-label="Pied de page">
          <Link href="/connexion">Se connecter</Link>
          <a href="#etapes">Comment ça marche</a>
          <a href="#preuve">La preuve</a>
        </nav>
      </footer>
    </RevealRoot>
  );
}

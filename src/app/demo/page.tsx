import type { Metadata } from "next";
import { RevealRoot } from "../decouvrir/Reveal";
import { SiteFooter, SiteNav } from "../decouvrir/SiteChrome";
import { DemoForm } from "./DemoForm";
import "../decouvrir/landing.css";
import "./demo.css";

export const metadata: Metadata = {
  title: "Réserver une démo · Kora",
  description: "Trente minutes avec notre équipe pour voir Kora en action.",
};

const delay = (index: number) => ({ "--i": index }) as React.CSSProperties;

export default function DemoPage() {
  return (
    <RevealRoot>
      <SiteNav />
      <main className="demo">
        <div className="demo-copy">
          <h1>
            <span className="lp-line" style={delay(0)}>
              Réservez
            </span>{" "}
            <span className="lp-line" style={delay(1)}>
              votre démo.
            </span>
          </h1>
          <p className="lp-lead lp-in" style={delay(2)}>
            Trente minutes avec notre équipe pour voir Kora en action et répondre à vos questions.
          </p>
        </div>
        <div className="demo-form lp-in" style={delay(2)}>
          <DemoForm />
        </div>
      </main>
      <SiteFooter />
    </RevealRoot>
  );
}

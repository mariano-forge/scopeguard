"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";

const questions = [
  {
    q: "Mes clients doivent-ils créer un compte ?",
    a: "Non. Ils reçoivent un lien et confirment leur adresse avec un code à usage unique. Ils peuvent commenter dans la minute, sans mot de passe.",
  },
  {
    q: "Quels livrables puis-je partager ?",
    a: "Des PDF, des images et des pages de votre site de staging. Chaque nouvelle version garde l’historique des précédentes.",
  },
  {
    q: "Comment fonctionne un supplément ?",
    a: "Vous qualifiez une demande « hors scope », vous indiquez un prix et un délai, et le client l’accepte ou la refuse depuis sa revue. Vous commencez le travail une fois l’accord donné.",
  },
  {
    q: "Qui peut valider une version ?",
    a: "Le client désigne qui décide. Les autres personnes invitées peuvent commenter sans pouvoir engager l’agence.",
  },
  {
    q: "Combien coûte Kora ?",
    a: "Kora est ouvert à quelques agences pilotes. Créez votre espace : nous vous présentons les conditions selon votre volume de projets.",
  },
];

/** Questions a visitor who has never heard of Kora would ask; one open at a time. */
export function Faq() {
  const id = useId();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="lp-faq">
      {questions.map((item, index) => {
        const expanded = open === index;
        return (
          <div key={item.q} className="lp-faq-item" data-open={expanded ? "" : undefined}>
            <h3>
              <button type="button" aria-expanded={expanded} aria-controls={`${id}-${index}`} onClick={() => setOpen(expanded ? null : index)}>
                {item.q}
                <Plus aria-hidden="true" />
              </button>
            </h3>
            <div id={`${id}-${index}`} role="region" className="lp-faq-answer" aria-hidden={!expanded}>
              <div>
                <p>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

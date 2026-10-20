"use client";

// The first visit of a deliverable: what each tool of the page is for, in a few words (ProductTour).

import { ProductTour, type TourStep } from "@/components/ProductTour";

/** Shown once per browser; the e2e tests mark it seen (tests/e2e/helpers.ts newPerson). */
export const deliverableTourKey = "kora:tutoriel:livrable";

const steps: TourStep[] = [
  {
    target: '.tool-button[aria-label="Commentaire"]',
    title: "Commentez sur le livrable",
    text: "Cliquez à l’endroit voulu : votre commentaire s’y épingle. Il reste un brouillon, invisible pour le client, tant que vous ne l’avez pas qualifié.",
    side: "top",
  },
  {
    target: ".inspector-tabs",
    title: "Qualifiez chaque demande",
    text: "À clarifier, Inclus ou Hors scope : qualifiée, la demande devient visible pour le client. Une demande hors scope se chiffre, et la proposition part à ses décideurs.",
    side: "left",
  },
  {
    target: ".requests-add",
    title: "Une demande reçue ailleurs ?",
    text: "Un e-mail, un appel, une réunion : ajoutez-la avec sa source. Elle rejoint les autres, et le client la retrouve.",
    side: "bottom",
  },
  {
    target: '.requests-header [aria-label^="Notifications"]',
    title: "Suivez votre client",
    text: "Ses messages et ses décisions arrivent ici, dès qu’il les écrit.",
    side: "bottom",
  },
  {
    target: '[aria-label="Partager la revue"]',
    title: "Partagez avec votre client",
    text: "Invitez ses personnes : les décideurs valident la version et décident de vos propositions, les contributeurs commentent. Rien ne leur est visible avant ce partage.",
    side: "bottom",
  },
];

export function DeliverableTour() {
  return <ProductTour steps={steps} storageKey={deliverableTourKey} label="Découvrir le livrable" />;
}

"use client";

// The first visit of a deliverable: what each tool of the page is for, in a few words (ProductTour).

import { ProductTour, type TourStep } from "@/components/ProductTour";

/** Shown once per browser; the e2e tests mark it seen (tests/e2e/helpers.ts newPerson). */
export const deliverableTourKey = "kora:tutoriel:livrable";

const steps: TourStep[] = [
  {
    target: '.tool-button[aria-label="Commentaire"]',
    title: "Commentez sur le livrable",
    text: "Avec cet outil, cliquez à l’endroit voulu : le commentaire s’y épingle, et la discussion se poursuit dans son fil.",
    side: "top",
  },
  {
    target: ".inspector-tabs",
    title: "Qualifiez chaque demande",
    text: "Inclus : prévu au devis. Hors scope : un ajout, que vous chiffrez pour le client. À clarifier : en attente de précisions.",
    side: "left",
  },
  {
    target: '[aria-label="Importer un fichier comme nouvelle version"]',
    title: "Une nouvelle version ?",
    text: "Importez-la ici. La précédente reste consultable, et le client ne voit la nouvelle qu’une fois partagée.",
    side: "right",
  },
  {
    target: '[aria-label="Partager la revue"]',
    title: "Partagez avec votre client",
    text: "Il reçoit un lien personnel, commente sur place et décide de vos devis. Rien ne lui est visible avant ce partage.",
    side: "bottom",
  },
];

export function DeliverableTour() {
  return <ProductTour steps={steps} storageKey={deliverableTourKey} label="Découvrir le livrable" />;
}

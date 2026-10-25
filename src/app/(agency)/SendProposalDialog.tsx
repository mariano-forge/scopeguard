"use client";

// Confirms a drafted proposal before it goes: it names the deciders who receive it. With none invited
// on the version, sending is impossible (the server refuses it too, src/lib/linkDeciders.ts): a
// warning says why, and leads to sharing the review.

import { Share2, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatProposalAmount, formatProposalDeadline } from "@/lib/proposalFormat";

export function SendProposalDialog({
  proposal,
  deciders,
  canManage,
  onClose,
  onSend,
  onShare,
}: {
  /** The request and its drafted quote, or its prepared offer (`offer`, src/lib/requestOffer.ts); none closes the dialog. */
  proposal: { title: string; amount: number | string; deadline: number | string; offer?: boolean } | null;
  /** E-mail addresses of the version's deciders. */
  deciders: string[];
  canManage: boolean;
  onClose: () => void;
  onSend: () => void;
  onShare: () => void;
}) {
  const many = deciders.length > 1;
  const offer = Boolean(proposal?.offer);
  return (
    <Modal
      open={Boolean(proposal)}
      onClose={onClose}
      role="alertdialog"
      title={offer ? "Envoyer l’offre au client ?" : "Envoyer la proposition au client ?"}
      description={
        !deciders.length
          ? "La proposition est prête, mais personne ne peut encore la recevoir."
          : offer
            ? `${many ? "Les décideurs en seront prévenus" : "Le décideur en sera prévenu"} par e-mail et ${many ? "verront" : "verra"} la demande « Offerte » avec sa valeur, sans rien à décider.`
            : `${many ? "Les décideurs la recevront" : "Le décideur la recevra"} par e-mail et sur ${many ? "leur" : "sa"} page de revue, et ${many ? "pourront" : "pourra"} l’accepter, la refuser ou demander une adaptation.`
      }
      className="confirm-send-modal"
      footer={
        <>
          {!canManage && <span className="mr-auto self-center text-xs text-muted-foreground">Envoi réservé aux administrateurs de l’organisation</span>}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!canManage || !deciders.length} onClick={onSend}>
            {offer ? "Envoyer l’offre" : "Envoyer la proposition"}
          </Button>
        </>
      }
    >
      {!deciders.length && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Aucun décideur pour recevoir cette proposition</AlertTitle>
          <AlertDescription>
            <p>Seul un décideur du client peut accepter ou refuser une proposition. Partagez la revue de cette version avec au moins un décideur : vous pourrez ensuite l’envoyer.</p>
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 /> Partager la revue
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {proposal && deciders.length > 0 && (
        <p className="proposal-recipients">
          <span>Envoyée à</span> {deciders.join(", ")}
        </p>
      )}
      {proposal && (
        <div className="proposal-summary">
          <div>
            <span>Demande</span>
            <b>{proposal.title}</b>
          </div>
          <div>
            <span>{offer ? "Valeur offerte HT" : "Montant HT"}</span>
            <b>{formatProposalAmount(proposal.amount)}</b>
          </div>
          <div>
            <span>Délai</span>
            <b>{formatProposalDeadline(proposal.deadline)}</b>
          </div>
        </div>
      )}
    </Modal>
  );
}

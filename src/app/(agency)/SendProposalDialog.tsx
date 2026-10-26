"use client";

// Confirms a drafted proposal before it goes: it names the deciders who receive it. With none invited
// on the version, sending is impossible (the server refuses it too, src/lib/linkDeciders.ts): a
// warning says why, and leads to sharing the review.

import { useState } from "react";
import { ChevronDown, Gift, Share2, TriangleAlert } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  /** Sends it, telling by e-mail the deciders chosen (all by default). */
  onSend: (notify: string[]) => void;
  onShare: () => void;
}) {
  const many = deciders.length > 1;
  const offer = Boolean(proposal?.offer);
  // Whom to tell by e-mail: every decider, unless the agency unticks some (folded, at the foot: not the point).
  const [notified, setNotified] = useState(deciders);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const plural = (count: number) => `${count} décideur${count > 1 ? "s" : ""}`;
  const notifySummary =
    notified.length === deciders.length ? (deciders.length > 1 ? `Les ${plural(deciders.length)}` : plural(1)) : notified.length ? `${plural(notified.length)} sur ${deciders.length}` : "Personne";
  return (
    <Modal
      open={Boolean(proposal)}
      onClose={onClose}
      role="alertdialog"
      title={offer ? "Offrir ce travail au client ?" : "Envoyer la proposition au client ?"}
      // Short sentences: what to do, then what follows (feedback of 26 October 2026).
      description={
        !deciders.length
          ? "Partagez d’abord la revue avec un décideur."
          : offer
            ? `Vérifiez le montant, puis offrez ce travail. ${many ? "Les décideurs n’ont" : "Le décideur n’a"} rien à accepter.`
            : `Vérifiez le montant et le délai, puis envoyez. ${many ? "Les décideurs répondent depuis leur" : "Le décideur répond depuis sa"} revue : accepter, refuser ou demander une adaptation.`
      }
      className="confirm-send-modal"
      footer={
        <>
          {!canManage && <span className="mr-auto self-center text-xs text-muted-foreground">Envoi réservé aux administrateurs de l’organisation</span>}
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!canManage || !deciders.length} onClick={() => onSend(notified)}>
            {offer ? "Offrir" : "Envoyer la proposition"}
          </Button>
        </>
      }
    >
      {!deciders.length && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertTitle>Aucun décideur pour recevoir cette proposition</AlertTitle>
          <AlertDescription>
            <p>Seul un décideur reçoit une proposition. Partagez la revue de cette version avec l’un d’eux, puis revenez l’envoyer.</p>
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 /> Partager la revue
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {proposal && (
        <div className="proposal-summary">
          <div>
            <span>Demande</span>
            <b>{proposal.title}</b>
          </div>
          <div>
            <span>Montant HT</span>
            {/* An offer's amount marked as a gift, in green, as on its card and in its bubble. */}
            <b className={offer ? "is-offer" : undefined}>
              {offer && <Gift aria-hidden="true" />}
              {formatProposalAmount(proposal.amount)}
            </b>
          </div>
          <div>
            <span>Délai</span>
            <b>{formatProposalDeadline(proposal.deadline)}</b>
          </div>
        </div>
      )}
      {/* Whom to tell by e-mail, among the version's deciders (feedback of 26 October 2026): folded at the foot,
          all ticked; the proposal shows in every decider's review whatever is ticked here. */}
      {proposal && deciders.length > 0 && (
        <section className="proposal-notify">
          <button type="button" className="proposal-notify-toggle" aria-expanded={notifyOpen} onClick={() => setNotifyOpen((open) => !open)}>
            <ChevronDown aria-hidden="true" />
            Prévenir par e-mail
            <span>{notifySummary}</span>
          </button>
          {notifyOpen && (
            <ul>
              {deciders.map((email) => (
                <li key={email}>
                  <label>
                    <Checkbox
                      checked={notified.includes(email)}
                      onCheckedChange={(checked) => setNotified((current) => (checked === true ? deciders.filter((one) => one === email || current.includes(one)) : current.filter((one) => one !== email)))}
                    />
                    {email}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Modal>
  );
}

"use client";

// « Partager la revue »: one field to invite (several addresses at once), then the people invited, each
// with the role to set and their personal link; access requests if any; the version's link to copy in the
// footer, with its expiry. Built from shadcn pieces; every write goes through the callbacks of AgencyApp
// (src/db/agencyActions.ts, /api/review-access).

import { useState } from "react";
import { BellRing, Check, Copy, Info, UserPlus, Users } from "lucide-react";
import { Hint } from "@/components/hint";
import { Field, FormError, Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { EmailChipsInput } from "@/components/EmailChipsInput";
import type { ClientRole } from "@/lib/clientRoles";
import { InviteList, type Invite } from "./InviteList";

type ShareLink = { active: boolean; expiresAt: string; autoExpire?: boolean; invites?: Invite[] };
type AccessRequest = { email: string; message: string | null };

export function ShareDialog({
  open,
  onClose,
  subject,
  link,
  readOnly,
  canManage,
  inviteDraft,
  onInviteDraft,
  inviteError,
  onInvite,
  previousPeople,
  onReusePrevious,
  onCopyInvite,
  onRemoveInvite,
  onChangeRole,
  accessRequests,
  onDecideAccess,
  linkCopied,
  onCopyLink,
  onRevoke,
  lastReminderAt,
  onRemind,
}: {
  open: boolean;
  onClose: () => void;
  /** The deliverable and its version, as the description names them: « maquette.png » (V01). */
  subject: string;
  link: ShareLink | null;
  readOnly: boolean;
  canManage: boolean;
  inviteDraft: string;
  onInviteDraft: (value: string) => void;
  inviteError: string;
  onInvite: () => void;
  /** The people of the previous version can be invited again in one click. */
  previousPeople: boolean;
  onReusePrevious: () => void;
  onCopyInvite: (invite: Invite) => void;
  onRemoveInvite: (email: string) => void;
  onChangeRole: (email: string, role: ClientRole) => void;
  accessRequests: AccessRequest[];
  onDecideAccess: (request: AccessRequest, decision: "accepted" | "refused") => void;
  linkCopied: boolean;
  onCopyLink: () => void;
  onRevoke: () => void;
  /** When the invited clients were last reminded (ms), if ever. */
  lastReminderAt: number | null;
  onRemind: () => void;
}) {
  const invites = link?.invites ?? [];
  // A day between reminders, measured from when the page opened (the server has the last word).
  const [openedAt] = useState(() => Date.now());
  const reminderBlocked = lastReminderAt !== null && openedAt - lastReminderAt < 24 * 60 * 60 * 1000;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Partager la revue"
      description={`Invitez vos clients à revoir ${subject} : chacun reçoit par e-mail son lien personnel.`}
      className="share-dialog"
      footer={
        link?.active ? (
          <>
            <Button
              variant="destructive"
              className="sm:mr-auto"
              disabled={!canManage}
              title={canManage ? undefined : "Réservé aux administrateurs de l’organisation"}
              onClick={onRevoke}
            >
              Révoquer ce lien
            </Button>
            <Button onClick={onCopyLink}>
              {linkCopied ? <Check /> : <Copy />} {linkCopied ? "Lien copié" : "Copier le lien"}
            </Button>
          </>
        ) : undefined
      }
    >
      {link?.active ? (
        <>
          <section className="share-section">
            <Field id="share-invite" label="Inviter par e-mail">
              <div className="share-invite-row">
                <EmailChipsInput
                  id="share-invite"
                  value={inviteDraft}
                  onChange={onInviteDraft}
                  onSubmit={onInvite}
                  placeholder="Une ou plusieurs adresses : prenom@client.fr, autre@client.fr…"
                  disabled={readOnly}
                />
                <Button onClick={onInvite} disabled={!inviteDraft.trim() || readOnly}>
                  <UserPlus /> Inviter
                </Button>
              </div>
            </Field>
            {inviteError && <FormError>{inviteError}</FormError>}
          </section>

          {/* A copied link opens to invited addresses only (src/db/reviewAuth.ts): said before it is sent. */}
          {invites.length === 0 ? (
            <div className="share-empty" role="note">
              <span className="share-empty-icon" aria-hidden="true">
                <Users />
              </span>
              <b>Personne n’est encore invité</b>
              <p>Le lien ne s’ouvre qu’aux adresses invitées : invitez d’abord votre client, sinon il ne recevra pas de code.</p>
              {previousPeople && (
                <Button variant="outline" size="sm" onClick={onReusePrevious}>
                  Reprendre les personnes de la version précédente
                </Button>
              )}
            </div>
          ) : (
            <section className="share-section">
              <div className="share-heading-row">
                <h3 className="share-heading">
                  Personnes invitées <span>{invites.length}</span>
                </h3>
                {/* Once a day per link (the server says so too, 429): their personal link mailed again. */}
                <Hint label="Leur renvoyer leur lien personnel par e-mail">
                  <Button variant="outline" size="sm" onClick={onRemind} disabled={reminderBlocked || readOnly}>
                    <BellRing /> {reminderBlocked ? "Relance déjà envoyée" : "Relancer le client"}
                  </Button>
                </Hint>
              </div>
              {/* In sight, not in a hint: a disabled button shows none, and that is when the date matters. */}
              {lastReminderAt && <p className="share-reminded">Dernière relance : {new Date(lastReminderAt).toLocaleString("fr-FR")}</p>}
              <InviteList invites={invites} onCopy={onCopyInvite} onRemove={onRemoveInvite} onRole={onChangeRole} />
            </section>
          )}

          {accessRequests.length > 0 && (
            <section className="share-section">
              <h3 className="share-heading">
                Demandes d’accès <span>{accessRequests.length}</span>
              </h3>
              <ul className="share-list" aria-label="Demandes d’accès">
                {accessRequests.map((request) => (
                  <li key={request.email}>
                    <span className="share-avatar" aria-hidden="true">
                      {request.email.charAt(0).toUpperCase()}
                    </span>
                    <span className="share-person">
                      <span className="truncate">{request.email}</span>
                      {request.message && <small className="truncate">« {request.message} »</small>}
                    </span>
                    <span className="share-actions">
                      <Button variant="outline" size="sm" onClick={() => onDecideAccess(request, "refused")}>
                        Refuser
                      </Button>
                      <Button size="sm" onClick={() => onDecideAccess(request, "accepted")}>
                        Accepter
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* The two roles, once the people are listed: what each one may do. */}
          <ul className="share-guide" aria-label="Les rôles">
            <li>
              <Info aria-hidden="true" />
              <span>
                <b>Décideur</b> : valide la version et décide de vos propositions.
              </span>
            </li>
            <li>
              <Info aria-hidden="true" />
              <span>
                <b>Contributeur</b> : commente, sans décider.
              </span>
            </li>
          </ul>
        </>
      ) : (
        <FormError>Ce lien a été révoqué. Fermez cette fenêtre pour en générer un nouveau.</FormError>
      )}
    </Modal>
  );
}

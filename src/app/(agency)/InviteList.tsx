"use client";

// The people invited on a review link, in "Partager la revue": their role (src/lib/clientRoles.ts),
// their personal link, and removing them.

import { Copy, X } from "lucide-react";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientRoleLabels, roleOfInvite, type ClientRole } from "@/lib/clientRoles";

export type Invite = { email: string; at: string; id?: string; role?: ClientRole };

export const roleOptions = (Object.keys(clientRoleLabels) as ClientRole[]).map((role) => ({ value: role, label: clientRoleLabels[role] }));

export function InviteList({
  invites,
  onCopy,
  onRemove,
  onRole,
}: {
  invites: Invite[];
  onCopy: (invite: Invite) => void;
  onRemove: (email: string) => void;
  onRole: (email: string, role: ClientRole) => void;
}) {
  return (
    <ul className="share-list" aria-label="Personnes invitées">
      {invites.map((invite) => (
        <li key={invite.email}>
          <span className="share-avatar" aria-hidden="true">
            {invite.email.charAt(0).toUpperCase()}
          </span>
          <span className="share-person">
            <span className="truncate">{invite.email}</span>
            <small>Invité le {invite.at.split(" ")[0]}</small>
          </span>
          <span className="share-actions">
            <Select value={roleOfInvite(invite)} onValueChange={(role) => onRole(invite.email, role as ClientRole)}>
              <SelectTrigger size="sm" aria-label={`Rôle de ${invite.email}`} className="share-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Hint label="Copier son lien personnel">
              <Button variant="ghost" size="icon-sm" aria-label={`Copier le lien de ${invite.email}`} onClick={() => onCopy(invite)}>
                <Copy />
              </Button>
            </Hint>
            <Hint label="Retirer l’invitation (son accès est coupé)">
              <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${invite.email}`} onClick={() => onRemove(invite.email)}>
                <X />
              </Button>
            </Hint>
          </span>
        </li>
      ))}
    </ul>
  );
}

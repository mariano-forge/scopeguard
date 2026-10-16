"use client";

// The people invited on a review link, in "Partager la revue": their role (src/lib/clientRoles.ts),
// their personal link, and removing them.

import { Copy, X } from "lucide-react";
import { Hint } from "@/components/hint";
import { Select } from "@/components/Select";
import { Button } from "@/components/ui/button";
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
    <ul className="invite-list" aria-label="Personnes invitées">
      {invites.map((invite) => (
        <li key={invite.email}>
          <span className="truncate">{invite.email}</span>
          <small>invité le {invite.at.split(" ")[0]}</small>
          <Select label={`Rôle de ${invite.email}`} value={roleOfInvite(invite)} options={roleOptions} onChange={(role) => onRole(invite.email, role)} />
          <Hint label="Copier son lien personnel">
            <Button variant="ghost" size="icon-xs" aria-label={`Copier le lien de ${invite.email}`} onClick={() => onCopy(invite)}>
              <Copy />
            </Button>
          </Hint>
          <Hint label="Retirer l’invitation (son accès est coupé)">
            <Button variant="ghost" size="icon-xs" aria-label={`Retirer ${invite.email}`} onClick={() => onRemove(invite.email)}>
              <X />
            </Button>
          </Hint>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, Modal } from "@/components/modal";
import { Select } from "@/components/Select";
import { Hint } from "@/components/hint";
import { useCurrentUser } from "./CurrentUser";

type Role = "owner" | "admin" | "member";
type Member = { id: string; role: string; user: { id: string; name: string; email: string } };
type Invitation = { id: string; email: string; role: string | null; status: string; expiresAt: string | Date };

const roleLabels: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
const roleOptions: { value: Exclude<Role, "owner">; label: string }[] = [
  { value: "member", label: "Membre" },
  { value: "admin", label: "Administrateur" },
];

/**
 * The agency's team: members and pending invitations. Owners and administrators invite (an e-mail
 * with a link to /invitation/:id), change roles and remove members; anyone but the owner can leave.
 */
export function TeamDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useCurrentUser();
  const organizationId = user.organizationId!;
  const canManage = user.role === "owner" || user.role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("member");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  /** Bumped after each change: the team is fetched again. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void authClient.organization.getFullOrganization({ query: { organizationId } }).then(({ data }) => {
      if (cancelled || !data) return;
      setMembers(data.members as Member[]);
      setInvitations((data.invitations as Invitation[]).filter((invitation) => invitation.status === "pending"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, version]);

  async function run(action: () => Promise<{ error: { code?: string; message?: string } | null }>, success?: string) {
    setPending(true);
    setError("");
    const { error: failed } = await action();
    setPending(false);
    if (failed) {
      setError(
        failed.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"
          ? "Cette personne fait déjà partie de l’agence."
          : failed.code === "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
            ? "Vous êtes le seul propriétaire : vous ne pouvez pas quitter l’agence."
            : failed.message || "L’action n’a pas abouti. Réessayez.",
      );
      return false;
    }
    if (success) toast(success);
    setVersion((current) => current + 1);
    return true;
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return setError("Adresse e-mail invalide.");
    if (await run(() => authClient.organization.inviteMember({ email: address, role, organizationId, resend: true }), `Invitation envoyée à ${address}`))
      setEmail("");
  }

  async function copyInvitation(invitation: Invitation) {
    await navigator.clipboard.writeText(`${window.location.origin}/invitation/${invitation.id}`);
    toast(`Lien d’invitation de ${invitation.email} copié`);
  }

  async function leave() {
    if (await run(() => authClient.organization.leave({ organizationId }))) window.location.assign("/bienvenue");
  }

  return (
    <Modal open={open} onClose={onClose} title={`Équipe · ${user.organizationName ?? "Agence"}`} description="Les membres voient et gèrent tous les espaces, projets et livrables de l’agence.">
      {canManage && (
        <form className="grid gap-2" onSubmit={invite}>
          <Field id="team-invite" label="Inviter un collègue">
            <div className="flex gap-2">
              <Input id="team-invite" type="email" placeholder="prenom@agence.fr" value={email} onChange={(event) => (setEmail(event.target.value), setError(""))} />
              <Select label="Rôle" value={role} options={roleOptions} onChange={setRole} />
              <Button type="submit" variant="outline" className="h-9" disabled={pending || !email.trim()}>
                Inviter
              </Button>
            </div>
          </Field>
        </form>
      )}
      {error && <FormError>{error}</FormError>}

      <ul className="invite-list" aria-label="Membres de l’agence">
        {members.map((member) => {
          const self = member.user.id === user.id;
          const editable = canManage && !self && member.role !== "owner";
          return (
            <li key={member.id}>
              <span className="grid min-w-0">
                <span className="truncate">
                  {member.user.name}
                  {self && " (vous)"}
                </span>
                <small className="!ml-0 truncate">{member.user.email}</small>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {editable ? (
                  <Select
                    label={`Rôle de ${member.user.name}`}
                    value={member.role as Exclude<Role, "owner">}
                    options={roleOptions}
                    onChange={(next) => void run(() => authClient.organization.updateMemberRole({ memberId: member.id, role: next, organizationId }), `${member.user.name} : ${roleLabels[next]}`)}
                  />
                ) : (
                  <small>{roleLabels[member.role] ?? member.role}</small>
                )}
                {editable &&
                  (confirmRemove === member.id ? (
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => void run(() => authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId }), `${member.user.name} a été retiré de l’agence`)}
                    >
                      Confirmer
                    </Button>
                  ) : (
                    <Hint label="Retirer de l’agence">
                      <Button variant="ghost" size="icon-xs" aria-label={`Retirer ${member.user.name}`} onClick={() => setConfirmRemove(member.id)}>
                        <X />
                      </Button>
                    </Hint>
                  ))}
              </span>
            </li>
          );
        })}
      </ul>

      {invitations.length > 0 && (
        <ul className="invite-list" aria-label="Invitations en attente">
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              <span className="grid min-w-0">
                <span className="truncate">{invitation.email}</span>
                <small className="!ml-0">Invitation en attente · {roleLabels[invitation.role ?? "member"]}</small>
              </span>
              <span className="ml-auto flex shrink-0 gap-1">
                <Hint label="Copier le lien d’invitation">
                  <Button variant="ghost" size="icon-xs" aria-label={`Copier le lien de ${invitation.email}`} onClick={() => void copyInvitation(invitation)}>
                    <Copy />
                  </Button>
                </Hint>
                {canManage && (
                  <Hint label="Annuler l’invitation">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Annuler l’invitation de ${invitation.email}`}
                      onClick={() => void run(() => authClient.organization.cancelInvitation({ invitationId: invitation.id }), "Invitation annulée")}
                    >
                      <X />
                    </Button>
                  </Hint>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {user.role !== "owner" && (
        <div className="flex justify-end">
          <Button variant="ghost" className="text-[var(--danger)]" disabled={pending} onClick={() => void leave()}>
            Quitter l’agence
          </Button>
        </div>
      )}
    </Modal>
  );
}

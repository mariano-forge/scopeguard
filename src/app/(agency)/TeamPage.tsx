"use client";

// « Équipe » (/equipe): the agency's members and pending invitations, in one table (name, e-mail, role).
// Owners and administrators invite (an e-mail with a link to /invitation/:id), change roles and remove members;
// anyone but the owner can leave. The account menu's « Équipe » leads here too: one place for the team.

import { useEffect, useState } from "react";
import { Copy, Mail, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { initialsOf } from "@/lib/authors";
import { Hint } from "@/components/hint";
import { Field, FormError, Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrentUser } from "./CurrentUser";

type Role = "owner" | "admin" | "member";
type Member = { id: string; role: string; user: { id: string; name: string; email: string } };
type Invitation = { id: string; email: string; role: string | null; status: string; expiresAt: string | Date };

const roleLabels: Record<string, string> = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
const invitableRoles: Exclude<Role, "owner">[] = ["member", "admin"];

export const teamDescription = "Les membres voient et gèrent tous les espaces, projets et livrables de l’organisation.";

/** A role chosen in a list: a member's, or the one an invitation gives. */
function RoleSelect({ label, value, onChange, disabled }: { label: string; value: Exclude<Role, "owner">; onChange: (role: Exclude<Role, "owner">) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Exclude<Role, "owner">)} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={label} className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {invitableRoles.map((role) => (
          <SelectItem key={role} value={role}>
            {roleLabels[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TeamPage() {
  const user = useCurrentUser();
  const organizationId = user.organizationId!;
  const canManage = user.role === "owner" || user.role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("member");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  /** Bumped after each change: the team is fetched again. */
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void authClient.organization.getFullOrganization({ query: { organizationId } }).then(({ data }) => {
      if (cancelled || !data) return;
      setMembers(data.members as Member[]);
      setInvitations((data.invitations as Invitation[]).filter((invitation) => invitation.status === "pending"));
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, version]);

  async function run(action: () => Promise<{ error: { code?: string; message?: string } | null }>, success?: string) {
    setPending(true);
    setError("");
    const { error: failed } = await action();
    setPending(false);
    if (failed) {
      setError(
        failed.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION"
          ? "Cette personne fait déjà partie de l’organisation."
          : failed.code === "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
            ? "Vous êtes le seul propriétaire : vous ne pouvez pas quitter l’organisation."
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
    if (await run(() => authClient.organization.inviteMember({ email: address, role, organizationId, resend: true }), `Invitation envoyée à ${address}`)) {
      setEmail("");
      setInviting(false);
    }
  }

  async function copyInvitation(invitation: Invitation) {
    await navigator.clipboard.writeText(`${window.location.origin}/invitation/${invitation.id}`);
    toast(`Lien d’invitation de ${invitation.email} copié`);
  }

  async function leave() {
    if (await run(() => authClient.organization.leave({ organizationId }))) window.location.assign("/bienvenue");
  }

  const avatar = (text: string, quiet = false) => (
    <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${quiet ? "bg-muted text-muted-foreground" : "bg-[var(--status-low-bg)] text-[var(--status-low-text)]"}`} aria-hidden="true">
      {text}
    </span>
  );

  return (
    <div className="browser">
      <header className="page-header">
        <div className="grid gap-1">
          <h1 className="page-title">Équipe</h1>
          <p className="m-0 text-sm text-muted-foreground">{teamDescription}</p>
        </div>
        {canManage && (
          <Button size="lg" onClick={() => (setError(""), setInviting(true))}>
            <UserPlus aria-hidden="true" /> Inviter un collègue
          </Button>
        )}
      </header>
      {error && !inviting && <FormError>{error}</FormError>}

      <Table aria-label="Membres de l’organisation">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Nom complet</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead className="w-24">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const self = member.user.id === user.id;
            const editable = canManage && !self && member.role !== "owner";
            return (
              <TableRow key={member.id}>
                <TableHead scope="row" className="h-auto py-2.5 text-sm font-medium text-foreground">
                  <span className="flex items-center gap-3">
                    {avatar(initialsOf(member.user.name))}
                    <span className="truncate">
                      {member.user.name}
                      {self && <span className="font-normal text-muted-foreground"> (vous)</span>}
                    </span>
                  </span>
                </TableHead>
                <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                <TableCell>
                  {editable ? (
                    <RoleSelect
                      label={`Rôle de ${member.user.name}`}
                      value={member.role as Exclude<Role, "owner">}
                      disabled={pending}
                      onChange={(next) => void run(() => authClient.organization.updateMemberRole({ memberId: member.id, role: next, organizationId }), `${member.user.name} : ${roleLabels[next]}`)}
                    />
                  ) : (
                    roleLabels[member.role] ?? member.role
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable &&
                    (confirmRemove === member.id ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() => void run(() => authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId }), `${member.user.name} a été retiré de l’organisation`)}
                      >
                        Confirmer
                      </Button>
                    ) : (
                      <Hint label="Retirer de l’organisation" side="left">
                        <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${member.user.name}`} onClick={() => setConfirmRemove(member.id)}>
                          <X />
                        </Button>
                      </Hint>
                    ))}
                </TableCell>
              </TableRow>
            );
          })}
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableHead scope="row" className="h-auto py-2.5 text-sm font-normal text-muted-foreground">
                <span className="flex items-center gap-3">
                  {avatar("", true)}
                  <span className="flex items-center gap-1.5">
                    <Mail aria-hidden="true" className="size-3.5" /> Invitation en attente
                  </span>
                </span>
              </TableHead>
              <TableCell className="text-muted-foreground">{invitation.email}</TableCell>
              <TableCell>{roleLabels[invitation.role ?? "member"]}</TableCell>
              <TableCell className="text-right">
                <span className="inline-flex gap-1">
                  <Hint label="Copier le lien d’invitation" side="left">
                    <Button variant="ghost" size="icon-sm" aria-label={`Copier le lien de ${invitation.email}`} onClick={() => void copyInvitation(invitation)}>
                      <Copy />
                    </Button>
                  </Hint>
                  {canManage && (
                    <Hint label="Annuler l’invitation" side="left">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Annuler l’invitation de ${invitation.email}`}
                        onClick={() => void run(() => authClient.organization.cancelInvitation({ invitationId: invitation.id }), "Invitation annulée")}
                      >
                        <X />
                      </Button>
                    </Hint>
                  )}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {user.role !== "owner" && (
        <div className="flex justify-end">
          <Button variant="ghost" className="text-[var(--danger)]" disabled={pending} onClick={() => void leave()}>
            Quitter l’organisation
          </Button>
        </div>
      )}

      <Modal
        open={inviting}
        onClose={() => setInviting(false)}
        title="Inviter un collègue"
        description="Il reçoit un e-mail avec un lien pour rejoindre l’organisation."
        onSubmit={(event) => void invite(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setInviting(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending || !email.trim()}>
              Envoyer l’invitation
            </Button>
          </>
        }
      >
        <Field id="team-invite" label="Adresse e-mail">
          <Input id="team-invite" type="email" autoFocus placeholder="prenom@exemple.fr" value={email} onChange={(event) => (setEmail(event.target.value), setError(""))} />
        </Field>
        <Field id="team-invite-role" label="Rôle">
          <Select value={role} onValueChange={(next) => setRole(next as Exclude<Role, "owner">)}>
            <SelectTrigger id="team-invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {invitableRoles.map((option) => (
                <SelectItem key={option} value={option}>
                  {roleLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {error && <FormError>{error}</FormError>}
      </Modal>
    </div>
  );
}

"use client";

// "Partager la V03 ?": after importing a new version, the agency shares it with the people invited
// on the previous one, in one click. Nothing is shared automatically: a version imported for an
// internal check stays with the agency until it chooses to share it.

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Select } from "@/components/Select";
import { Button } from "@/components/ui/button";
import { roleOfInvite, type ClientRole } from "@/lib/clientRoles";
import { roleOptions, type Invite } from "./InviteList";

export type ReshareChoice = { email: string; role: ClientRole }[];

export function ReshareDialog({
  version,
  previousVersion,
  people,
  onShare,
  onLater,
}: {
  /** "V03": the version to share; "V02": the one the people come from. */
  version: string;
  previousVersion: string;
  people: Invite[];
  onShare: (choice: ReshareChoice) => Promise<void>;
  onLater: () => void;
}) {
  // Everyone of the previous version, with their role, until the agency unticks or changes them.
  const [chosen, setChosen] = useState<Record<string, ClientRole | null>>(() =>
    Object.fromEntries(people.map((person) => [person.email, roleOfInvite(person)])),
  );
  const [pending, setPending] = useState(false);
  const choice: ReshareChoice = people.flatMap((person) => (chosen[person.email] ? [{ email: person.email, role: chosen[person.email]! }] : []));

  async function share() {
    setPending(true);
    await onShare(choice);
    setPending(false);
  }

  return (
    <Modal
      open
      onClose={onLater}
      title={`Partager la ${version} ?`}
      description={`Les personnes invitées sur la ${previousVersion} recevront un e-mail avec la nouvelle version. Décochez celles qui ne doivent pas la voir.`}
      footer={
        <>
          <Button variant="outline" onClick={onLater}>
            Plus tard
          </Button>
          <Button onClick={() => void share()} disabled={pending || choice.length === 0}>
            {choice.length > 1 ? `Partager avec ${choice.length} personnes` : choice.length === 1 ? "Partager avec 1 personne" : "Partager"}
          </Button>
        </>
      }
    >
      <ul className="invite-list" aria-label={`Personnes invitées sur la ${previousVersion}`}>
        {people.map((person) => (
          <li key={person.email}>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(chosen[person.email])}
                onChange={(event) => setChosen((current) => ({ ...current, [person.email]: event.target.checked ? roleOfInvite(person) : null }))}
              />
              <span className="truncate">{person.email}</span>
            </label>
            {chosen[person.email] && (
              <Select
                label={`Rôle de ${person.email} sur la ${version}`}
                value={chosen[person.email]!}
                options={roleOptions}
                onChange={(role) => setChosen((current) => ({ ...current, [person.email]: role }))}
              />
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

type VersionRecord = { id: number; projectId?: number; name: string; version: number };

/**
 * The people invited on the most recent version before `beforeVersion` that had any: proposed when
 * sharing a newer version of the same deliverable (same project and name).
 */
export function previousPeople<T extends VersionRecord>(record: T, beforeVersion: number, records: T[], links: Record<string, { invites?: Invite[] } | undefined>) {
  const earlier = records
    .filter((other) => (other.projectId ?? 1) === (record.projectId ?? 1) && other.name === record.name && other.version < beforeVersion)
    .sort((left, right) => right.version - left.version);
  for (const version of earlier) {
    const invites = links[`${version.id}:${version.version}`]?.invites ?? [];
    if (invites.length) return { version: version.version, people: invites };
  }
  return null;
}

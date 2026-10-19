"use client";

// « + Projet »: a project always lives in a space (a client, a brand, an internal team). Outside a space the dialog asks
// which one, or creates it on the way: an agency with no space yet creates its first one here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, Modal } from "@/components/modal";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { agencyAction } from "@/lib/agencyActions";
import { href } from "./routes";

/** The choice « Nouvel espace » in the list of spaces. */
const newSpace = "new";

export function NewProjectDialog({
  spaces,
  defaultSpaceId,
  fixedSpace,
  onClose,
}: {
  spaces: { id: number; name: string }[];
  defaultSpaceId: number;
  /** Opened inside a space: the project goes there, nothing to choose. */
  fixedSpace?: { id: number; name: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  // The choice made in the list; until then the default, read from the spaces as they are now (the
  // agency's data can arrive after the dialog opens).
  const [chosen, setSpace] = useState<string | null>(null);
  const fallback = spaces.find((candidate) => candidate.id === defaultSpaceId) ?? spaces[0];
  const space = chosen ?? (fallback ? String(fallback.id) : newSpace);
  const [spaceName, setSpaceName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const creatingSpace = !fixedSpace && space === newSpace;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName) return setError("Donnez un nom au projet.");
    if (creatingSpace && !spaceName.trim()) return setError("Donnez un nom à l’espace.");
    setSaving(true);
    // The space first when it is new: the project needs its id.
    const spaceId = fixedSpace?.id ?? (creatingSpace ? (await agencyAction("spaces", "POST", { name: spaceName.trim() }))?.id : Number(space));
    const created = spaceId ? await agencyAction("projects", "POST", { clientId: spaceId, name: projectName }) : null;
    setSaving(false);
    if (!created?.id) return;
    onClose();
    router.push(href.project(created.id));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Créer un projet"
      description={fixedSpace ? `Le projet sera créé dans l’espace ${fixedSpace.name}.` : "Un projet regroupe les livrables d’une même mission, dans un espace."}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            Créer le projet
          </Button>
        </>
      }
    >
      <Field id="new-project-name" label="Nom du projet">
        <Input id="new-project-name" autoFocus maxLength={120} value={name} onChange={(event) => (setName(event.target.value), setError(""))} placeholder="Ex. Refonte du site vitrine" />
      </Field>
      {!fixedSpace && spaces.length > 0 && (
        <Field id="new-project-space" label="Espace">
          <Select value={space} onValueChange={(value) => (setSpace(value), setError(""))}>
            <SelectTrigger id="new-project-space" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {spaces.map((candidate) => (
                <SelectItem key={candidate.id} value={String(candidate.id)}>
                  {candidate.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={newSpace}>Nouvel espace…</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
      {creatingSpace && (
        <Field
          id="new-project-space-name"
          label={spaces.length ? "Nom du nouvel espace" : "Espace"}
          hint={spaces.length ? undefined : "Votre premier espace : un client, une marque ou une équipe interne."}
        >
          <Input id="new-project-space-name" maxLength={120} value={spaceName} onChange={(event) => (setSpaceName(event.target.value), setError(""))} placeholder="Ex. Maison Verte, Marketing…" />
        </Field>
      )}
      {error && <FormError>{error}</FormError>}
    </Modal>
  );
}

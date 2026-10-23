"use client";

// « Nouvelle tournée Figma » (US-054): a new version of a « Figma » deliverable is a new round of review of
// the same file, about another version saved in its history. Its pages are those read for the deliverable,
// ticked as in the current round.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Modal } from "@/components/modal";
import type { FigmaChoice, FigmaRound } from "@/lib/figmaLink";
import { FigmaRoundFields, roundChoice, useFigmaFile } from "./FigmaRoundFields";

export function FigmaVersionDialog({ round, onClose, onCreate }: { round: FigmaRound; onClose: () => void; onCreate: (choice: FigmaChoice) => Promise<void> }) {
  // The pages read for the deliverable: a round reads only the file's saved versions.
  const figma = useFigmaFile(round.fileKey, { name: round.fileName, pages: round.pages });
  const [pages, setPages] = useState<string[] | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const choice = figma.file ? roundChoice(figma.file, pages, versionId, round.reviewed) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!choice) return;
    if (!choice.reviewed.length) return setError("Cochez au moins une page en revue.");
    if (!choice.version) return setError("Enregistrez dans Figma la version que vous envoyez au client, puis relisez le fichier.");
    if (choice.version.id === round.version.id) return setError(`« ${round.version.label} » est déjà la version de la tournée en cours. Enregistrez la nouvelle dans Figma, puis relisez le fichier.`);
    setSaving(true);
    try {
      await onCreate({ pages: choice.reviewed, versionId: choice.version.id });
    } catch {
      setError("La tournée n’a pas pu être enregistrée.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle tournée Figma"
      description={`Le fichier « ${round.fileName} », dans la version que vous envoyez maintenant au client.`}
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !choice}>
            {saving ? "Enregistrement…" : "Créer la tournée"}
          </Button>
        </>
      }
    >
      <FigmaRoundFields
        {...figma}
        reviewed={choice?.reviewed ?? []}
        version={choice?.version ?? null}
        onPages={(next) => (setPages(next), setError(""))}
        onVersion={(next) => (setVersionId(next), setError(""))}
      />
      {error && <FormError>{error}</FormError>}
    </Modal>
  );
}

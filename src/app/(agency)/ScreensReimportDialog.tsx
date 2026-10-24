"use client";

// « Réimporter depuis Figma » (US-054, step 2c): a new version of « Écrans Figma » copies the same screens again,
// in the same order, formats and layout, in their state in Figma now. The file's screens are read again (a
// screen deleted in Figma is said, not silently dropped), then drawn and copied as for the first version.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Modal } from "@/components/modal";
import { formatOfMime, type StoredScreen } from "@/lib/figmaScreens";
import { copyFigmaScreens } from "@/lib/figmaScreensImport";

export type ReimportedScreens = { picked: { id: string; fileData: string }[]; receipt: string; columns: number };

export function ScreensReimportDialog({
  fileKey,
  screens,
  columns,
  placement,
  onClose,
  onCreate,
}: {
  fileKey: string;
  screens: StoredScreen[];
  columns: number;
  /** Where the copies go: the deliverable and the version they make. */
  placement: { projectId: number; livrableId: number; version: number };
  onClose: () => void;
  onCreate: (screens: ReimportedScreens) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function reimport(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setProgress({ done: 0, total: screens.length });
    try {
      const response = await fetch(`/api/integrations/figma/files/${fileKey}/screens`, { cache: "no-store" }).catch(() => null);
      const read = (await response?.json().catch(() => null)) as { screens?: { id: string }[]; receipt?: string; error?: string } | null;
      if (!response?.ok || !read?.receipt || !read.screens) throw new Error(read?.error ?? "Le fichier Figma n’a pas pu être lu. Réessayez.");
      const gone = screens.filter((screen) => !read.screens!.some((candidate) => candidate.id === screen.id));
      if (gone.length) throw new Error(`Ces écrans ne sont plus dans le fichier Figma : ${gone.map((screen) => `« ${screen.name} »`).join(", ")}. Créez un nouveau livrable pour en choisir d’autres.`);
      const copied = await copyFigmaScreens({
        fileKey,
        receipt: read.receipt,
        // Each screen in the format it was copied in.
        screens: screens.map((screen) => ({ id: screen.id, format: formatOfMime(screen.mimeType) })),
        placement,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (copied.length !== screens.length) throw new Error("Figma n’a pas pu dessiner tous les écrans. Réessayez dans un moment.");
      await onCreate({ picked: copied.map(({ id, fileData }) => ({ id, fileData })), receipt: read.receipt, columns });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "La version n’a pas pu être enregistrée.");
      setProgress(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Réimporter depuis Figma"
      description={`Les ${screens.length} écrans de cette version, recopiés dans leur état actuel dans Figma, dans le même ordre : c’est la version suivante.`}
      onSubmit={reimport}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={Boolean(progress)}>
            {progress ? "Import…" : "Réimporter"}
          </Button>
        </>
      }
    >
      <ul className="text-sm">
        {screens.map((screen) => (
          <li key={screen.id}>
            {screen.name} <span className="text-muted-foreground">· {screen.pageName}</span>
          </li>
        ))}
      </ul>
      {progress && (
        <p role="status" className="text-sm text-muted-foreground">
          Import des écrans : {progress.done} sur {progress.total}…
        </p>
      )}
      {error && <FormError>{error}</FormError>}
    </Modal>
  );
}

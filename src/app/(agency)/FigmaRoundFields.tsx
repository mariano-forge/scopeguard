"use client";

// A round of a « Figma » deliverable (US-054), chosen in « Nouveau livrable » and « Nouvelle tournée Figma »:
// the pages up for review (comments on the others stay in Figma) and the version saved in the file's
// history that the client is sent. The file is read by the server with the agency's Figma account.

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FigmaPage, FigmaVersion } from "@/lib/figmaLink";

export type FigmaFileInfo = { name: string; pages: FigmaPage[]; versions: FigmaVersion[] };
type Read = { key: string; attempt: number; file: FigmaFileInfo | null; error: string | null };

/** The file named by `key`, read again on `reload`; null while there is none to read, or it is being read. */
export function useFigmaFile(key: string | null) {
  const [read, setRead] = useState<Read | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/integrations/figma/files/${key}`, { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as (FigmaFileInfo & { error?: string }) | null;
      if (cancelled) return;
      if (response?.ok && body) setRead({ key, attempt, file: body, error: null });
      else setRead({ key, attempt, file: null, error: body?.error ?? "Le fichier Figma n’a pas pu être lu. Réessayez." });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);
  // Another file, or read again: nothing known of it yet.
  const current = key && read?.key === key && read.attempt === attempt ? read : null;
  return { file: current?.file ?? null, error: current?.error ?? null, loading: Boolean(key) && !current, reload: () => setAttempt((count) => count + 1) };
}

export const versionDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** The pages ticked and the version chosen, with their defaults: every page (or the round's), the latest version. */
export function roundChoice(file: FigmaFileInfo, pages: string[] | null, versionId: string | null, initialPages?: string[]) {
  const known = new Set(file.pages.map((page) => page.id));
  const reviewed = (pages ?? initialPages ?? [...known]).filter((page) => known.has(page));
  const version = file.versions.find((candidate) => candidate.id === versionId) ?? file.versions[0] ?? null;
  return { reviewed, version };
}

export function FigmaRoundFields({
  file,
  error,
  loading,
  reload,
  reviewed,
  version,
  onPages,
  onVersion,
}: ReturnType<typeof useFigmaFile> & {
  reviewed: string[];
  version: FigmaVersion | null;
  onPages: (pages: string[]) => void;
  onVersion: (versionId: string) => void;
}) {
  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Lecture du fichier Figma…
      </p>
    );
  if (error || !file)
    return (
      <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
        {error}
      </p>
    );

  const toggle = (page: string, checked: boolean) => onPages(checked ? [...reviewed, page] : reviewed.filter((id) => id !== page));
  return (
    <>
      <fieldset className="figma-pages">
        <legend>Pages en revue</legend>
        <p className="text-sm text-muted-foreground">Les commentaires des pages décochées (brouillons, archives…) restent dans Figma.</p>
        {file.pages.map((page) => (
          <label key={page.id} className="figma-page">
            <input type="checkbox" checked={reviewed.includes(page.id)} onChange={(event) => toggle(page.id, event.target.checked)} />
            <span>{page.name}</span>
          </label>
        ))}
      </fieldset>
      {file.versions.length ? (
        <Field id="figma-version" label="Version Figma envoyée au client" hint="Une version enregistrée dans l’historique du fichier : la preuve dira laquelle a été revue.">
          <Select value={version?.id} onValueChange={onVersion}>
            <SelectTrigger id="figma-version" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {file.versions.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.label} · {versionDate(candidate.createdAt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <div role="note" className="flex flex-col items-start gap-2 rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
          <p>
            Aucune version enregistrée dans ce fichier. Dans Figma, enregistrez celle que vous envoyez au client : <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> (sur Mac,{" "}
            <kbd>⌘</kbd> + <kbd>⌥</kbd> + <kbd>S</kbd>), avec un nom comme « V1 envoyée au client ».
          </p>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            <RotateCcw /> Relire le fichier
          </Button>
        </div>
      )}
    </>
  );
}

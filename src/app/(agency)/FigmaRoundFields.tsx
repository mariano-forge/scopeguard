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
type Tree = { name: string; pages: FigmaPage[] };
type TreeRead = { key: string; tree: (Tree & { receipt: string }) | null; error: string | null };
type HistoryRead = { key: string; attempt: number; versions: FigmaVersion[] | null; error: string | null };

const failed = "Le fichier Figma n’a pas pu être lu. Réessayez.";
async function getJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as (T & { error?: string }) | null;
  return response?.ok && body ? { body, error: null } : { body: null, error: body?.error ?? failed };
}

/**
 * The file named by `key`. Its pages are Figma's tightest read (20 a month for a View or Collab seat): read
 * once per file, once the link stops changing, unless they are `known` (a new round keeps its
 * deliverable's); `reload` reads only the saved versions again.
 */
export function useFigmaFile(key: string | null, known?: Tree) {
  const [treeRead, setTreeRead] = useState<TreeRead | null>(null);
  const [history, setHistory] = useState<HistoryRead | null>(null);
  const [attempt, setAttempt] = useState(0);
  const fromRound = Boolean(known);

  useEffect(() => {
    if (!key || fromRound) return;
    let cancelled = false;
    // A link typed letter by letter names a new file at each one: read the one it settles on.
    const timer = setTimeout(async () => {
      const { body, error } = await getJson<Tree & { versions: FigmaVersion[]; receipt: string }>(`/api/integrations/figma/files/${key}`);
      if (cancelled) return;
      setTreeRead({ key, tree: body ? { name: body.name, pages: body.pages, receipt: body.receipt } : null, error });
      setHistory({ key, attempt: 0, versions: body?.versions ?? null, error });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, fromRound]);

  useEffect(() => {
    if (!key || (!fromRound && attempt === 0)) return;
    let cancelled = false;
    void (async () => {
      const { body, error } = await getJson<{ versions: FigmaVersion[] }>(`/api/integrations/figma/files/${key}/versions`);
      if (!cancelled) setHistory({ key, attempt, versions: body?.versions ?? null, error });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, attempt, fromRound]);

  // Another file, or read again: nothing known of it yet.
  const tree = known ?? (treeRead?.key === key ? treeRead.tree : null);
  const treeError = !known && treeRead?.key === key ? treeRead.error : null;
  const current = history?.key === key && history.attempt === attempt ? history : null;
  const error = treeError ?? current?.error ?? null;
  const file = tree && current?.versions ? { name: tree.name, pages: tree.pages, versions: current.versions } : null;
  return {
    file,
    receipt: treeRead?.key === key ? (treeRead.tree?.receipt ?? null) : null,
    error,
    loading: Boolean(key) && !file && !error,
    reload: () => setAttempt((count) => count + 1),
  };
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

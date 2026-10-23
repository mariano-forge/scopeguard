"use client";

// « Écrans Figma » in « Nouveau livrable » (US-054, step 2c): the screens of the file, page by page, to tick,
// and one format for the whole import. The screens are read once per file by the server, with the member's
// own Figma account (Figma's tightest read), once the link stops changing.

import { useEffect, useState } from "react";
import { maxScreens, screenFormats, type FigmaScreen, type ScreenFormat } from "@/lib/figmaScreens";

export type FigmaScreensRead = { name: string; screens: FigmaScreen[]; receipt: string };
type Read = { key: string; file: FigmaScreensRead | null; error: string | null };

/** The file's screens; null while there is none to read, or it is being read. */
export function useFigmaScreens(key: string | null) {
  const [read, setRead] = useState<Read | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/integrations/figma/files/${key}/screens`, { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as (FigmaScreensRead & { error?: string }) | null;
      if (cancelled) return;
      setRead(response?.ok && body ? { key, file: body, error: null } : { key, file: null, error: body?.error ?? "Le fichier Figma n’a pas pu être lu. Réessayez." });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);
  const current = key && read?.key === key ? read : null;
  return { file: current?.file ?? null, error: current?.error ?? null, loading: Boolean(key) && !current };
}

export function FigmaScreensFields({
  file,
  error,
  loading,
  picked,
  format,
  onPick,
  onFormat,
}: ReturnType<typeof useFigmaScreens> & { picked: string[]; format: ScreenFormat; onPick: (ids: string[]) => void; onFormat: (format: ScreenFormat) => void }) {
  if (loading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Lecture des écrans du fichier Figma…
      </p>
    );
  if (error || !file)
    return (
      <p role="alert" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
        {error}
      </p>
    );
  if (!file.screens.length) return <p className="text-sm text-muted-foreground">Aucun écran dans ce fichier : Kora importe les cadres posés sur ses pages.</p>;

  // In Figma's order: picking keeps it, whatever order the boxes are ticked in.
  const order = file.screens.map((screen) => screen.id);
  const set = (ids: string[]) => onPick(order.filter((id) => ids.includes(id)));
  const pages = [...new Map(file.screens.map((screen) => [screen.pageId, screen.pageName])).entries()];
  return (
    <>
      <fieldset className="figma-pages">
        <legend>Écrans à faire valider</legend>
        <p className="text-sm text-muted-foreground">
          {picked.length} sur {maxScreens} au plus. Ils seront copiés dans Kora : votre client les commente ici, sans compte Figma.
        </p>
        {pages.map(([pageId, pageName]) => {
          const ofPage = file.screens.filter((screen) => screen.pageId === pageId);
          return (
            <div key={pageId} className="figma-screen-page" role="group" aria-label={`Page ${pageName}`}>
              <b>{pageName}</b>
              {ofPage.map((screen) => (
                <label key={screen.id} className="figma-page">
                  <input
                    type="checkbox"
                    checked={picked.includes(screen.id)}
                    disabled={!picked.includes(screen.id) && picked.length >= maxScreens}
                    onChange={(event) => set(event.target.checked ? [...picked, screen.id] : picked.filter((id) => id !== screen.id))}
                  />
                  <span>
                    {screen.name} <span className="text-muted-foreground">· {screen.width} × {screen.height}</span>
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </fieldset>
      <fieldset className="figma-pages">
        <legend>Format</legend>
        {(Object.keys(screenFormats) as ScreenFormat[]).map((option) => (
          <label key={option} className="figma-page">
            <input type="radio" name="figma-screen-format" checked={format === option} onChange={() => onFormat(option)} />
            <span>
              {screenFormats[option]}{" "}
              <span className="text-muted-foreground">{option === "image" ? "· léger et rapide (conseillé)" : "· net à tous les zooms, plus lourd"}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </>
  );
}

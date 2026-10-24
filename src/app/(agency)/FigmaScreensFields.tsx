"use client";

// « Écrans Figma » in « Nouveau livrable » (US-054, step 2c): the screens of the file, page by page, to tick,
// each with its format (Figma's four, PNG by default), set for all at once or one by one. The screens are read once per file by the server, with the member's
// own Figma account (Figma's tightest read), once the link stops changing.

import { useEffect, useState } from "react";
import { maxScreens, screenFormatList, screenFormats, type FigmaScreen, type ScreenFormat } from "@/lib/figmaScreens";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** A menu of Figma's four formats, each with what it is good for. */
function FormatSelect({ value, label, onChange, id }: { value: ScreenFormat; label: string; onChange: (format: ScreenFormat) => void; id?: string }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as ScreenFormat)}>
      <SelectTrigger id={id} aria-label={label} className="h-8 w-28 shrink-0" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {screenFormatList.map((format) => (
          <SelectItem key={format} value={format} title={screenFormats[format].hint}>
            {screenFormats[format].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
  formats,
  allFormat,
  onPick,
  onFormat,
  onFormatAll,
}: ReturnType<typeof useFigmaScreens> & {
  picked: string[];
  /** The format of each screen picked; one not set takes `allFormat`. */
  formats: Record<string, ScreenFormat>;
  allFormat: ScreenFormat;
  onPick: (ids: string[]) => void;
  onFormat: (id: string, format: ScreenFormat) => void;
  onFormatAll: (format: ScreenFormat) => void;
}) {
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
  // Figma draws one format per request: each format chosen is one of its tightest reads.
  const drawings = new Set(picked.map((id) => formats[id] ?? allFormat)).size;
  return (
    <>
      <fieldset className="figma-pages">
        <legend>Écrans à faire valider</legend>
        <p className="text-sm text-muted-foreground">
          {picked.length} sur {maxScreens} au plus. Ils seront copiés dans Kora : votre client les commente ici, sans compte Figma.
        </p>
        <div className="figma-screen-format-all">
          <label htmlFor="figma-format-all" className="text-sm font-medium">
            Format de tous les écrans
          </label>
          <FormatSelect id="figma-format-all" value={allFormat} label="Format de tous les écrans" onChange={onFormatAll} />
          <span className="text-sm text-muted-foreground">{screenFormats[allFormat].hint}</span>
        </div>
        {drawings > 1 && (
          <p role="note" className="text-sm text-muted-foreground">
            Cet import utilisera {drawings} dessins Figma (un par format) : avec une place « lecteur », Figma n’en permet que 20 par mois.
          </p>
        )}
        {pages.map(([pageId, pageName]) => {
          const ofPage = file.screens.filter((screen) => screen.pageId === pageId);
          return (
            <div key={pageId} className="figma-screen-page" role="group" aria-label={`Page ${pageName}`}>
              <b>{pageName}</b>
              {ofPage.map((screen) => (
                <div key={screen.id} className="figma-screen-row">
                  <label className="figma-page">
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
                  {picked.includes(screen.id) && (
                    <FormatSelect value={formats[screen.id] ?? allFormat} label={`Format de « ${screen.name} »`} onChange={(format) => onFormat(screen.id, format)} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </fieldset>
    </>
  );
}

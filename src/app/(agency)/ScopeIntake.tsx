"use client";

// « Extraire avec l'IA », in the scope being written (ProjectScope.tsx): a PDF of the project (its quote,
// its brief) or pasted text, read by the server's engine (src/lib/scopeExtractor.ts). What comes back is a
// proposal: the agency unticks what it does not want, sets each item included or not, then adds the rest
// to its draft, saved as any other. Nothing reaches the scope without that review.

import { useState } from "react";
import { ClipboardPaste, FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { quantityLabel, type ScopeSource } from "@/lib/projectScope";
import { extractionLimits, requestExtraction, type ExtractedItem, type ExtractedKind } from "@/lib/scopeExtraction";

export type IntakeMode = "pdf" | "text";
type Proposed = ExtractedItem & { key: number; keep: boolean };

const kindLabels: Record<ExtractedKind, string> = {
  included: "Prévu",
  excluded: "Exclu",
};
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? "s" : ""}`;

export function ScopeIntake({
  projectId,
  pdf,
  mode,
  onMode,
  uploading,
  onImport,
  onFile,
  onRemove,
  onAdd,
}: {
  projectId: number;
  /** The PDF to read: the quote or the brief imported, none yet. */
  pdf?: ScopeSource;
  mode: IntakeMode;
  onMode: (mode: IntakeMode) => void;
  uploading: boolean;
  onImport: () => void;
  /** A PDF dropped on the zone: imported as one chosen would be. */
  onFile: (file: File) => void;
  /** The PDF taken away: none to read until another is imported. */
  onRemove: () => void;
  onAdd: (items: ExtractedItem[]) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposed, setProposed] = useState<Proposed[] | null>(null);
  /** A file dragged over the drop zone. */
  const [dragging, setDragging] = useState(false);
  const file = pdf?.file;

  async function extract() {
    setBusy(true);
    setError("");
    const result = await requestExtraction(projectId, mode === "pdf" ? { file: file! } : { text });
    setBusy(false);
    if ("error" in result) return setError(result.error);
    if (!result.items.length) return setError("Aucun élément trouvé dans ce document. Ajoutez-les à la main, ou essayez un autre texte.");
    setProposed(result.items.map((item, index) => ({ ...item, key: index, keep: true })));
  }

  const kept = proposed?.filter((item) => item.keep) ?? [];
  const change = (key: number, patch: Partial<Proposed>) => setProposed((current) => current && current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  if (proposed)
    return (
      <div className="scope-intake-review" role="group" aria-label="Éléments proposés">
        <p className="scope-intake-lead">
          <Sparkles aria-hidden="true" /> {plural(proposed.length, "élément")} proposé{proposed.length > 1 ? "s" : ""} : décochez ce qui ne va pas, choisissez « Prévu » ou « Exclu », puis ajoutez.
        </p>
        <ul className="scope-intake-items">
          {proposed.map((item) => (
            <li key={item.key} className={item.keep ? undefined : "is-off"}>
              <Checkbox checked={item.keep} onCheckedChange={(value) => change(item.key, { keep: value === true })} aria-label={`Garder « ${item.title} »`} />
              <span className="scope-intake-title">
                <b>{item.title}</b>
                {(item.quantity !== undefined || item.unit || item.source) && <small>{[quantityLabel(item), item.source].filter(Boolean).join(" · ")}</small>}
              </span>
              <Select value={item.kind} onValueChange={(kind) => change(item.key, { kind: kind as ExtractedKind })}>
                <SelectTrigger size="sm" aria-label={`Prévu ou exclu : « ${item.title} »`} className={`scope-intake-kind is-${item.kind}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(kindLabels) as ExtractedKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kindLabels[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
        <span className="scope-intake-actions">
          <Button
            size="sm"
            disabled={!kept.length}
            onClick={() => {
              onAdd(
                kept.map((item) => ({
                  kind: item.kind,
                  title: item.title,
                  quantity: item.quantity,
                  unit: item.unit,
                  source: item.source,
                })),
              );
              setProposed(null);
              setText("");
            }}
          >
            Ajouter {plural(kept.length, "élément")} au périmètre
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setProposed(null)}>
            Ignorer
          </Button>
        </span>
      </div>
    );

  return (
    <Tabs value={mode} onValueChange={(value) => onMode(value as IntakeMode)} className="scope-intake">
      {/* Two modes, one or the other: as wide as the section, each named by its gesture. */}
      <TabsList aria-label="Source du périmètre" className="scope-intake-modes">
        <TabsTrigger value="pdf">
          <Upload aria-hidden="true" /> Importer un PDF
        </TabsTrigger>
        <TabsTrigger value="text">
          <ClipboardPaste aria-hidden="true" /> Coller un texte
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pdf" className="scope-intake-body">
        {/* The quote or the brief, dropped here or chosen; once there, named, « Modifier » to read another. */}
        <div
          className={["scope-dropzone", pdf && !uploading ? "has-file" : "", dragging ? "is-over" : ""].filter(Boolean).join(" ")}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files[0];
            if (dropped) onFile(dropped);
          }}
        >
          {pdf && !uploading ? (
            // The PDF to read: named, replaced or taken away in words, not by an icon to guess.
            <>
              <FileText className="scope-dropzone-file" aria-hidden="true" />
              <b className="scope-dropzone-name" title={pdf.name}>
                {pdf.name}
              </b>
              <Button variant="outline" size="sm" onClick={onImport} aria-label={`Remplacer le PDF à lire (${pdf.name})`}>
                Remplacer
              </Button>
              <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Retirer le PDF à lire (${pdf.name})`}>
                <Trash2 aria-hidden="true" /> Retirer
              </Button>
            </>
          ) : (
            <span className="scope-dropzone-empty">
              {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              <b>{uploading ? "Import en cours…" : "Glissez le PDF ici"}</b>
              {!uploading && (
                <span>
                  ou{" "}
                  <Button variant="link" className="h-auto p-0" onClick={onImport}>
                    choisissez un fichier
                  </Button>
                </span>
              )}
            </span>
          )}
        </div>
        <span className="scope-intake-actions">
          <ExtractButton busy={busy} disabled={!file || uploading} onClick={() => void extract()} />
        </span>
      </TabsContent>
      <TabsContent value="text" className="scope-intake-body">
        <Textarea
          aria-label="Texte du devis ou du cahier des charges"
          placeholder={"Collez ici le devis, le cahier des charges ou l’e-mail du client.\nUn élément par ligne : « Pages intérieures — 5 pages »."}
          rows={6}
          maxLength={extractionLimits.text}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <span className="scope-intake-actions">
          <ExtractButton busy={busy} disabled={!text.trim()} onClick={() => void extract()} />
        </span>
      </TabsContent>
      {error && (
        <p className="scope-intake-error" role="alert">
          {error}
        </p>
      )}
    </Tabs>
  );
}

function ExtractButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick} disabled={busy || disabled}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />} {busy ? "Lecture en cours…" : "Lancer l’extraction"}
    </Button>
  );
}

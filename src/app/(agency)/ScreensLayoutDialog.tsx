"use client";

// « Disposer les écrans » (US-054, step 2c): the screens just copied into Kora, as a grid of thumbnails with
// their names, in Figma's order to start with; the agency reorders them (dragging, or with the buttons, by
// keyboard) and sets how many go on a row. « Importer » makes the deliverable in that order. A grid, not a free
// canvas: screens far apart in Figma would keep a gap nobody wants (decided 23 October 2026).

import { useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Modal } from "@/components/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type LaidScreen = { id: string; name: string; pageName: string; fileData: string; mimeType: string };

const columnChoices = [1, 2, 3, 4, 5, 6];

export function ScreensLayoutDialog({
  screens,
  saving,
  onBack,
  onImport,
}: {
  screens: LaidScreen[];
  saving: boolean;
  onBack: () => void;
  onImport: (order: string[], columns: number) => void;
}) {
  const [order, setOrder] = useState(() => screens.map((screen) => screen.id));
  const [columns, setColumns] = useState(Math.min(3, screens.length));
  const [dragged, setDragged] = useState<string | null>(null);
  const byId = new Map(screens.map((screen) => [screen.id, screen]));

  /** Puts `id` at `index` of the order. */
  const moveTo = (id: string, index: number) =>
    setOrder((current) => {
      const rest = current.filter((candidate) => candidate !== id);
      rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
      return rest;
    });

  return (
    <Modal
      open
      onClose={onBack}
      size="full"
      title="Disposer les écrans"
      description="L’ordre et le nombre d’écrans par ligne sur le canevas de Kora. Glissez une vignette, ou utilisez ses flèches."
      onSubmit={(event) => {
        event.preventDefault();
        onImport(order, columns);
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
            Retour
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Import…" : `Importer ${order.length} écran${order.length > 1 ? "s" : ""}`}
          </Button>
        </>
      }
    >
      <Field id="screens-columns" label="Écrans par ligne">
        <Select value={String(columns)} onValueChange={(value) => setColumns(Number(value))}>
          <SelectTrigger id="screens-columns" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columnChoices.map((choice) => (
              <SelectItem key={choice} value={String(choice)}>
                {choice}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ol className="screens-layout" aria-label="Ordre des écrans" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {order.map((id, index) => {
          const screen = byId.get(id)!;
          return (
            <li
              key={id}
              className={`screens-layout-tile ${dragged === id ? "is-dragged" : ""}`}
              draggable
              aria-label={`${index + 1}. ${screen.name}`}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
                setDragged(id);
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const moved = event.dataTransfer.getData("text/plain") || dragged;
                if (moved && moved !== id) moveTo(moved, index);
                setDragged(null);
              }}
            >
              <span className="screens-layout-thumb">
                {screen.mimeType === "application/pdf" ? (
                  <span className="text-sm text-muted-foreground">PDF</span>
                ) : (
                  <Image src={screen.fileData} alt="" width={240} height={160} unoptimized draggable={false} />
                )}
              </span>
              <span className="screens-layout-name">
                <b>{screen.name}</b>
                <small>{screen.pageName}</small>
              </span>
              <span className="screens-layout-moves">
                <Button type="button" variant="ghost" size="icon" aria-label={`Déplacer « ${screen.name} » avant`} disabled={index === 0} onClick={() => moveTo(id, index - 1)}>
                  <ArrowLeft />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Déplacer « ${screen.name} » après`} disabled={index === order.length - 1} onClick={() => moveTo(id, index + 1)}>
                  <ArrowRight />
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

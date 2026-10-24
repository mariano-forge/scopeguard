"use client";

// A PDF page of the review canvas that stays sharp when zoomed in, without taking the browser's memory.
// pdf.js draws a page once, as a bitmap of its size on the canvas; the canvas zooms by a CSS transform, which
// stretches that bitmap (blurred when zoomed in). So, once the zoom has settled:
// - a finer copy of the page is drawn ON TOP of it, by steps (×1.5, ×2, ×3, ×4), never at each turn of the
//   wheel. Nothing blinks: a copy is transparent until drawn (react-pdf's page is white otherwise), and the
//   copy of the previous step stays until the next one is drawn (two copies for that moment only);
// - only for a page in view: one out of view has no copy, and loses it (its memory freed) when it leaves;
// - within a budget of pixels per page (src/lib/pdfSharpness.ts, about 40 MB): past it, less fine, never larger.
// Zoomed out again, the copy goes, and its memory with it (react-pdf zeroes a canvas it unmounts).

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ComponentProps } from "react";
import { PdfPage } from "./Pdf";
import { sharpRatio } from "@/lib/pdfSharpness";

/** The canvas's zoom once settled (1 = 100 %), given by the review canvas (ReviewCanvas.tsx). */
export const CanvasZoom = createContext(1);

type PageProps = Omit<ComponentProps<typeof PdfPage>, "devicePixelRatio" | "onLoadSuccess"> & { width: number };

export function SharpPdfPage(props: PageProps) {
  const zoom = useContext(CanvasZoom);
  const frame = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);
  const [inView, setInView] = useState(false);

  // In view of the canvas's window (transforms counted): only then does the page get its finer copy.
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const root = element.closest<HTMLElement>(".artboard-transform-wrapper");
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { root });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const density = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const ratio = aspect && inView ? sharpRatio(zoom, props.width, props.width * aspect, density) : null;
  // The copy drawn and shown; the wanted one draws over it, and replaces it once drawn.
  const [drawn, setDrawn] = useState<number | null>(null);
  const shown = ratio && drawn && drawn !== ratio ? drawn : null;
  const layer = (layerRatio: number, onDrawn?: () => void) => (
    <div key={layerRatio} className="pdf-sharp-layer" aria-hidden="true" data-ratio={layerRatio.toFixed(2)}>
      <PdfPage {...props} devicePixelRatio={layerRatio} renderTextLayer={false} renderAnnotationLayer={false} loading="" onRenderSuccess={onDrawn} />
    </div>
  );
  return (
    <div ref={frame} className="pdf-sharp-frame">
      <PdfPage {...props} onLoadSuccess={(page) => setAspect(page.originalHeight / page.originalWidth)} />
      {shown && layer(shown)}
      {ratio && layer(ratio, () => setDrawn(ratio))}
    </div>
  );
}

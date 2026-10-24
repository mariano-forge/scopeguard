"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import "react-pdf/dist/Page/TextLayer.css";
import { ArrowUpRight, Download } from "lucide-react";
import { DeliverableCover } from "./DeliverableCover";
import { MockArtboard } from "./MockArtboard";
import { PdfDocument, PdfPage } from "./Pdf";
import { SharpPdfPage } from "./SharpPdfPage";
import type { DeliverableType } from "./deliverableKinds";
import type { StoredScreen } from "@/lib/figmaScreens";

type ViewedDeliverable = {
  name: string;
  type: DeliverableType;
  fileData?: string;
  url?: string;
  coverData?: string;
  /** « Écrans Figma »: the screens copied into Kora, in their order, and how many per row. */
  screens?: StoredScreen[];
  columns?: number;
};

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/** The canvas's video element: its ref and the events its bar follows. */
export type CanvasVideo = Pick<React.ComponentProps<"video">, "ref" | "onTimeUpdate" | "onLoadedMetadata" | "onDurationChange" | "onPlay" | "onPause" | "onSeeked" | "onVolumeChange" | "onError" | "onWaiting" | "onSeeking" | "onCanPlay">;

/**
 * What the review canvas shows for a version (agency and client pages). Render it inside the artboard.
 * Clicks on media controls and links don't start a comment (they stop propagation).
 * With `renderPage`, every page is shown one under the other (a PDF's pages, or the single page of
 * anything else), each wrapped by the caller — that's where pins and threads of that page go.
 */
export function DeliverableContent({
  deliverable,
  pdfPage = 1,
  onPdfLoad,
  objectUrl,
  renderPage,
  video,
}: {
  deliverable: ViewedDeliverable;
  pdfPage?: number;
  onPdfLoad?: (pages: number) => void;
  /** Just-imported file not yet persisted (agency page). */
  objectUrl?: string | null;
  renderPage?: (page: number, content: React.ReactNode) => React.ReactNode;
  /** On the review canvas: the video driven by its bar (VideoBar.tsx), without the browser's controls. */
  video?: CanvasVideo;
}) {
  // Page count of the file it was read from: another PDF (tab, version, deliverable) starts again at 1,
  // so no page of the previous document is requested from the new one ("Invalid page request").
  const [loadedPages, setLoadedPages] = useState<{ file: string; count: number } | null>(null);
  const pageCount = loadedPages && loadedPages.file === deliverable.fileData ? loadedPages.count : 1;
  // The PDF is drawn at the width its pages take on the canvas, so the text layer used for targeting
  // lines up with the drawn text. That width follows the visible canvas area (92 %, at most 860 px, like
  // the artboard), never the pages themselves: they shrink-wrap their content, which would lock a small size.
  const [pagesWidth, setPagesWidth] = useState(760);
  const observer = useRef<ResizeObserver | null>(null);
  const measurePages = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!element) return;
    const frame = element.closest<HTMLElement>(".artboard-transform-wrapper");
    if (!frame) return;
    const measure = () => {
      const width = Math.min(860, Math.floor(frame.clientWidth * 0.92));
      if (width > 200) setPagesWidth((current) => (Math.abs(current - width) > 2 ? width : current));
    };
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(frame);
  }, []);
  const source = deliverable.fileData ?? objectUrl ?? undefined;

  if (renderPage && deliverable.type === "PDF" && deliverable.fileData)
    return (
      <PdfDocument
        file={deliverable.fileData}
        onLoadSuccess={({ numPages }) => {
          if (deliverable.fileData) setLoadedPages({ file: deliverable.fileData, count: numPages });
          onPdfLoad?.(numPages);
        }}
        loading="Chargement du PDF..."
      >
        <div className="canvas-pages" ref={measurePages}>
          {Array.from({ length: pageCount }, (_, index) =>
            <div key={index + 1}>
              {/* Text layer on: each text line can be targeted by a comment. */}
              {renderPage(index + 1, <SharpPdfPage pageNumber={index + 1} width={pagesWidth} renderTextLayer renderAnnotationLayer={false} />)}
            </div>,
          )}
        </div>
      </PdfDocument>
    );
  // « Écrans Figma »: each screen a page of the canvas, laid out in rows as the agency chose, at its size in
  // Figma (a mobile screen beside a desktop one keeps their proportions); pins and threads as on any page.
  if (renderPage && deliverable.type === "Screens" && deliverable.screens?.length)
    return (
      <div className="canvas-screens" style={{ gridTemplateColumns: `repeat(${Math.min(deliverable.columns ?? 3, deliverable.screens.length)}, max-content)` }}>
        {deliverable.screens.map((screen, index) => (
          <figure key={screen.id} className="canvas-screen" aria-label={screen.name}>
            <figcaption>{screen.name}</figcaption>
            {renderPage(
              index + 1,
              screen.mimeType === "application/pdf" ? (
                <PdfDocument file={screen.fileData} loading="Chargement…">
                  <SharpPdfPage pageNumber={1} width={screen.width} renderTextLayer renderAnnotationLayer={false} />
                </PdfDocument>
              ) : (
                // A stored file, served by /api/files: shown as it is (Next's optimiser is off, next.config.ts), and at
                // once: the canvas pans and zooms by transforms, which lazy loading misreads (screens left blank).
                <Image className="canvas-screen-image" src={screen.fileData} alt={screen.name} width={screen.width} height={screen.height} draggable={false} unoptimized loading="eager" />
              ),
            )}
          </figure>
        ))}
      </div>
    );
  if (renderPage) return <div className="canvas-pages">{renderPage(1, <SinglePage deliverable={deliverable} source={source} objectUrl={objectUrl} video={video} />)}</div>;

  return <SinglePage deliverable={deliverable} source={source} objectUrl={objectUrl} pdfPage={pdfPage} onPdfLoad={onPdfLoad} />;
}

function SinglePage({
  deliverable,
  source,
  objectUrl,
  pdfPage = 1,
  onPdfLoad,
  video,
}: {
  deliverable: ViewedDeliverable;
  source?: string;
  objectUrl?: string | null;
  pdfPage?: number;
  onPdfLoad?: (pages: number) => void;
  video?: CanvasVideo;
}) {
  if (deliverable.type === "Image" && source)
    // eslint-disable-next-line @next/next/no-img-element -- local data URL
    return <img className="real-deliverable-image" src={source} alt={deliverable.name} />;

  if (deliverable.type === "PDF" && deliverable.fileData)
    return (
      <PdfDocument file={deliverable.fileData} onLoadSuccess={({ numPages }) => onPdfLoad?.(numPages)} loading="Chargement du PDF...">
        <PdfPage pageNumber={pdfPage} width={760} renderTextLayer={false} renderAnnotationLayer={false} />
      </PdfDocument>
    );
  if (deliverable.type === "PDF" && objectUrl) return <iframe className="real-deliverable-pdf" src={objectUrl} title={deliverable.name} />;

  // On the canvas, a click on the picture pins a comment on that moment: the bar plays and seeks.
  if (deliverable.type === "Video" && source && video)
    return (
      <video className="real-deliverable-video" src={source} playsInline preload="metadata" {...video}>
        Votre navigateur ne lit pas cette vidéo.
      </video>
    );
  if (deliverable.type === "Video" && source)
    return (
      <video className="real-deliverable-video" src={source} controls onClick={stop} onPointerDown={stop}>
        Votre navigateur ne lit pas cette vidéo.
      </video>
    );

  if ((deliverable.type === "Link" && deliverable.url) || (deliverable.type === "Doc" && source))
    return (
      <div className="deliverable-placeholder">
        <div className="deliverable-placeholder-cover">
          <DeliverableCover type={deliverable.type} coverData={deliverable.coverData} />
        </div>
        <b>{deliverable.name}</b>
        {deliverable.type === "Link" ? (
          <a className="ghost-button" href={deliverable.url} target="_blank" rel="noreferrer noopener" onClick={stop}>
            Ouvrir la page <ArrowUpRight />
          </a>
        ) : (
          <a className="ghost-button" href={source} download={deliverable.name} onClick={stop}>
            Télécharger le document <Download />
          </a>
        )}
        <small>Cliquez ailleurs sur le canevas pour laisser une remarque.</small>
      </div>
    );

  return <MockArtboard />;
}

"use client";

import { useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import { DeliverableCover } from "./DeliverableCover";
import { MockArtboard } from "./MockArtboard";
import { PdfDocument, PdfPage } from "./Pdf";
import type { DeliverableType } from "./deliverableKinds";

type ViewedDeliverable = {
  name: string;
  type: DeliverableType;
  fileData?: string;
  url?: string;
  coverData?: string;
};

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

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
}: {
  deliverable: ViewedDeliverable;
  pdfPage?: number;
  onPdfLoad?: (pages: number) => void;
  /** Just-imported file not yet persisted (agency page). */
  objectUrl?: string | null;
  renderPage?: (page: number, content: React.ReactNode) => React.ReactNode;
}) {
  const [pageCount, setPageCount] = useState(1);
  const source = deliverable.fileData ?? objectUrl ?? undefined;

  if (renderPage && deliverable.type === "PDF" && deliverable.fileData)
    return (
      <PdfDocument
        file={deliverable.fileData}
        onLoadSuccess={({ numPages }) => {
          setPageCount(numPages);
          onPdfLoad?.(numPages);
        }}
        loading="Chargement du PDF..."
      >
        <div className="canvas-pages">
          {Array.from({ length: pageCount }, (_, index) =>
            <div key={index + 1}>{renderPage(index + 1, <PdfPage pageNumber={index + 1} width={760} renderTextLayer={false} renderAnnotationLayer={false} />)}</div>,
          )}
        </div>
      </PdfDocument>
    );
  if (renderPage) return <div className="canvas-pages">{renderPage(1, <SinglePage deliverable={deliverable} source={source} objectUrl={objectUrl} />)}</div>;

  return <SinglePage deliverable={deliverable} source={source} objectUrl={objectUrl} pdfPage={pdfPage} onPdfLoad={onPdfLoad} />;
}

function SinglePage({
  deliverable,
  source,
  objectUrl,
  pdfPage = 1,
  onPdfLoad,
}: {
  deliverable: ViewedDeliverable;
  source?: string;
  objectUrl?: string | null;
  pdfPage?: number;
  onPdfLoad?: (pages: number) => void;
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

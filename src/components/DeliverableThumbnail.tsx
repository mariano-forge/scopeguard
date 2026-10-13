"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { MockArtboard } from "./MockArtboard";
import { PdfDocument, PdfPage } from "./Pdf";

const ARTBOARD_WIDTH = 670;

/** Preview of a deliverable version: the image, the first PDF page, or the demo artboard scaled down. */
export function DeliverableThumbnail({ type, fileData }: { type: "PDF" | "Image"; fileData?: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="thumbnail" ref={frameRef} aria-hidden="true">
      {type === "Image" && fileData ? (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
        <img src={fileData} alt="" />
      ) : type === "PDF" && fileData ? (
        width > 0 && (
          <PdfDocument file={fileData} loading={<FileText />} error={<FileText />}>
            <PdfPage pageNumber={1} width={width} renderTextLayer={false} renderAnnotationLayer={false} />
          </PdfDocument>
        )
      ) : width > 0 ? (
        <div className="thumbnail-artboard" style={{ transform: `scale(${width / ARTBOARD_WIDTH})` }} inert>
          <div className="artboard">
            <MockArtboard />
          </div>
        </div>
      ) : null}
    </div>
  );
}

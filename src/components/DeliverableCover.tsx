import { Image as ImageIcon } from "lucide-react";

/**
 * Uniform deliverable preview (instead of the real file render): a stylised sheet on a neutral
 * background, portrait with text lines for a PDF, landscape with a picture glyph for an image,
 * plus its format and version. Every card looks the same whatever the file contains.
 */
export function DeliverableCover({ type, version }: { type: "PDF" | "Image"; version?: number }) {
  const isPdf = type === "PDF";
  return (
    <div className={`cover ${isPdf ? "cover-pdf" : "cover-image"}`} aria-hidden="true">
      {version !== undefined && <span className="cover-version">V{String(version).padStart(2, "0")}</span>}
      <span className="cover-sheet">
        {isPdf ? (
          <span className="cover-lines">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : (
          <ImageIcon className="cover-glyph" />
        )}
        <span className="cover-format">{isPdf ? "PDF" : "IMG"}</span>
      </span>
    </div>
  );
}

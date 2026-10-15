import { Play } from "lucide-react";
import { DeliverableIcon } from "./DeliverableIcon";
import { deliverableKinds, type DeliverableType } from "./deliverableKinds";

/**
 * Deliverable preview on cards: the uploaded cover when there is one, otherwise a default
 * template — a stylised sheet on the kind's color (Kora status pairs), with its format badge.
 * Every card reads the same whatever the file contains.
 */
export function DeliverableCover({ type, coverData }: { type: DeliverableType; coverData?: string }) {
  const kind = deliverableKinds[type] ?? deliverableKinds.PDF;
  if (coverData)
    return (
      <div className="cover cover-custom" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL cover */}
        <img src={coverData} alt="" />
        <span className="cover-format">{kind.badge}</span>
      </div>
    );

  const portrait = type === "PDF" || type === "Doc";
  return (
    <div className={`cover tone-${kind.tone} ${portrait ? "cover-portrait" : "cover-landscape"}`} aria-hidden="true">
      <span className="cover-sheet">
        {portrait ? (
          <span className="cover-lines">
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : type === "Video" ? (
          <Play className="cover-glyph" />
        ) : (
          <DeliverableIcon type={type} className="cover-glyph" />
        )}
        <span className="cover-format">{kind.badge}</span>
      </span>
    </div>
  );
}

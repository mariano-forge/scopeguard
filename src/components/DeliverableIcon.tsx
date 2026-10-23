import { FileText, Film, Frame, Image as ImageIcon, Link2, NotebookText, type LucideProps } from "lucide-react";
import type { DeliverableType } from "./deliverableKinds";

const icons = { PDF: FileText, Image: ImageIcon, Video: Film, Link: Link2, Doc: NotebookText, Figma: Frame };

/** Icon of a deliverable kind (tabs, side panel, cover glyph). */
export function DeliverableIcon({ type, ...props }: { type: DeliverableType } & LucideProps) {
  const Icon = icons[type] ?? FileText;
  return <Icon {...props} />;
}

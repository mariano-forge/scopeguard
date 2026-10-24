"use client";

// The canvas's export menu, for the agency and the client alike: the version's comments as a printable page
// (saved as PDF from the browser), and the deliverable's file itself. The agency also copies them as text.

import { Copy, Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import { isAgencyDraft, type ThreadComment } from "./CanvasComments";
import { MenuButton, type MenuEntry } from "./MenuButton";
import { requestsHtml } from "../requestsDocument";

/** Opens the comments as a page of their own, which prints itself once loaded (src/app/(agency)/requestsDocument.ts). */
function exportComments(title: string, comments: ThreadComment[], statusOf: (comment: ThreadComment) => string | null) {
  const page = URL.createObjectURL(new Blob([requestsHtml(title, comments, statusOf)], { type: "text/html" }));
  if (!window.open(page, "_blank")) toast.error("Votre navigateur a bloqué la fenêtre d’export : autorisez les fenêtres pour Kora, puis réessayez.");
  // Freed once the page has had time to open.
  window.setTimeout(() => URL.revokeObjectURL(page), 60_000);
}

/** The file served as an attachment (/api/files/:id?download): the page stays, the file is saved. */
function saveFile(file: string) {
  const link = document.createElement("a");
  link.href = `${file}?download`;
  link.click();
}

export function ExportMenu({
  title,
  comments,
  statusOf,
  file,
  onCopy,
}: {
  /** « maquette.pdf — V02 »: the printed page's title. */
  title: string;
  comments: ThreadComment[];
  /** A request's status as this reader sees it (the agency's or the client's words). */
  statusOf: (comment: ThreadComment) => string | null;
  /** The version's file (/api/files/…), none for a « Lien ». */
  file?: string;
  onCopy?: () => void;
}) {
  const exported = comments.filter((comment) => !isAgencyDraft(comment));
  const entries: MenuEntry[] = [
    // The copy keeps the agency's drafts (its own text); the printed page leaves them out, so it waits for a request.
    ...(onCopy ? [{ label: "Copier les demandes", icon: <Copy />, disabled: comments.length === 0, onSelect: onCopy }] : []),
    { label: "Exporter les commentaires en PDF", icon: <FileDown />, disabled: exported.length === 0, onSelect: () => exportComments(title, comments, statusOf) },
    ...(file ? [{ label: "Télécharger le livrable", icon: <Download />, onSelect: () => saveFile(file) }] : []),
  ];
  return <MenuButton className="tool-button" label="Exporter ou télécharger" trigger={<Download />} side="top" align="center" tooltip entries={entries} />;
}

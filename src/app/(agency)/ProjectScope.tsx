"use client";

// The « Périmètre » tab of a project (US-045), and its summary from an open deliverable: what is included,
// what is not, and the amendments (Kora's accepted out-of-scope quotes). Filled by the AI from the quote or
// the brief (ScopeIntake.tsx, faster) or by hand, in any order: one does not wait for the other. Read once
// active, « Modifier » to change it, back to a draft when it should no longer be the reference; saved whole,
// its activation written by the server (src/lib/projectScope.ts, src/db/workspaceActions.ts).

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Ellipsis, ListChecks, Loader2, Pencil, PenLine, Plus, Sparkles, Trash2, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { agencyAction } from "@/lib/agencyActions";
import { uploadFile } from "@/lib/upload";
import {
  emptyScope,
  euros,
  quantityLabel,
  readScope,
  scopeStatus,
  scopeUnits,
  type ClientScope,
  type ProjectScope,
  type ScopeAmendment,
  type ScopeExclusion,
  type ScopeLine,
  type ScopeSourceKind,
} from "@/lib/projectScope";
import type { ExtractedItem } from "@/lib/scopeExtraction";
import { href } from "./routes";
import { ScopeIntake, type IntakeMode } from "./ScopeIntake";
import "./projectScope.css";

/** An id for a new row: time-based, so rows added in a burst stay distinct. */
let lastId = 0;
const newId = () => (lastId = Math.max(Date.now(), lastId + 1));

/** What would be saved: rows without a title left out, numbers read. Compared to tell unsaved changes. */
const saved = (scope: ProjectScope | null | undefined) => JSON.stringify(scope ? readScope(scope) : null);

const numberOf = (value: string) => {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return value.trim() === "" || !Number.isFinite(parsed) ? undefined : parsed;
};
const activationLabel = (scope: ProjectScope) =>
  `Activé par ${scope.activatedBy} le ${new Date(scope.activatedAt ?? 0).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
const filled = <T extends { title: string }>(rows: T[]) => rows.filter((row) => row.title.trim());
/** A unit chosen in the list; « Aucune » keeps a bare quantity (« 1 formulaire » reads as « 1 »). */
const noUnit = "none";

/** The lists typed row by row: what is included, what is not. */
type RowList = "lines" | "exclusions";
type Row = ScopeLine | ScopeExclusion;

/** A section of the page: its title, how many, its content; the main one with its icon. */
function Section({ title, count, note, icon: Icon, children }: { title: string; count?: number; note?: string; icon?: typeof Sparkles; children?: React.ReactNode }) {
  return (
    <section className={Icon ? "scope-card is-feature" : "scope-card"} aria-label={title}>
      <header className="scope-card-head">
        <h2>
          {Icon && (
            <span className="scope-card-icon" aria-hidden="true">
              <Icon />
            </span>
          )}
          {title} {count !== undefined && <span className="scope-count">{count}</span>}
        </h2>
      </header>
      {note && <p className="scope-note">{note}</p>}
      {children}
    </section>
  );
}

/** What to put in each section, said while it is empty. */
const notes = {
  intake: "L’IA lit le devis ou le cahier des charges et propose les éléments inclus et non inclus. Vous relisez chacun avant de l’ajouter, et pouvez toujours saisir à la main.",
  lines: "Ce qui a été vendu, un élément par ligne : pages, fonctionnalités, livrables, avec leur quantité.",
  exclusions: "Ce que le devis exclut : rédaction des textes, photos, maintenance… En cas de désaccord, ce sont ces lignes qui font foi.",
  amendments: "Les devis hors scope que le client accepte s’ajoutent ici d’eux-mêmes, avec leur montant.",
};

/** « +600 € · +3 j »: what an amendment adds. */
const addedLabel = (amount: number, days: number) => [amount ? `+${euros(amount)}` : null, days ? `+${days} j` : null].filter(Boolean).join(" · ");

/** Kora's accepted out-of-scope quotes, each opening its request. */
function AmendmentList({ amendments }: { amendments: ScopeAmendment[] }) {
  if (!amendments.length) return null;
  return (
    <ul className="scope-list">
      {amendments.map((amendment) => (
        <li key={amendment.commentId}>
          <span className="scope-list-main">
            {amendment.href ? (
              <Link href={amendment.href} className="scope-list-title">
                {amendment.title}
              </Link>
            ) : (
              <span className="scope-list-title">{amendment.title}</span>
            )}
            <small>{amendment.deliverable}</small>
          </span>
          <span>{addedLabel(amendment.amount, amendment.days)}</span>
        </li>
      ))}
    </ul>
  );
}

/** What was agreed, read only: in the tab once active, and from an open deliverable. */
export function ScopeSummary({ scope, amendments }: { scope: Pick<ProjectScope, "lines" | "exclusions">; amendments: ScopeAmendment[] }) {
  return (
    <>
      <Section title="Inclus" count={scope.lines.length} note={scope.lines.length ? undefined : notes.lines}>
        {scope.lines.length > 0 && (
          <ul className="scope-list">
            {scope.lines.map((line) => (
              <li key={line.id}>
                <span className="scope-list-title">{line.title}</span>
                <span>{quantityLabel(line)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Non inclus" count={scope.exclusions.length} note={scope.exclusions.length ? undefined : notes.exclusions}>
        {scope.exclusions.length > 0 && (
          <ul className="scope-list">
            {scope.exclusions.map((exclusion) => (
              <li key={exclusion.id}>
                <span className="scope-list-title">{exclusion.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Avenants" count={amendments.length} note={amendments.length ? undefined : notes.amendments}>
        <AmendmentList amendments={amendments} />
      </Section>
    </>
  );
}

/** The tab. Re-keyed by BrowserView on the saved scope: the draft starts again from what the server holds. */
export function ProjectScopeEditor({ projectId, scope, amendments }: { projectId: number; scope?: ProjectScope; amendments: ScopeAmendment[] }) {
  const status = scopeStatus(scope);
  const [draft, setDraft] = useState<ProjectScope | null>(scope ?? null);
  // Active: read first, « Modifier » to change it. A draft is being written.
  const [editing, setEditing] = useState(status === "draft");
  /** A row just added: its first field takes the focus. */
  const [focusId, setFocusId] = useState<number | null>(null);
  const [busy, setBusy] = useState<"saving" | "activating" | "uploading" | null>(null);
  /** How « Extraire avec l'IA » reads the scope: the project's PDF, or pasted text. */
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("pdf");
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInputs = useRef(new Map<number, HTMLTextAreaElement>());

  /** The PDF to read: imported, it takes the place of the one before (« Modifier »). */
  async function addDocument(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return toast.error("Ajoutez le document en PDF.");
    setBusy("uploading");
    const result = await uploadFile(file, { kind: "scope", projectId });
    setBusy(null);
    if ("error" in result) return toast.error(result.error);
    const kind: ScopeSourceKind = /cahier|cdc|brief/i.test(file.name) ? "brief" : "quote";
    setDraft((current) => current && { ...current, sources: [{ id: newId(), kind, name: file.name, file: result.href }] });
  }

  /** A draft to write, its first line ready: focused to type by hand, else the extraction read first. */
  const start = (manual: boolean, mode: IntakeMode = "pdf") => {
    const first = newId();
    setDraft({ ...emptyScope(), lines: [{ id: first, title: "" }] });
    setEditing(true);
    setIntakeMode(mode);
    if (manual) setFocusId(first);
  };

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept="application/pdf,.pdf"
      className="sr-only"
      tabIndex={-1}
      aria-label="Document de référence"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!draft) start(false);
        void addDocument(file);
      }}
    />
  );

  if (!draft)
    return (
      // Inside the tab's frame, so that its layout follows the page's width.
      <div className="scope">
        <div className="scope-start">
          <span className="scope-empty-icon" aria-hidden="true">
            <ListChecks />
          </span>
          <b className="scope-start-title">Cadrez le projet</b>
          <p>Ce qui a été vendu et ce qui ne l’est pas : la référence de chaque demande du client.</p>
          <div className="scope-start-options">
            <section className="scope-start-option" aria-label="Extraire avec l’IA">
              <Sparkles aria-hidden="true" />
              <b>Extraire avec l’IA</b>
              <p>Le plus rapide : depuis le devis signé, le cahier des charges ou un texte collé. Vous relisez avant d’ajouter.</p>
              <span className="scope-empty-actions">
                <Button size="sm" onClick={() => fileInput.current?.click()}>
                  <Upload aria-hidden="true" /> Importer un PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => start(false, "text")}>
                  Coller un texte
                </Button>
              </span>
            </section>
            <section className="scope-start-option" aria-label="Saisir à la main">
              <PenLine aria-hidden="true" />
              <b>Saisir à la main</b>
              <p>Les éléments inclus et non inclus, un par ligne, avec leur quantité.</p>
              <span className="scope-empty-actions">
                <Button size="sm" variant="outline" onClick={() => start(true)}>
                  Commencer la saisie
                </Button>
              </span>
            </section>
          </div>
          {fileField}
        </div>
      </div>
    );

  const dirty = saved(draft) !== saved(scope);
  const update = (change: Partial<ProjectScope>) => setDraft({ ...draft, ...change });
  const rowsOf = (list: RowList) => draft[list] as Row[];
  const setRow = <K extends RowList>(list: K, id: number, change: Partial<ProjectScope[K][number]>) => update({ [list]: rowsOf(list).map((row) => (row.id === id ? { ...row, ...change } : row)) });
  const addRow = (list: RowList, after?: Row) => {
    const id = newId();
    const rows = rowsOf(list);
    const copy = after ? { ...after, id } : { id, title: "" };
    const at = after ? rows.findIndex((row) => row.id === after.id) + 1 : rows.length;
    update({ [list]: [...rows.slice(0, at), copy, ...rows.slice(at)] });
    setFocusId(id);
  };
  const removeRow = (list: RowList, id: number) => update({ [list]: rowsOf(list).filter((row) => row.id !== id) });
  /** Enter in a row (Shift+Enter breaks the line of a long text): the next row's title, or a new row after the last one. */
  const onRowKey = (event: React.KeyboardEvent, list: RowList, index: number) => {
    if (event.key !== "Enter" || event.shiftKey || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
    event.preventDefault();
    const next = rowsOf(list)[index + 1];
    if (next) titleInputs.current.get(next.id)?.focus();
    else addRow(list);
  };
  const titleRef = (id: number) => (input: HTMLTextAreaElement | null) => {
    if (input) titleInputs.current.set(id, input);
    else titleInputs.current.delete(id);
  };
  const rowActions = (list: RowList, row: Row, label: string) => (
    <span className="scope-row-actions">
      <Hint label="Dupliquer">
        <Button variant="ghost" size="icon-sm" aria-label={`Dupliquer ${label}`} onClick={() => addRow(list, row)}>
          <Copy />
        </Button>
      </Hint>
      <Hint label="Supprimer">
        <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${label}`} onClick={() => removeRow(list, row.id)}>
          <Trash2 />
        </Button>
      </Hint>
    </span>
  );
  /** A row's title: a text that grows with what it says. */
  const titleField = (list: RowList, row: Row, label: string, placeholder?: string) => (
    <Textarea
      ref={titleRef(row.id)}
      autoFocus={row.id === focusId}
      rows={1}
      className="scope-row-title"
      value={row.title}
      maxLength={200}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setRow(list, row.id, { title: event.target.value })}
    />
  );

  /** The items kept from an extraction, after those already typed (empty rows dropped): in the draft, to review and save. */
  const addExtracted = (items: ExtractedItem[]) => {
    const lines = items.filter((item) => item.kind === "included").map((item) => ({ id: newId(), title: item.title, quantity: item.quantity, unit: item.unit }));
    const exclusions = items.filter((item) => item.kind === "excluded").map((item) => ({ id: newId(), title: item.title }));
    update({ lines: [...filled(draft.lines), ...lines], exclusions: [...filled(draft.exclusions), ...exclusions] });
    toast.success(`${items.length} élément${items.length > 1 ? "s" : ""} ajouté${items.length > 1 ? "s" : ""} : relisez, puis enregistrez.`);
  };

  async function save() {
    setBusy("saving");
    const done = await agencyAction(`projects/${projectId}/scope`, "PUT", { scope: readScope(draft) });
    setBusy(null);
    return Boolean(done);
  }

  async function activate() {
    if (dirty && !(await save())) return;
    setBusy("activating");
    const done = await agencyAction(`projects/${projectId}/scope/activation`, "POST");
    setBusy(null);
    if (done) toast.success("Périmètre activé.");
  }

  async function deactivate() {
    const done = await agencyAction(`projects/${projectId}/scope/activation`, "DELETE");
    if (done) toast.success("Périmètre repassé en brouillon.");
  }

  const statusBar = (
    <div className={`scope-status is-${status}`}>
      <span className="scope-status-text">
        <h2>Périmètre</h2>
        <span role="status">
          {status === "active" ? (
            <>
              <CheckCircle2 aria-hidden="true" /> Actif · {editing ? "modification en cours" : activationLabel(scope!).replace("Activé", "activé")}
            </>
          ) : filled(draft.lines).length ? (
            "Brouillon · Activez-le pour qu’il serve de référence à chaque demande du client."
          ) : (
            // Activation needs an included line (POST …/scope/activation answers 409 without): say so first.
            "Brouillon · Remplissez ce qui est inclus, puis activez-le pour qu’il serve de référence à chaque demande du client."
          )}
        </span>
      </span>
      <span className="scope-status-actions">
        {!editing && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" /> Modifier
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Plus d’actions sur le périmètre">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void deactivate()}>
                  <Undo2 aria-hidden="true" /> Repasser en brouillon
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {editing && status === "active" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(scope ?? null);
              setEditing(false);
            }}
          >
            Annuler
          </Button>
        )}
        {editing && (dirty || status === "active") && (
          <Button variant={status === "active" ? "default" : "outline"} size="sm" onClick={() => void save()} disabled={busy !== null || !dirty}>
            {busy === "saving" && <Loader2 className="animate-spin" aria-hidden="true" />} Enregistrer
          </Button>
        )}
        {status !== "active" && (
          <Button size="sm" onClick={() => void activate()} disabled={busy !== null || !filled(draft.lines).length}>
            {busy === "activating" && <Loader2 className="animate-spin" aria-hidden="true" />} Activer le périmètre
          </Button>
        )}
      </span>
    </div>
  );

  if (!editing)
    return (
      <div className="scope">
        {statusBar}
        <ScopeSummary scope={scope!} amendments={amendments} />
      </div>
    );

  return (
    <div className="scope">
      {statusBar}

      <Section title="Extraire avec l’IA" icon={Sparkles} note={notes.intake}>
        <ScopeIntake
          projectId={projectId}
          pdf={draft.sources.findLast((source) => source.file)}
          mode={intakeMode}
          onMode={setIntakeMode}
          uploading={busy === "uploading"}
          onImport={() => fileInput.current?.click()}
          onFile={(file) => void addDocument(file)}
          onRemove={() => update({ sources: [] })}
          onAdd={addExtracted}
        />
        {fileField}
      </Section>

      <Section title="Inclus" count={filled(draft.lines).length} note={filled(draft.lines).length ? undefined : notes.lines}>
        <div className="scope-table is-lines" role="group" aria-label="Lignes incluses">
          <span className="scope-table-head" aria-hidden="true">
            <span>Désignation</span>
            <span>Quantité</span>
            <span>Unité</span>
            <span />
          </span>
          {draft.lines.map((line, index) => (
            <div className="scope-row" key={line.id} onKeyDown={(event) => onRowKey(event, "lines", index)}>
              {titleField("lines", line, `Désignation de la ligne ${index + 1}`, index === 0 ? "Pages intérieures : maquette et intégration" : undefined)}
              <Input
                inputMode="decimal"
                value={line.quantity === undefined ? "" : String(line.quantity)}
                placeholder={index === 0 ? "5" : undefined}
                aria-label={`Quantité de la ligne ${index + 1}`}
                onChange={(event) => setRow("lines", line.id, { quantity: numberOf(event.target.value) })}
              />
              <Select value={line.unit ?? noUnit} onValueChange={(unit) => setRow("lines", line.id, { unit: unit === noUnit ? undefined : unit })}>
                <SelectTrigger aria-label={`Unité de la ligne ${index + 1}`} className="w-full data-[size=default]:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noUnit}>Aucune</SelectItem>
                  {[...new Set([...scopeUnits, ...(line.unit ? [line.unit] : [])])].map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rowActions("lines", line, `la ligne ${index + 1}`)}
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="scope-add" onClick={() => addRow("lines")}>
          <Plus aria-hidden="true" /> Ajouter une ligne
        </Button>
      </Section>

      <Section title="Non inclus" count={filled(draft.exclusions).length} note={filled(draft.exclusions).length ? undefined : notes.exclusions}>
        {draft.exclusions.length > 0 && (
          <div className="scope-table is-exclusions" role="group" aria-label="Exclusions">
            {draft.exclusions.map((exclusion, index) => (
              <div className="scope-row" key={exclusion.id} onKeyDown={(event) => onRowKey(event, "exclusions", index)}>
                {titleField("exclusions", exclusion, `Désignation de l’exclusion ${index + 1}`, index === 0 ? "Rédaction des textes" : undefined)}
                {rowActions("exclusions", exclusion, `l’exclusion ${index + 1}`)}
              </div>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" className="scope-add" onClick={() => addRow("exclusions")}>
          <Plus aria-hidden="true" /> Ajouter une exclusion
        </Button>
      </Section>

      <Section title="Avenants" count={amendments.length} note={amendments.length ? undefined : notes.amendments}>
        <AmendmentList amendments={amendments} />
      </Section>
    </div>
  );
}

/** From an open deliverable: what was agreed for its project, without leaving it. */
export function ScopeButton({ projectId, scope, amendments }: { projectId: number; scope?: ProjectScope; amendments: ScopeAmendment[] }) {
  const status = scopeStatus(scope);
  return (
    <Dialog>
      <Hint label="Périmètre du projet">
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" className="icon-action" aria-label="Périmètre du projet">
            <ListChecks />
          </Button>
        </DialogTrigger>
      </Hint>
      <DialogContent className="scope-dialog sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Périmètre du projet</DialogTitle>
          <DialogDescription>
            {status === "active" ? activationLabel(scope!) : status === "draft" ? "Brouillon : pas encore la référence du projet." : "Le projet n’est pas encore cadré."}
          </DialogDescription>
        </DialogHeader>
        {scope && (
          <div className="scope scope-in-dialog">
            <ScopeSummary scope={scope} amendments={amendments} />
          </div>
        )}
        <DialogFooter>
          <Button asChild variant="outline">
            <Link href={href.scope(projectId)}>{scope ? "Ouvrir le périmètre" : "Cadrer le projet"}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * From the client's review page: the project's scope as agreed, read only (src/db/reviewAccess.ts sends it
 * once active, nothing else). Its amendments are the accepted quotes of the version the client reviews.
 */
export function ClientScopeButton({ scope, amendments }: { scope?: ClientScope; amendments: ScopeAmendment[] }) {
  if (!scope) return null;
  return (
    <Dialog>
      <Hint label="Périmètre du projet">
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" className="icon-action" aria-label="Périmètre du projet">
            <ListChecks />
          </Button>
        </DialogTrigger>
      </Hint>
      <DialogContent className="scope-dialog sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Périmètre du projet</DialogTitle>
          <DialogDescription>Ce qui est inclus et ce qui ne l’est pas, convenu le {new Date(scope.activatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.</DialogDescription>
        </DialogHeader>
        <div className="scope scope-in-dialog">
          <ScopeSummary scope={scope} amendments={amendments} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

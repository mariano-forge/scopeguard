"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FolderInput, Pencil, Settings, Trash2, X } from "lucide-react";
import { Select } from "@/components/Select";

type Target = { id: number; label: string };

/** What to type to confirm a space deletion: its name in capitals, without spaces ("NORTHSTARSTUDIO"). */
export const confirmPhraseOf = (name: string) => name.toUpperCase().replace(/\s+/g, "");

/**
 * Settings of a space or a project: rename, move (projects), delete with a confirmation
 * that spells out what goes with it.
 */
export function EntitySettings({
  kind,
  name,
  deleteImpact,
  onRename,
  onDelete,
  moveTargets,
  currentTargetId,
  onMove,
}: {
  kind: "espace" | "projet";
  name: string;
  /** e.g. "2 projets, 5 livrables et 12 demandes" */
  deleteImpact: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** Projects only: the spaces it can move to. */
  moveTargets?: Target[];
  currentTargetId?: number;
  onMove?: (targetId: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = kind === "espace" ? "l’espace" : "le projet";

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setMenuOpen(false);
          triggerRef.current?.focus();
        }
      } else if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  function open(next: "rename" | "move" | "delete") {
    setMenuOpen(false);
    setDialog(next);
  }

  return (
    <div className="entity-settings" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ghost-button icon-only"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Réglages de ${label}`}
        title="Réglages"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <Settings />
      </button>
      {menuOpen && (
        <div className="settings-menu" role="menu" aria-label={`Réglages de ${label}`}>
          <button type="button" role="menuitem" autoFocus onClick={() => open("rename")}>
            <Pencil aria-hidden="true" /> Renommer
          </button>
          {moveTargets && onMove && (
            <button type="button" role="menuitem" onClick={() => open("move")}>
              <FolderInput aria-hidden="true" /> Déplacer vers un autre espace
            </button>
          )}
          <button type="button" role="menuitem" className="is-danger" onClick={() => open("delete")}>
            <Trash2 aria-hidden="true" /> Supprimer {label}
          </button>
        </div>
      )}

      {dialog === "rename" && (
        <RenameDialog
          title={`Renommer ${label}`}
          value={name}
          onClose={() => setDialog(null)}
          onSave={(next) => {
            onRename(next);
            setDialog(null);
          }}
        />
      )}
      {dialog === "move" && moveTargets && onMove && (
        <MoveDialog
          name={name}
          targets={moveTargets}
          currentTargetId={currentTargetId}
          onClose={() => setDialog(null)}
          onMove={(targetId) => {
            onMove(targetId);
            setDialog(null);
          }}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDeleteDialog
          title={`Supprimer ${label} « ${name} » ?`}
          impact={deleteImpact}
          toTrash
          confirmPhrase={kind === "espace" ? confirmPhraseOf(name) : undefined}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            onDelete();
          }}
        />
      )}
    </div>
  );
}

function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="project-modal settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="drawer-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RenameDialog({
  title,
  value,
  onClose,
  onSave,
}: {
  title: string;
  value: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  return (
    <DialogFrame title={title} onClose={onClose}>
      <form
        className="settings-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return setError("Le nom ne peut pas être vide.");
          onSave(draft.trim());
        }}
      >
        <label>
          Nom
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={(event) => event.target.select()} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="primary-button">
            Enregistrer
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

function MoveDialog({
  name,
  targets,
  currentTargetId,
  onClose,
  onMove,
}: {
  name: string;
  targets: Target[];
  currentTargetId?: number;
  onClose: () => void;
  onMove: (targetId: number) => void;
}) {
  const others = targets.filter((target) => target.id !== currentTargetId);
  const [targetId, setTargetId] = useState(String(others[0]?.id ?? ""));
  return (
    <DialogFrame title={`Déplacer « ${name} »`} onClose={onClose}>
      {others.length === 0 ? (
        <p className="drawer-intro">Il n’y a pas d’autre espace. Créez-en un pour y déplacer ce projet.</p>
      ) : (
        <div className="settings-form">
          <div className="field">
            <span className="field-label">Vers l’espace</span>
            <Select
              label="Espace de destination"
              value={targetId}
              options={others.map((target) => ({ value: String(target.id), label: target.label }))}
              onChange={setTargetId}
            />
          </div>
          <div className="dialog-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="primary-button" onClick={() => onMove(Number(targetId))}>
              Déplacer
            </button>
          </div>
        </div>
      )}
    </DialogFrame>
  );
}

export function ConfirmDeleteDialog({
  title,
  impact,
  onClose,
  onConfirm,
  toTrash = false,
  confirmPhrase,
  confirmLabel = "Supprimer",
}: {
  title: string;
  impact: string;
  onClose: () => void;
  onConfirm: () => void;
  /** Goes to the trash (restorable) rather than being erased. */
  toTrash?: boolean;
  /** When set, the user must type it exactly to enable the button. */
  confirmPhrase?: string;
  confirmLabel?: string;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const ready = !confirmPhrase || typed.trim() === confirmPhrase;
  return (
    <DialogFrame title={title} onClose={onClose}>
      <p className="drawer-intro">
        {toTrash
          ? `${impact ? `${impact} seront placés` : "Il sera placé"} dans la corbeille. Vous pourrez restaurer pendant 30 jours.`
          : `${impact ? `${impact} seront supprimés définitivement. ` : ""}Cette action ne peut pas être annulée.`}
      </p>
      {confirmPhrase && (
        <div className="confirm-phrase">
          <label htmlFor={inputId}>
            Pour confirmer, tapez <code>{confirmPhrase}</code>
          </label>
          <input
            id={inputId}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready) onConfirm();
            }}
          />
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="ghost-button" autoFocus={!confirmPhrase} onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="danger-button" onClick={onConfirm} disabled={!ready}>
          <Trash2 aria-hidden="true" /> {confirmLabel}
        </button>
      </div>
    </DialogFrame>
  );
}

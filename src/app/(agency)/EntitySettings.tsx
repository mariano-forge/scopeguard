"use client";

import { useState } from "react";
import { Ellipsis, Pencil, Pin, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FormError, Modal } from "@/components/modal";
import { Hint } from "@/components/hint";

/** What to type to confirm a space deletion: its name in capitals, without spaces ("NORTHSTARSTUDIO"). */
export const confirmPhraseOf = (name: string) => name.toUpperCase().replace(/\s+/g, "");

/**
 * Settings of a space or a project: rename, delete with a confirmation
 * that spells out what goes with it.
 */
export function EntitySettings({
  kind,
  name,
  deleteImpact,
  onRename,
  onDelete,
  deleteLocked = false,
}: {
  kind: "espace" | "projet";
  name: string;
  /** e.g. "2 projets, 5 livrables et 12 demandes" */
  deleteImpact: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  /** Members cannot delete a space or a project: the entry stays, greyed, with the reason. */
  deleteLocked?: boolean;
}) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const label = kind === "espace" ? "l’espace" : "le projet";

  return (
    <div className="entity-settings">
      <DropdownMenu>
        <Hint label="Réglages">
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-lg" aria-label={`Réglages de ${label}`}>
              <Settings />
            </Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="settings-menu min-w-56">
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <Pencil /> Renommer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={deleteLocked} onSelect={() => setDialog("delete")}>
            <Trash2 />
            <span className="grid">
              Supprimer {label}
              {deleteLocked && <small className="text-xs font-normal">Réservé aux administrateurs de l’organisation</small>}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

export function RenameDialog({
  title,
  value,
  error: externalError = "",
  onClose,
  onSave,
}: {
  title: string;
  value: string;
  /** Error coming from the caller (e.g. name already used). */
  error?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [localError, setError] = useState("");
  const error = localError || externalError;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      className="settings-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.trim()) return setError("Le nom ne peut pas être vide.");
        onSave(draft.trim());
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit">Enregistrer</Button>
        </>
      }
    >
      <Field id="rename-input" label="Nom">
        <Input id="rename-input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={(event) => event.target.select()} />
      </Field>
      {error && <FormError>{error}</FormError>}
    </Modal>
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
  const ready = !confirmPhrase || typed.trim() === confirmPhrase;
  return (
    <Modal
      open
      onClose={onClose}
      role="alertdialog"
      title={title}
      size="sm"
      className="settings-dialog"
      description={
        toTrash
          ? `${impact ? `${impact} seront placés` : "Il sera placé"} dans la corbeille. Vous pourrez restaurer pendant 30 jours.`
          : `${impact ? `${impact} seront supprimés définitivement. ` : ""}Cette action ne peut pas être annulée.`
      }
      footer={
        <>
          <Button variant="outline" autoFocus={!confirmPhrase} onClick={onClose}>
            Annuler
          </Button>
          <Button variant="destructive" className="danger-button" onClick={onConfirm} disabled={!ready}>
            <Trash2 /> {confirmLabel}
          </Button>
        </>
      }
    >
      {confirmPhrase && (
        <Field
          id="confirm-phrase"
          className="confirm-phrase"
          label={
            <>
              Pour confirmer, tapez <code className="rounded-sm bg-mist px-1 font-mono text-xs">{confirmPhrase}</code>
            </>
          }
        >
          <Input
            id="confirm-phrase"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready) onConfirm();
            }}
          />
        </Field>
      )}
    </Modal>
  );
}

/**
 * "⋯" menu on a deliverable card: where it lives, rename, pin to favorites, move to the trash.
 * The location line tells apart deliverables that share a name.
 */
export function LivrableMenu({
  name,
  location,
  pinned,
  deleteImpact,
  onTogglePin,
  onRename,
  onDelete,
}: {
  name: string;
  /** "Espace / Projet", or null when it belongs to no space. */
  location: string | null;
  pinned: boolean;
  deleteImpact: string;
  onTogglePin: () => void;
  /** Returns an error message when the name cannot be used. */
  onRename: (name: string) => string | null;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [renameError, setRenameError] = useState("");

  return (
    <div className={`card-menu ${menuOpen ? "is-open" : ""}`}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Hint label="Actions">
          <DropdownMenuTrigger asChild>
            <button type="button" className="card-menu-button" aria-label={`Actions sur ${name}`}>
              <Ellipsis />
            </button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="card-menu-list min-w-56">
          <DropdownMenuLabel className={`card-menu-location text-xs font-normal text-muted-foreground ${location ? "" : "is-orphan"}`}>
            {location ? `Dans ${location}` : "Hors de tout espace et projet"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setRenameError("");
              setDialog("rename");
            }}
          >
            <Pencil /> Renommer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTogglePin}>
            <Pin /> {pinned ? "Retirer des favoris" : "Épingler aux favoris"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 /> Mettre à la corbeille
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "rename" && (
        <RenameDialog
          title="Renommer le livrable"
          value={name}
          error={renameError}
          onClose={() => setDialog(null)}
          onSave={(next) => {
            const problem = onRename(next);
            if (problem) setRenameError(problem);
            else setDialog(null);
          }}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDeleteDialog
          title={`Supprimer le livrable « ${name} » ?`}
          impact={deleteImpact}
          toTrash
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

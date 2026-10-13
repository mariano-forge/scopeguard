"use client";

import { useEffect, useId, useState } from "react";
import { Upload, X } from "lucide-react";
import { DeliverableCover } from "@/components/DeliverableCover";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import {
  MAX_COVER_BYTES,
  MAX_FILE_BYTES,
  deliverableKinds,
  deliverableTypes,
  formatBytes,
  isHttpUrl,
  kindFromFile,
  type DeliverableType,
} from "@/components/deliverableKinds";

export type NewDeliverable = { name: string; type: DeliverableType; file?: File; url?: string; cover?: File };

/** "+ Livrable": name, kind, the file (or the address for a link) and an optional cover. */
export function NewDeliverableDialog({
  existingNames,
  onClose,
  onCreate,
}: {
  /** Names already used in the project (a same-named upload would become a version of it). */
  existingNames: string[];
  onClose: () => void;
  onCreate: (deliverable: NewDeliverable) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DeliverableType>("PDF");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function pickCover(next: File | null) {
    setCover(next);
    setCoverPreview(null);
    if (!next) return;
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(String(reader.result));
    reader.readAsDataURL(next);
  }

  const kind = deliverableKinds[type];

  function pickFile(next: File | null) {
    setError("");
    setFile(next);
    if (!next) return;
    const guessed = kindFromFile(next);
    if (guessed && guessed !== type) setType(guessed);
    if (!name.trim()) setName(next.name);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Donnez un nom au livrable.");
    if (existingNames.some((existing) => existing.toLowerCase() === name.trim().toLowerCase()))
      return setError("Un livrable porte déjà ce nom dans ce projet. Pour le mettre à jour, importez une nouvelle version depuis le livrable.");
    if (type === "Link") {
      if (!isHttpUrl(url.trim())) return setError("Saisissez une adresse complète, par exemple https://exemple.fr.");
    } else {
      if (!file) return setError(`Importez le fichier (${kind.hint}).`);
      if (kindFromFile(file) !== type) return setError(`Ce fichier ne correspond pas au type « ${kind.label} ».`);
      if (file.size > MAX_FILE_BYTES)
        return setError(`Fichier trop lourd pour la démo : ${formatBytes(file.size)} (maximum ${formatBytes(MAX_FILE_BYTES)}).`);
    }
    if (cover && cover.size > MAX_COVER_BYTES)
      return setError(`Couverture trop lourde : ${formatBytes(cover.size)} (maximum ${formatBytes(MAX_COVER_BYTES)}).`);
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), type, file: type === "Link" ? undefined : (file ?? undefined), url: type === "Link" ? url.trim() : undefined, cover: cover ?? undefined });
    } catch {
      setError("Le livrable n’a pas pu être enregistré.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="project-modal deliverable-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} noValidate>
        <div className="drawer-header">
          <h2 id={titleId}>Nouveau livrable</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Fermer">
            <X />
          </button>
        </div>

        <label>
          Nom du livrable
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Maquette page d’accueil" />
        </label>

        <fieldset className="kind-picker">
          <legend>Type</legend>
          <div className="kind-options">
            {deliverableTypes.map((option) => (
              <label key={option} className={`kind-option ${type === option ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="deliverable-type"
                  value={option}
                  checked={type === option}
                  onChange={() => {
                    setType(option);
                    setError("");
                  }}
                />
                <DeliverableIcon type={option} aria-hidden="true" />
                <span>{deliverableKinds[option].label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {type === "Link" ? (
          <label>
            Adresse de la page
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://staging.client.fr/accueil" />
          </label>
        ) : (
          <div className="upload-field">
            <span className="upload-label">Fichier</span>
            <label className="dropzone">
              <Upload aria-hidden="true" />
              <span>
                {file ? (
                  <>
                    <b>{file.name}</b> · {formatBytes(file.size)}
                  </>
                ) : (
                  <>
                    <b>Choisir un fichier</b> · {kind.hint}, {formatBytes(MAX_FILE_BYTES)} max.
                  </>
                )}
              </span>
              <input type="file" accept={kind.accept} onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>
        )}

        <div className="upload-field">
          <span className="upload-label">
            Couverture <span className="field-optional">(facultatif)</span>
          </span>
          <div className="cover-field">
            <div className="cover-field-preview">
              {cover && coverPreview ? <DeliverableCover type={type} coverData={coverPreview} /> : <DeliverableCover type={type} />}
            </div>
            <div className="cover-field-actions">
              <label className="ghost-button file-button">
                {cover ? "Changer l’image" : "Ajouter une image"}
                <input type="file" accept="image/*" onChange={(event) => pickCover(event.target.files?.[0] ?? null)} />
              </label>
              {cover ? (
                <button type="button" className="ghost-button" onClick={() => pickCover(null)}>
                  Retirer
                </button>
              ) : (
                <small>Sans image, la vue par défaut ci-contre est utilisée.</small>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Créer le livrable"}
        </button>
      </form>
    </div>
  );
}

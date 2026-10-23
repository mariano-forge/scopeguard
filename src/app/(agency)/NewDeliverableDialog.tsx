"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, Modal } from "@/components/modal";
import { undeployedSiteProblem, withoutToolbarFlag } from "@/lib/siteReview";
import { videoWarning, videoWarningText, type VideoWarning } from "@/lib/videoCheck";
import { SiteScriptIntro } from "./SiteToolbarSnippet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeliverableCover } from "@/components/DeliverableCover";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import {
  MAX_COVER_BYTES,
  maxBytesOf,
  deliverableKinds,
  documentRefused,
  newDeliverableTypes,
  formatBytes,
  isHttpUrl,
  kindFromFile,
  type DeliverableType,
} from "@/components/deliverableKinds";

export type NewDeliverable = { name: string; type: DeliverableType; file?: File; url?: string; cover?: File; projectId?: number };

/** "+ Livrable": name, kind, the file (or the address for a link) and an optional cover. */
export function NewDeliverableDialog({
  existingNamesFor,
  defaultProjectId,
  projects,
  onClose,
  onCreate,
}: {
  /** Names already used in a project (a same-named upload would become a version of it). */
  existingNamesFor: (projectId: number) => string[];
  defaultProjectId: number;
  /** Opened outside a project: the projects to choose from. */
  projects?: { id: number; label: string }[];
  onClose: () => void;
  onCreate: (deliverable: NewDeliverable) => Promise<void> | void;
}) {
  const [projectId, setProjectId] = useState(defaultProjectId);
  const existingNames = existingNamesFor(projectId);
  const [name, setName] = useState("");
  const [type, setType] = useState<DeliverableType>("PDF");
  const [file, setFile] = useState<File | null>(null);
  // What the agency should know of the video chosen (src/lib/videoCheck.ts): said, never in the way.
  // Checked in a moment, without reading it whole: `done` once known.
  const [videoCheck, setVideoCheck] = useState<{ file: File; warning: VideoWarning | null; done: boolean } | null>(null);
  const [url, setUrl] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (guessed === "Video") {
      setVideoCheck({ file: next, warning: null, done: false });
      void videoWarning(next).then((warning) => setVideoCheck({ file: next, warning, done: true }));
    }
    if (guessed === "Doc") setError(documentRefused);
    else if (guessed && guessed !== type) setType(guessed);
    if (!name.trim()) setName(next.name);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Donnez un nom au livrable.");
    if (existingNames.some((existing) => existing.toLowerCase() === name.trim().toLowerCase()))
      return setError("Un livrable porte déjà ce nom dans ce projet. Pour le mettre à jour, importez une nouvelle version depuis le livrable.");
    if (type === "Link") {
      if (!isHttpUrl(url.trim())) return setError("Saisissez une adresse complète, par exemple https://exemple.fr.");
      const undeployed = undeployedSiteProblem(url.trim());
      if (undeployed) return setError(undeployed);
    } else {
      if (!file) return setError(`Importez le fichier (${kind.hint}).`);
      if (kindFromFile(file) === "Doc") return setError(documentRefused);
      if (kindFromFile(file) !== type) return setError(`Ce fichier ne correspond pas au type « ${kind.label} ».`);
      if (file.size > maxBytesOf(type))
        return setError(`Fichier trop lourd : ${formatBytes(file.size)} (maximum ${formatBytes(maxBytesOf(type))}).`);
    }
    if (cover && cover.size > MAX_COVER_BYTES)
      return setError(`Couverture trop lourde : ${formatBytes(cover.size)} (maximum ${formatBytes(MAX_COVER_BYTES)}).`);
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), type, file: type === "Link" ? undefined : (file ?? undefined), url: type === "Link" ? withoutToolbarFlag(url.trim()) : undefined, cover: cover ?? undefined, projectId });
    } catch {
      setError("Le livrable n’a pas pu être enregistré.");
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau livrable"
      size="lg"
      className="deliverable-dialog"
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Créer le livrable"}
          </Button>
        </>
      }
    >
        {projects && (
          <Field id="deliverable-project" label="Projet">
            <Select value={String(projectId)} onValueChange={(value) => setProjectId(Number(value))}>
              <SelectTrigger id="deliverable-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field id="deliverable-name" label="Nom du livrable">
          <Input id="deliverable-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Maquette page d’accueil" />
        </Field>

        <fieldset className="kind-picker">
          <legend>Type</legend>
          <div className="kind-options">
            {newDeliverableTypes.map((option) => (
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
          <>
            <Field id="deliverable-url" label="Adresse de la page">
              <Input id="deliverable-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://staging.client.fr/accueil" />
            </Field>
            {/* What the toolbar does; its line, the deliverable's, comes on its board once created. */}
            <SiteScriptIntro />
          </>
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
                    <b>Choisir un fichier</b> · {kind.hint}, {formatBytes(maxBytesOf(type))} max.
                  </>
                )}
              </span>
              <input type="file" accept={kind.accept} onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
            </label>
            {videoCheck?.file === file && !videoCheck.warning && (
              <p role="status" className="sr-only">
                {videoCheck.done ? "Vidéo vérifiée." : "Vérification de la vidéo…"}
              </p>
            )}
            {videoCheck?.file === file && videoCheck.warning && (
              <p role="note" className="rounded-[var(--r-field)] bg-[var(--status-medium-bg)] px-3 py-2 text-sm text-[var(--status-medium-text)]">
                {videoWarningText[videoCheck.warning]}
              </p>
            )}
          </div>
        )}

        <div className="upload-field">
          <span className="upload-label">
            Couverture <span className="font-normal text-muted-foreground">(facultatif)</span>
          </span>
          <div className="cover-field">
            <div className="cover-field-preview">
              {cover && coverPreview ? <DeliverableCover type={type} coverData={coverPreview} /> : <DeliverableCover type={type} />}
            </div>
            <div className="cover-field-actions">
              <Button asChild variant="outline" size="sm">
                <label className="file-button">
                  {cover ? "Changer l’image" : "Ajouter une image"}
                  <input type="file" accept="image/*" onChange={(event) => pickCover(event.target.files?.[0] ?? null)} />
                </label>
              </Button>
              {cover ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => pickCover(null)}>
                  Retirer
                </Button>
              ) : (
                <small>Sans image, la vue par défaut ci-contre est utilisée.</small>
              )}
            </div>
          </div>
        </div>

        {error && <FormError>{error}</FormError>}
    </Modal>
  );
}

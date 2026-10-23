"use client";

import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError, Modal } from "@/components/modal";
import { undeployedSiteProblem, withoutToolbarFlag } from "@/lib/siteReview";
import { videoWarning, videoWarningText, type VideoWarning } from "@/lib/videoCheck";
import { SiteScriptIntro } from "./SiteToolbarSnippet";
import { FigmaRoundFields, roundChoice, useFigmaFile } from "./FigmaRoundFields";
import { figmaFileKey, figmaFileUrl, type FigmaChoice } from "@/lib/figmaLink";
import { FigmaScreensFields, useFigmaScreens } from "./FigmaScreensFields";
import { copyFigmaScreens } from "@/lib/figmaScreensImport";
import { ScreensLayoutDialog, type LaidScreen } from "./ScreensLayoutDialog";
import type { ScreenFormat } from "@/lib/figmaScreens";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeliverableCover } from "@/components/DeliverableCover";
import { DeliverableIcon } from "@/components/DeliverableIcon";
import {
  MAX_COVER_BYTES,
  maxBytesOf,
  deliverableKinds,
  pickableTypes,
  formatBytes,
  isHttpUrl,
  kindFromFile,
  type DeliverableType,
} from "@/components/deliverableKinds";

export type NewDeliverable = {
  name: string;
  type: DeliverableType;
  file?: File;
  url?: string;
  cover?: File;
  projectId?: number;
  figma?: FigmaChoice;
  /** The id its files were stored under (« Écrans Figma »: copied before the deliverable is made). */
  id?: number;
  /** « Écrans Figma »: the screens copied into Kora, the server's reading of them, how many per row. */
  screens?: { picked: { id: string; fileData: string }[]; receipt: string; columns: number };
};

/** "+ Livrable": name, kind, the file (or the address for a link, the file and its round for a Figma) and an optional cover. */
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
  // A Figma file, named by the link and read by the server. Its client comments either in Kora, on its
  // screens copied here (« Écrans Figma »), or in Figma (its pages and saved version chosen here).
  const figmaKey = type === "Figma" ? figmaFileKey(url) : null;
  const [figmaMode, setFigmaMode] = useState<"kora" | "figma">("kora");
  const inKora = type === "Figma" && figmaMode === "kora";
  const figma = useFigmaFile(inKora ? null : figmaKey);
  const screensRead = useFigmaScreens(inKora ? figmaKey : null);
  const [picked, setPicked] = useState<string[]>([]);
  // PNG for every screen to start with; one changed by hand keeps its own (formats).
  const [allFormat, setAllFormat] = useState<ScreenFormat>("png");
  const [formats, setFormats] = useState<Record<string, ScreenFormat>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // The screens copied, laid out next (« Disposer les écrans ») before the deliverable is made from them.
  const [laid, setLaid] = useState<{ id: number; screens: LaidScreen[]; receipt: string; name: string } | null>(null);
  // A Figma deliverable is named after its file unless the agency names it.
  const figmaName = type === "Figma" ? (inKora ? screensRead.file : figma.file)?.name : undefined;
  const [figmaPages, setFigmaPages] = useState<string[] | null>(null);
  const [figmaVersion, setFigmaVersion] = useState<string | null>(null);
  const round = figma.file ? roundChoice(figma.file, figmaPages, figmaVersion) : null;
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
    if (guessed && guessed !== type) setType(guessed);
    if (!name.trim()) setName(next.name);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // A « Figma » is named after its file unless the agency names it.
    const figmaRead = inKora ? screensRead : figma;
    const chosenName = name.trim() || (type === "Figma" ? (figmaRead.file?.name ?? "") : "");
    if (type === "Figma" && !figmaKey) return setError("Collez le lien d’un fichier Figma, par exemple https://www.figma.com/design/…");
    if (!chosenName) return setError(type === "Figma" ? (figmaRead.error ?? "Le fichier Figma est en cours de lecture.") : "Donnez un nom au livrable.");
    if (existingNames.some((existing) => existing.toLowerCase() === chosenName.toLowerCase()))
      return setError("Un livrable porte déjà ce nom dans ce projet. Pour le mettre à jour, importez une nouvelle version depuis le livrable.");
    if (inKora) {
      if (!screensRead.file) return setError(screensRead.error ?? "Le fichier Figma est en cours de lecture.");
      if (!picked.length) return setError("Cochez au moins un écran à faire valider.");
    } else if (type === "Figma") {
      if (!round) return setError(figma.error ?? "Le fichier Figma est en cours de lecture.");
      if (!round.reviewed.length) return setError("Cochez au moins une page en revue.");
      if (!round.version) return setError("Enregistrez dans Figma la version que vous envoyez au client, puis relisez le fichier.");
    } else if (type === "Link") {
      if (!isHttpUrl(url.trim())) return setError("Saisissez une adresse complète, par exemple https://exemple.fr.");
      const undeployed = undeployedSiteProblem(url.trim());
      if (undeployed) return setError(undeployed);
    } else {
      if (!file) return setError(`Importez le fichier (${kind.hint}).`);
      if (kindFromFile(file) !== type) return setError(`Ce fichier ne correspond pas au type « ${kind.label} ».`);
      if (file.size > maxBytesOf(type))
        return setError(`Fichier trop lourd : ${formatBytes(file.size)} (maximum ${formatBytes(maxBytesOf(type))}).`);
    }
    if (cover && cover.size > MAX_COVER_BYTES)
      return setError(`Couverture trop lourde : ${formatBytes(cover.size)} (maximum ${formatBytes(MAX_COVER_BYTES)}).`);
    setSaving(true);
    if (inKora && figmaKey && screensRead.file) {
      // The screens copied first, under the deliverable's id; laid out next, then the deliverable is made of them.
      const id = Date.now();
      const read = screensRead.file;
      try {
        const copied = await copyFigmaScreens({
          fileKey: figmaKey,
          receipt: read.receipt,
          screens: picked.map((screenId) => ({ id: screenId, format: formats[screenId] ?? allFormat })),
          placement: { projectId, livrableId: id, version: 1 },
          onProgress: (done, total) => setProgress({ done, total }),
        });
        const screens = copied.map((copy) => ({ ...copy, name: read.screens.find((screen) => screen.id === copy.id)?.name ?? "", pageName: read.screens.find((screen) => screen.id === copy.id)?.pageName ?? "" }));
        setLaid({ id, screens, receipt: read.receipt, name: chosenName });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Les écrans n’ont pas pu être importés.");
      }
      setProgress(null);
      setSaving(false);
      return;
    }
    try {
      const byAddress = type === "Link" || type === "Figma";
      await onCreate({
        name: chosenName,
        type,
        file: byAddress ? undefined : (file ?? undefined),
        url: type === "Link" ? withoutToolbarFlag(url.trim()) : figmaKey ? figmaFileUrl(figmaKey) : undefined,
        figma: figmaKey && round?.version && figma.receipt ? { pages: round.reviewed, versionId: round.version.id, receipt: figma.receipt } : undefined,
        cover: cover ?? undefined,
        projectId,
      });
    } catch {
      setError("Le livrable n’a pas pu être enregistré.");
      setSaving(false);
    }
  }

  /** « Importer », from the layout: the deliverable, its screens in the order chosen. */
  async function importLaid(order: string[], columns: number) {
    if (!laid || !figmaKey) return;
    setSaving(true);
    try {
      await onCreate({
        name: laid.name,
        type: "Screens",
        id: laid.id,
        url: figmaFileUrl(figmaKey),
        screens: { picked: order.map((screenId) => ({ id: screenId, fileData: laid.screens.find((screen) => screen.id === screenId)!.fileData })), receipt: laid.receipt, columns },
        cover: cover ?? undefined,
        projectId,
      });
      // Refused by the server (its message shown): the layout stays, to try again.
      setSaving(false);
    } catch {
      setLaid(null);
      setError("Le livrable n’a pas pu être enregistré.");
      setSaving(false);
    }
  }

  if (laid) return <ScreensLayoutDialog screens={laid.screens} saving={saving} onBack={() => setLaid(null)} onImport={(order, columns) => void importLaid(order, columns)} />;

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
            {saving ? (inKora ? "Import des écrans…" : "Enregistrement…") : inKora ? "Disposer les écrans" : "Créer le livrable"}
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
          <Input id="deliverable-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={figmaName ?? "Ex. Maquette page d’accueil"} />
        </Field>

        <fieldset className="kind-picker">
          <legend>Type</legend>
          <div className="kind-options">
            {pickableTypes.map((option) => (
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

        {type === "Figma" ? (
          <>
            <Field id="deliverable-figma" label="Lien du fichier Figma" hint="Dans Figma : Partager › Copier le lien. Le fichier est lu avec votre compte Figma.">
              <Input
                id="deliverable-figma"
                inputMode="url"
                value={url}
                onChange={(event) => (setUrl(event.target.value), setFigmaPages(null), setFigmaVersion(null), setPicked([]), setError(""))}
                placeholder="https://www.figma.com/design/…"
              />
            </Field>
            <fieldset className="figma-pages">
              <legend>Où votre client commente-t-il ?</legend>
              <label className="figma-page">
                <input type="radio" name="figma-mode" checked={figmaMode === "kora"} onChange={() => (setFigmaMode("kora"), setError(""))} />
                <span>
                  Dans Kora <span className="text-muted-foreground">· les écrans choisis sont copiés ici, sans compte Figma pour le client</span>
                </span>
              </label>
              <label className="figma-page">
                <input type="radio" name="figma-mode" checked={figmaMode === "figma"} onChange={() => (setFigmaMode("figma"), setError(""))} />
                <span>
                  Dans Figma <span className="text-muted-foreground">· ses commentaires arrivent dans Kora pour les qualifier</span>
                </span>
              </label>
            </fieldset>
            {figmaKey && inKora && (
              <FigmaScreensFields
                {...screensRead}
                picked={picked}
                formats={formats}
                allFormat={allFormat}
                onPick={(ids) => (setPicked(ids), setError(""))}
                onFormat={(screenId, format) => setFormats((current) => ({ ...current, [screenId]: format }))}
                onFormatAll={(format) => (setAllFormat(format), setFormats({}))}
              />
            )}
            {progress && (
              <p role="status" className="text-sm text-muted-foreground">
                Import des écrans : {progress.done} sur {progress.total}…
              </p>
            )}
            {figmaKey && !inKora && (
              <FigmaRoundFields
                {...figma}
                reviewed={round?.reviewed ?? []}
                version={round?.version ?? null}
                onPages={(next) => (setFigmaPages(next), setError(""))}
                onVersion={(next) => (setFigmaVersion(next), setError(""))}
              />
            )}
          </>
        ) : type === "Link" ? (
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

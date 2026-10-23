// Figma screens copied into Kora (US-054, step 2c), with the member's own Figma account, in three moves that
// each keep Figma's tightest reads to one:
// 1. the file's screens are read (once), with a signed receipt of them;
// 2. Figma draws the screens picked, all in one request, and the server signs where their pictures are;
// 3. each picture is fetched by the server, from Figma's storage only, checked to be an image or a PDF by its
//    bytes, and stored in the agency's container like any imported file (one request each: a slow screen
//    never holds the others).
// The deliverable is then made from the stored files (src/db/workspaceActions.ts), its screens' names and
// sizes taken from the receipt, not from the page.

import "server-only";
import { readFigmaScreens, renderFigmaScreens, figmaRenderUrl } from "@/lib/figma";
import { figmaRendersTicket, figmaScreensReceipt, readFigmaRendersTicket, readFigmaScreensReceipt } from "@/lib/figmaReceipt";
import type { FigmaScreen, ScreenFormat } from "@/lib/figmaScreens";
import { maxUploadBytes, storeFile, type FilePlacement } from "@/lib/storage";
import type { Db } from "./client";
import { figmaAccessToken, figmaRefused, isRefusal, notConnected, type FigmaRefused } from "./figmaConnection";

type Refused = FigmaRefused | { ok: false; status: number; error: string; code?: string };
const refused = (error: string, status = 400): Refused => ({ ok: false, status, error });
const expired = () => refused("La lecture du fichier Figma a expiré : rouvrez la fenêtre et choisissez les écrans à nouveau.");

/** The file's screens, as the member's Figma account sees them, with a signed receipt. */
export async function loadFigmaScreens(db: Db, org: string, userId: string, fileKey: string): Promise<{ ok: true; name: string; screens: FigmaScreen[]; receipt: string } | Refused> {
  const token = await figmaAccessToken(db, org, userId);
  if (!token) return notConnected;
  const read = await readFigmaScreens(token, fileKey);
  if (isRefusal(read)) return figmaRefused(read);
  return { ok: true, ...read, receipt: figmaScreensReceipt(org, fileKey, read.name, read.screens) };
}

/**
 * The scale screens are drawn at: twice their size, so text stays sharp at zoom, unless a screen would pass
 * 16 million pixels (a long landing page), then their own size. Figma draws all of one request at one scale.
 */
const scaleFor = (screens: FigmaScreen[]) => (screens.every((screen) => screen.width * screen.height * 4 <= 16_000_000) ? 2 : 1);

/** Figma draws the screens picked, in one request; the answer is a signed ticket of where their pictures are. */
export async function drawFigmaScreens(db: Db, org: string, userId: string, fileKey: string, receipt: unknown, ids: string[], format: ScreenFormat): Promise<{ ok: true; ticket: string; drawn: string[] } | Refused> {
  const read = readFigmaScreensReceipt(receipt, org, fileKey);
  if (!read) return expired();
  const picked = ids.map((id) => read.screens.find((screen) => screen.id === id));
  if (picked.some((screen) => !screen)) return refused("Un écran choisi n’est pas dans le fichier Figma lu par Kora.");
  const token = await figmaAccessToken(db, org, userId);
  if (!token) return notConnected;
  const renders = await renderFigmaScreens(token, fileKey, ids, format === "pdf" ? "pdf" : "png", scaleFor(picked as FigmaScreen[]));
  if (isRefusal(renders)) return figmaRefused(renders);
  if (!Object.keys(renders).length) return refused("Figma n’a pu dessiner aucun de ces écrans. Réessayez, ou choisissez-en d’autres.", 502);
  return { ok: true, ticket: figmaRendersTicket(org, fileKey, format, renders), drawn: Object.keys(renders) };
}

/** What a picture's first bytes say it is: only a PNG, a JPEG or a PDF is stored. */
function kindOf(content: Buffer) {
  if (content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: "image/png", extension: "png" };
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (content.subarray(0, 5).toString("latin1") === "%PDF-") return { mimeType: "application/pdf", extension: "pdf" };
  return null;
}

/** Fetches one screen's picture from Figma's storage and stores it as the agency's file, at `placement`. */
export async function storeFigmaScreen(db: Db, org: string, userId: string, fileKey: string, ticket: unknown, id: string, placement: FilePlacement): Promise<{ ok: true; fileData: string; mimeType: string } | Refused> {
  const read = readFigmaRendersTicket(ticket, org, fileKey);
  if (!read) return expired();
  const address = read.renders[id] ? figmaRenderUrl(read.renders[id]) : null;
  if (!address) return refused("Figma n’a pas dessiné cet écran.", 404);
  const response = await fetch(address, { signal: AbortSignal.timeout(30_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return refused("L’image de cet écran n’a pas pu être récupérée chez Figma. Réessayez.", 502);
  const limit = maxUploadBytes();
  if (Number(response.headers.get("content-length")) > limit) return refused(`Écran trop lourd : ${Math.round(limit / 1024 / 1024)} Mo au maximum.`, 413);
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length > limit) return refused(`Écran trop lourd : ${Math.round(limit / 1024 / 1024)} Mo au maximum.`, 413);
  const kind = kindOf(content);
  if (!kind || (read.format === "pdf") !== (kind.mimeType === "application/pdf")) return refused("Figma n’a pas renvoyé une image de cet écran.", 502);
  const stored = await storeFile(db, org, { content, mimeType: kind.mimeType, name: `${id.replace(/[^\w-]/g, "-")}.${kind.extension}`, uploadedBy: userId }, placement);
  return { ok: true, fileData: stored.href, mimeType: kind.mimeType };
}

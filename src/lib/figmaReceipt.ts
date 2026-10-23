// What the server read of a Figma file for an agency (US-054), handed to the dialog and sent back with the
// new deliverable: signed, so the server trusts its own reading instead of reading the file again.
// Figma allows a View or Collab seat only 20 reads of a file a month: one per deliverable, not three.

import "server-only";
import type { FigmaFileTree } from "./figma";
import type { FigmaPage } from "./figmaLink";
import type { FigmaScreen, ScreenFormat } from "./figmaScreens";
import { readClaim, signClaim } from "./signedClaim";

const scope = "figma-file";
const lifetimeMs = 30 * 60 * 1000;
const maxLength = 64_000;

type Receipt = { organizationId: string; fileKey: string; name: string; pages: FigmaPage[] };

export const figmaReceipt = (organizationId: string, fileKey: string, tree: FigmaFileTree) => signClaim(scope, { organizationId, fileKey, name: tree.name, pages: tree.pages }, lifetimeMs);

/** The file as the server read it for this agency, in the last 30 minutes; null otherwise. */
export function readFigmaReceipt(value: unknown, organizationId: string, fileKey: string): FigmaFileTree | null {
  const receipt = readClaim<Receipt>(scope, value, maxLength);
  if (!receipt || receipt.organizationId !== organizationId || receipt.fileKey !== fileKey || !Array.isArray(receipt.pages)) return null;
  return { name: receipt.name, pages: receipt.pages };
}

// The same for a file's screens (step 2c): what the server read of them, then what Figma drew of the ones
// picked. The drawing's addresses stay inside the ticket: the server fetches only those, never an address a
// page sends.

const screensScope = "figma-screens";
const rendersScope = "figma-renders";

type ScreensReceipt = { organizationId: string; fileKey: string; name: string; screens: FigmaScreen[] };
/** Each screen drawn: where Figma put its picture, and the format asked for. */
type Renders = Record<string, { url: string; format: ScreenFormat }>;
type RendersTicket = { organizationId: string; fileKey: string; renders: Renders };

export const figmaScreensReceipt = (organizationId: string, fileKey: string, name: string, screens: FigmaScreen[]) =>
  signClaim(screensScope, { organizationId, fileKey, name, screens }, lifetimeMs);

/** The file's screens as the server read them for this agency, in the last 30 minutes; null otherwise. */
export function readFigmaScreensReceipt(value: unknown, organizationId: string, fileKey: string): { name: string; screens: FigmaScreen[] } | null {
  const receipt = readClaim<ScreensReceipt>(screensScope, value, maxLength * 2);
  if (!receipt || receipt.organizationId !== organizationId || receipt.fileKey !== fileKey || !Array.isArray(receipt.screens)) return null;
  return { name: receipt.name, screens: receipt.screens };
}

export const figmaRendersTicket = (organizationId: string, fileKey: string, renders: Renders) => signClaim(rendersScope, { organizationId, fileKey, renders }, lifetimeMs);

/** What Figma drew for this agency's import, in the last 30 minutes; null otherwise. */
export function readFigmaRendersTicket(value: unknown, organizationId: string, fileKey: string): Renders | null {
  const ticket = readClaim<RendersTicket>(rendersScope, value, maxLength);
  if (!ticket || ticket.organizationId !== organizationId || ticket.fileKey !== fileKey || !ticket.renders || typeof ticket.renders !== "object") return null;
  return ticket.renders;
}

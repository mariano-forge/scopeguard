// What the server read of a Figma file for an agency (US-054), handed to the dialog and sent back with the
// new deliverable: signed, so the server trusts its own reading instead of reading the file again.
// Figma allows a View or Collab seat only 20 reads of a file a month: one per deliverable, not three.

import "server-only";
import type { FigmaFileTree } from "./figma";
import type { FigmaPage } from "./figmaLink";
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

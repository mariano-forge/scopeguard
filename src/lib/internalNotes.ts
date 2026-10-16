// What the agency wrote for itself on a request: the text of a pin it dropped, and the replies written
// while the client could not see the request. Once the request is qualified and shown to the client,
// those stay internal: the client (and the proof) get the request's title and description, and only
// the replies written since. Shared by the server, which filters, and the editor, which labels them.

import { sideOf } from "./authors";

// Records as stored (any shape): only the fields named here are read.
type Message = { [field: string]: unknown };
type Request = Message;

const fromClient = (message: Message) => sideOf(message as Parameters<typeof sideOf>[0]) === "client";

/**
 * A request whose own text is an agency note: flagged when the agency drops a pin. Older pins carry no
 * flag: an agency request with a position on the deliverable was one (« + Demande » never has one).
 */
export const isInternalNote = (request: Request) =>
  request.internalNote === true || (request.internalNote === undefined && !fromClient(request) && Boolean(request.position) && typeof request.position === "object");

/** A reply written while the client could not see the request (flagged then; older ones: any agency reply on a note). */
export const isInternalReply = (request: Request, reply: Message) =>
  reply.internal === true || (reply.internal === undefined && !fromClient(reply) && isInternalNote(request));

/** The text the client reads for a request: its own words, or, for an agency note, what the agency addressed to them. */
export const clientFacingText = (request: Request) =>
  isInternalNote(request) ? String(request.description || request.title || "") : String(request.message ?? "");

// Who wrote a message (a comment or a reply): the agency or the client, and how they are shown.
// Messages carry `from`; older ones only had fixed initials, "AM" for the agency and "CM" for the client.

export type Side = "agency" | "client";

export function sideOf(message: { from?: unknown; initials?: unknown }): Side {
  if (message.from === "agency" || message.from === "client") return message.from;
  return message.initials === "AM" ? "agency" : "client";
}

/** "Claire Martin" -> "CM", "claire@northwind.dev" -> "CL". */
/** What an avatar or a pin shows (feedback of 26 October 2026): one letter, read at once; the data keeps the initials. */
export const avatarLetter = (initials?: string | null) => (initials ?? "").trim().charAt(0).toLocaleUpperCase("fr-FR");

export function initialsOf(name: string) {
  const words = name.trim().split("@")[0].split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

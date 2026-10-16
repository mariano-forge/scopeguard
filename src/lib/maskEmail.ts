// An address shown to whoever holds a link, before they prove it is theirs: "c•••••@client.test".
// Enough for its owner to recognise it, not for anyone else to learn it.

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(3, Math.min(local.length - 1, 8)))}@${domain}`;
}

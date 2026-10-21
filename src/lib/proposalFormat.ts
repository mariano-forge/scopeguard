// Amounts and deadlines of quotes: read from the numbers or older texts ("850 €", "+ 3 jours") and
// shown the same way on the agency's pages, the client's page and in the audit trail.

/** "850", "850 €", "2 087,50 €" or 2087.5 → 2087.5 (comma or dot as decimal separator). */
export function parseNumericAmount(amount: number | string | undefined): number {
  if (typeof amount === "number") return amount;
  if (!amount) return 0;
  return Number(String(amount).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.]/g, "")) || 0;
}

export function parseNumericDays(deadline: number | string | undefined): number {
  if (typeof deadline === "number") return deadline;
  if (!deadline) return 0;
  return Number(String(deadline).replace(/[^0-9]/g, "")) || 0;
}

export function formatProposalAmount(amount: number | string | undefined): string {
  const num = parseNumericAmount(amount);
  // Cents only when there are some: 2 087 €, 2 087,50 €.
  const cents = Number.isInteger(num) ? 0 : 2;
  return `${num.toLocaleString("fr-FR", { minimumFractionDigits: cents, maximumFractionDigits: 2 })} €`;
}

export function formatProposalDeadline(deadline: number | string | undefined): string {
  const num = parseNumericDays(deadline);
  if (num === 0) return "Aucun impact";
  return `+ ${num} jour${num > 1 ? "s" : ""}`;
}

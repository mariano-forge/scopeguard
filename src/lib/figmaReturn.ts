// Where a Figma connection attempt ends (US-054): back in Kora, with its outcome in the address, which
// the agency's page says in a toast (src/app/(agency)/FigmaReturn.tsx). Shared by the routes and the page.

export const figmaOutcomes = {
  connected: "Votre compte Figma est connecté : Kora pourra lire vos fichiers et leurs commentaires.",
  refused: "Figma n’a pas confirmé la connexion. Réessayez depuis « Compte Figma », dans le menu de votre compte.",
  invalid: "Cette connexion à Figma a expiré ou n’a pas été lancée depuis ce navigateur. Recommencez depuis « Compte Figma ».",
  unavailable: "La connexion à Figma n’est pas configurée sur ce serveur.",
} as const;

export type FigmaOutcome = keyof typeof figmaOutcomes;

export const figmaOutcomeParam = "figma";

export const readFigmaOutcome = (value: string | null): FigmaOutcome | null => (value && Object.hasOwn(figmaOutcomes, value) ? (value as FigmaOutcome) : null);

/** The page « Connecter mon compte Figma » was clicked on, to come back to. */
export const figmaBackParam = "back";

/** A page of Kora to come back to: a plain path of this site, never another site's address (`//…`, `https:…`). */
export const readFigmaBack = (value: unknown) => (typeof value === "string" && value.length <= 200 && /^\/[A-Za-z0-9_-][A-Za-z0-9/_-]*$|^\/$/.test(value) ? value : null);

/** The page the member lands on, absolute (a redirect): the one they left, else the home page. */
export function figmaReturn(outcome: FigmaOutcome, back?: string | null) {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${readFigmaBack(back) ?? "/"}?${figmaOutcomeParam}=${outcome}`;
}

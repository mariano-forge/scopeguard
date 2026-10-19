// The password rule, shared by the forms (to say what is missing as one types) and the server (which
// refuses a weak password whatever the page, src/lib/auth.ts). It follows the CNIL's recommendation
// for an account protected by a password alone (délibération 2022-100): at least 12 characters mixing
// upper case, lower case, digits and special characters, nothing common, nothing taken from the person.

export const minPasswordLength = 12;
export const maxPasswordLength = 128;

/** What a password must contain, as shown under the field (each one ticked as it is met). */
export const passwordRules = [
  { id: "length", label: `${minPasswordLength} caractères minimum`, test: (password: string) => password.length >= minPasswordLength },
  { id: "case", label: "Une majuscule et une minuscule", test: (password: string) => /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password) },
  { id: "digit", label: "Un chiffre", test: (password: string) => /\d/.test(password) },
  { id: "special", label: "Un caractère spécial", test: (password: string) => /[^\p{L}\d]/u.test(password) },
] as const;

/** Passwords everyone tries first (compared without case, digits nor punctuation). */
const common = ["motdepasse", "password", "azerty", "qwerty", "soleil", "bonjour", "kora", "admin", "welcome", "bienvenue", "changeme", "secret"];

/** Why a password is refused, in French, or null when it is good enough. */
export function passwordProblem(password: string, person: { email?: string; name?: string } = {}): string | null {
  if (password.length > maxPasswordLength) return `Le mot de passe est trop long (${maxPasswordLength} caractères au plus).`;
  const missing = passwordRules.filter((rule) => !rule.test(password));
  if (missing.length) return `Le mot de passe doit contenir : ${missing.map((rule) => rule.label.toLowerCase()).join(", ")}.`;
  const letters = password.toLowerCase().replace(/[^\p{L}]/gu, "");
  if (common.some((word) => letters === word || letters.startsWith(word) && letters.length - word.length < 4)) return "Ce mot de passe est trop courant : choisissez-en un autre.";
  const own = [person.email?.split("@")[0], ...(person.name ?? "").split(/\s+/)]
    .map((part) => part?.toLowerCase().replace(/[^\p{L}\d]/gu, ""))
    .filter((part): part is string => Boolean(part && part.length >= 4));
  if (own.some((part) => password.toLowerCase().replace(/[^\p{L}\d]/gu, "").includes(part))) return "Évitez votre nom ou votre adresse e-mail dans le mot de passe.";
  return null;
}

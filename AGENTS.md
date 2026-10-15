<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Règles du projet Kora

Ces règles s'appliquent à tout agent IA qui modifie ce dépôt. Elles passent avant tes habitudes. En cas de doute, demande plutôt que de deviner.

## Avant de coder

- Lis [README.md](README.md) (lancement, fonctionnement), [TECHNOLOGIES.md](TECHNOLOGIES.md) (pile, architecture, sécurité) et, pour une fonctionnalité, la story concernée dans [PERSONAS_USER_STORIES.md](PERSONAS_USER_STORIES.md).
- Next.js 16 diffère de ce que tu connais (par exemple `src/proxy.ts` remplace le middleware) : lis le guide concerné dans `node_modules/next/dist/docs/` avant d'écrire du code Next.
- Lis le code existant autour de ta modification et réutilise ses helpers avant d'en créer.

## Zéro régression : vérifications obligatoires

Avant de déclarer un travail terminé, et avant tout commit :

1. `npx tsc --noEmit -p .` : aucune erreur.
2. `npx eslint src tests` : aucune **nouvelle** erreur. Des erreurs anciennes existent : compare fichier par fichier avec l'état d'avant ta modification (`git stash`), le nombre ne doit augmenter nulle part.
3. `npm run build` : la build passe.
4. `npm run test:e2e` (après `npm run db:up`) : **tous** les tests passent.

Si une vérification échoue, corrige ou explique. Ne livre jamais un travail en échec en le présentant comme terminé.

Pour les tests :

- Toute fonctionnalité nouvelle, tout correctif et toute règle de sécurité s'accompagnent d'un test dans `tests/e2e/`, utilisant les helpers de `tests/e2e/helpers.ts`. Une règle de sécurité se teste par la tentative **refusée**, pas seulement par le cas permis.
- Ne supprime, n'affaiblis et n'ignore jamais un test pour le faire passer. Si un test échoue, établis d'abord si c'est le code ou le test qui a tort, et dis-le.
- Pas d'attente fixe dans les tests : attends une condition (`expect(...).toBeVisible()`, `expect.poll`, `waitForCode`).
- Les données de test sont uniques par test (`unique()`) et les requêtes SQL des tests filtrent par `organization_id` : plusieurs agences de test partagent les mêmes identifiants.

## Invariants à ne jamais casser

**Isolation des agences**
- Toute table de données d'agence a `organization_id` dans sa clé primaire. Toute requête la filtre sur l'agence de l'utilisateur (`src/db/state.ts`, `src/lib/session.ts`).
- L'agence vient de la session (`requireAgencyUser`, `getReviewViewer`), jamais d'un paramètre envoyé par le navigateur.

**Le serveur décide, jamais le navigateur**
- Les droits se vérifient côté serveur : rôles dans `src/db/agencyPermissions.ts`, écritures du client dans `src/db/reviewAccess.ts`. Masquer un bouton ne protège rien.
- Le client écrit par une route par action (`src/db/reviewActions.ts`), construite à partir de la base et passée par `sanitizeReviewChanges`. Ne rouvre pas d'écriture générique de l'état côté client. Côté agence, toute écriture passe par `src/db/agencyActions.ts` ou `src/db/workspaceActions.ts`. Une nouvelle écriture prend sa propre route du même type, avec un test d'interface écrit avant.
- Ce que le client écrit est signé par le serveur (nom, initiales, adresse vérifiée).
- L'auteur d'un message se lit avec `sideOf()` (`src/lib/authors.ts`), jamais avec les initiales.

**Preuve et journal**
- `audit_events` est en ajout seul : jamais d'`UPDATE` ni de `DELETE`. Ne supprime ni ne désactive le trigger. Toute nouvelle colonne s'ajoute au trigger dans une migration.
- L'IP d'une requête se lit avec `requestOrigin()` (`src/lib/api.ts`), jamais directement dans `x-forwarded-for`.

**Base de données**
- Toute modification du schéma passe par `npm run db:generate`, et le SQL personnalisé par `npx drizzle-kit generate --custom`. Ne modifie jamais une migration déjà appliquée.
- Toute nouvelle table active la sécurité par ligne dans sa migration (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`) : sans elle, l'API publique de Supabase l'exposerait.

**Fichiers**
- Les fichiers passent par `src/lib/upload.ts` (envoi direct au stockage, vérifié par le serveur), `storeFile()` et `/api/files` (`src/lib/storage.ts`) : conteneurs privés, accès vérifié, adresse signée courte. Jamais de conteneur public, jamais de fichier en base64 dans l'état.

**Routes API**
- Un fichier `route.ts` n'exporte que des méthodes HTTP. Les helpers vont dans `src/lib/`.
- Valide toutes les entrées. Côté client, réponds 404 plutôt que 403 quand la réponse révélerait l'existence d'une ressource.
- Toute écriture passe par une route par action (`POST /api/…/comments`), qui construit ses changements depuis la base. `/api/state` est en lecture seule : ne rouvre aucune écriture générique de l'état, ni côté agence ni côté client.
- Dans les tests, prépare les données avec `seedState` (`tests/e2e/helpers.ts`, écriture directe dans la base de test), et teste les règles par les routes.

## Secrets, environnements et services réels

- Ne commite jamais de secret. `.env.local` est ignoré. Toute nouvelle variable est documentée dans `.env.example`, avec une valeur vide ou d'exemple.
- N'affiche jamais un secret en clair dans une sortie : vérifie sa présence, pas sa valeur.
- Les variables `NEXT_PUBLIC_*` sont envoyées au navigateur : jamais de secret dedans.
- Les tests et scripts n'utilisent que des services locaux : base de test, Azurite, `MAIL_TRANSPORT=console`. Ne lance un script contre un service réel (Supabase, Azure, Resend) que si l'utilisateur le demande. Ne laisse alors aucune donnée de test derrière toi, et signale tout ce qui a été envoyé ou créé.
- N'envoie jamais un e-mail réel à une adresse inventée.

## Dépendances

- Une nouvelle dépendance doit être justifiée : préfère ce qui est déjà installé.
- Choisis une version publiée depuis au moins deux semaines. Vérifie `npm audit`.
- `next` et `eslint-config-next` restent à une version **exacte**, identique pour les deux. Une mise à jour suit la procédure zéro régression ci-dessus.

## Style de code

- Écris comme le code autour : TypeScript strict, pas de `any`, des noms explicites, et des commentaires en anglais qui expliquent le *pourquoi*, pas le *quoi*.
- Les textes affichés sont en français, avec la typographie française : « guillemets », apostrophe ’, espaces avant `:` et `?`.
- Des fonctions courtes, sans duplication : un type ou une règle partagés entre le navigateur et le serveur vont dans `src/lib/`.
- Ne fais pas grossir `src/app/(agency)/AgencyApp.tsx` (déjà plus de 3 300 lignes) : place un nouvel écran ou une nouvelle logique dans son propre composant ou module.
- Interface : composants de `src/components/ui` (shadcn), couleurs et espacements des jetons de `src/theme/tokens.css`, pas de couleur codée en dur. Accessibilité : un libellé pour chaque champ, des rôles corrects, tout utilisable au clavier.
- Pas de `setState` synchrone dans un `useEffect`, pas de fonction impure pendant le rendu (règles React du linter).

## Git

- Une branche par sujet, jamais de travail direct sur `master`.
- Des commits petits et par sujet, chacun compilant seul, avec des messages en anglais au format `type(scope): résumé` (`feat`, `fix`, `test`, `chore`, `docs`).
- Ne pousse pas, ne force pas (`--force`), ne réécris pas l'historique et ne fusionne pas sans demande explicite de l'utilisateur.
- Avant de commiter, relis `git status` et `git diff --cached` : aucun secret, rien de `test-results/` ni de `.env*`.

## Compte rendu

- Rends compte fidèlement : ce qui a été vérifié et comment, ce qui échoue, ce qui n'a pas été fait.
- Signale tout effet de bord, par exemple un service réel touché, une donnée créée ou un réglage modifié.

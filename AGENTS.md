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
- Avant de modifier un parcours (une page, un geste de l'agence ou du client), écris d'abord un test d'interface qui passe sur le code actuel : il prouve ensuite que rien n'a changé pour l'utilisateur.

## Zéro régression : vérifications obligatoires

Avant de déclarer un travail terminé, et avant tout commit :

1. `npx tsc --noEmit -p .` : aucune erreur.
2. `npx eslint src tests` : aucune **nouvelle** erreur. Des erreurs anciennes existent : compare fichier par fichier avec l'état d'avant ta modification (`git stash`), le nombre ne doit augmenter nulle part.
3. `npm run build` : la build passe.
4. `npm run test:e2e` (après `npm run db:up`) : **tous** les tests passent.

Si une vérification échoue, corrige ou explique. Ne livre jamais un travail en échec en le présentant comme terminé.

Lance la suite complète **deux fois** de suite avant de conclure : un test qui ne passe qu'une fois sur deux révèle une course (attente insuffisante, état relu trop tôt), à corriger dans le code ou le test, jamais à ignorer.

Pour les tests :

- Toute fonctionnalité nouvelle, tout correctif et toute règle de sécurité s'accompagnent d'un test dans `tests/e2e/`, utilisant les helpers de `tests/e2e/helpers.ts`. Une règle de sécurité se teste par la tentative **refusée**, pas seulement par le cas permis.
- Ne supprime, n'affaiblis et n'ignore jamais un test pour le faire passer. Si un test échoue, établis d'abord si c'est le code ou le test qui a tort, et dis-le.
- Pas d'attente fixe dans les tests : attends une condition (`expect(...).toBeVisible()`, `expect.poll`, `waitForCode`).
- Les données de test sont uniques par test (`unique()`) et les requêtes SQL des tests filtrent par `organization_id` : plusieurs agences de test partagent les mêmes identifiants.
- Les fichiers de test tournent 4 à la fois (`playwright.config.ts`), les tests d'un même fichier à la suite : un fichier est un groupe. Un test qui partage quelque chose avec d'autres (une adresse fixe comme `demo@kora.test`, une limite comptée pour tous) reste dans le fichier de ceux-ci ; rien ne doit dépendre de l'ordre des fichiers.

## Invariants à ne jamais casser

**Isolation des agences**
- Toute table de données d'agence a `organization_id` dans sa clé primaire. Toute requête la filtre sur l'agence de l'utilisateur (`src/db/state.ts`, `src/lib/session.ts`).
- L'agence vient de la session (`requireAgencyUser`, `getReviewViewer`), jamais d'un paramètre envoyé par le navigateur.

**Le serveur décide, jamais le navigateur**
- Les droits se vérifient côté serveur : rôles dans `src/db/agencyPermissions.ts`, écritures du client dans `src/db/reviewAccess.ts`. Masquer un bouton ne protège rien.
- Le client écrit par une route par action (`src/db/reviewActions.ts`), construite à partir de la base et passée par `sanitizeReviewChanges`. Ne rouvre pas d'écriture générique de l'état côté client. Côté agence, toute écriture passe par `src/db/agencyActions.ts` ou `src/db/workspaceActions.ts`. Une nouvelle écriture prend sa propre route du même type, avec un test d'interface écrit avant.
- Ce que le client écrit est signé par le serveur (nom, initiales, adresse vérifiée).
- Les décisions du client (devis, contre-proposition, validation, demande de modifications) sont réservées aux **décideurs** (`src/lib/clientRoles.ts`) : une nouvelle décision s'ajoute à `deciderActions` et son événement d'audit à `deciderEventTypes`. Seul le client valide une version : l'agence n'a aucune route pour le faire, n'en ajoute pas.
- Une version n'est partagée avec un client que par un geste de l'agence (`ReshareDialog`, « Partager la revue ») ; ne la partage jamais automatiquement à l'import, et ne révèle pas au client une version qui ne lui est pas partagée. Pour comparer, il ne reçoit que les siennes (`sharedVersionsFor`, `GET /api/review/:token/versions`, chacune par `readReviewState`) ; une version non partagée entre deux des siennes n'apparaît que par son numéro, déduit par sa page, sans aucune donnée envoyée (décidé avec le porteur du produit le 22 octobre 2026).
- Le client ne reçoit que `readReviewState` (`src/db/reviewAccess.ts`) : la version partagée, sans les invités des autres ni aucun champ interne de l'agence. Toute donnée nouvelle envoyée au client passe par ce filtre. Une demande de l'agence ne lui apparaît que si l'agence en a choisi le statut (`visibleToClient`) : un pin posé sans statut est le brouillon de l'agence et reste interne jusqu'à sa qualification ; une fois qualifié, tout son fil (premier message et réponses) devient visible du client et de la preuve. Une demande hors scope lui apparaît dès sa qualification, avec son statut (`src/lib/outsideStatus.ts`, décidé avec le porteur du produit le 19 octobre 2026) ; un devis en brouillon jamais, ni son montant ni son existence (le client lit « En cours de chiffrage »). Ses actions sur une demande qu'il ne voit pas répondent 404.
- Une discussion close (`comment.close`, agence seulement, `PUT /api/comments/:id/closure`) est en lecture seule pour tous jusqu'à sa réouverture : toute réponse est refusée, et le client la voit marquée close. Elle ne se clôt pas tant qu'une proposition attend la décision du client.
- Le périmètre de référence d'un projet (`src/lib/projectScope.ts`, onglet « Périmètre ») vit dans les données du projet. Le client n'en lit que la version **active**, réduite à ce qui est inclus et non inclus (`clientScope`, ajouté par `readReviewState` au projet, décidé avec le porteur du produit le 24 octobre 2026) : jamais un brouillon, ni le budget, les tours, les documents ou le nom de qui l'a activé. Ses avenants, côté client, sont les devis acceptés de la version qu'il revoit. Ses documents sont des PDF importés par l'agence elle-même (emplacement `scope`) ; son activation (qui, quand) n'est écrite que par le serveur (`project.scope.activate`, et `project.scope.deactivate` pour le repasser en brouillon, inscrits au journal), jamais lue de la page.
- L'extraction du périmètre (« Extraire avec l'IA », `POST /api/projects/:id/scope/extraction`) ne fait que proposer : rien n'est écrit sans la relecture de l'agence, qui ajoute à son brouillon ce qu'elle garde. Le serveur ne lit qu'un PDF importé par l'agence elle-même (`readOwnPdf`, `src/lib/storage.ts`) ou un texte collé, avec sa limite de débit (`requestLimit.extractions`). Le moteur se branche dans `src/lib/scopeExtractor.ts`, choisi par `AI_PROVIDER`, le seul réglage de l'IA de Kora (décidé avec le porteur du produit le 24 octobre 2026) ; sa réponse passe par `readExtracted`. Sans moteur (réglage vide, ou `anthropic`, dont l'extraction reste à écrire), la route répond 503 et la page le dit. `fake` est la lecture fixe des tests, sans IA.
- La cloche du client (`src/app/review/[token]/ClientNotifications.tsx`) se construit de ce que la page reçoit déjà : réponses de l'agence, devis envoyés à décider, ses propres demandes qualifiées, version plus récente partagée avec lui. La seule donnée ajoutée pour elle est l'heure de qualification de ses demandes (`qualifiedAt`, lue dans le journal par `readReviewState`), jamais le texte du journal. Ce qui a été vu reste dans le navigateur.
- L'auteur d'un message se lit avec `sideOf()` (`src/lib/authors.ts`), jamais avec les initiales.
- Une adresse e-mail n'est jamais montrée en entier à qui n'a pas prouvé qu'elle est la sienne : un lien personnel de revue ou d'invitation d'agence l'affiche masquée (`maskEmail`, `src/lib/maskEmail.ts`), et le code se demande par l'identifiant de l'invitation (`requestedEmail`, `src/db/reviewAuth.ts`).
- Une proposition ne part qu’aux décideurs invités sur la version, par un lien actif et non expiré (`linkDeciders`, `src/lib/linkDeciders.ts`) : sans décideur, le serveur refuse l’envoi, et la fenêtre d’envoi nomme les destinataires ou propose de partager la revue. Ne la présente jamais comme envoyée « au client » de l’espace : un espace n’est pas un client.
- Seul le décideur valide, et jamais avec un devis en attente : la validation est refusée tant qu'un devis envoyé attend la décision du client ; les demandes « À clarifier » restantes sont abandonnées en validant, et l'événement de validation les nomme.

**Revue d'un site de recette** (`public/kora-toolbar.js`, `src/app/review/[token]/site/`, `src/lib/siteReview.ts`)
- La seule page de Kora qui s'affiche dans un cadre est `/review/:token/site`, et seulement sur le site du livrable, en `https` (sauf `localhost`, `securedSite`) : `frame-ancestors` vient de `?parent` (`src/proxy.ts`), et la page ne montre rien si ce n'est pas l'origine du livrable (`reviewedSiteOrigin`). N'ouvre aucun autre cadre, ne retire pas `X-Frame-Options: DENY` ailleurs.
- Un livrable « Lien » est un site déployé en `https` : la création et une nouvelle version refusent une adresse de cet ordinateur, du réseau local ou en `http` (`undeployedSiteProblem`), côté formulaire comme côté serveur.
- Le moment où la barre a été vue sur le site (`src/db/siteSeen.ts`) est un réglage de l'agence, lu par elle seule : il n'entre jamais dans `readReviewState`.
- Le site de l'agence ne reçoit jamais le texte d'une demande, son montant, ni le nom ou l'adresse de son auteur : seulement `SitePin` (élément, position, statut, initiales, côté agence ou client, libellé de Kora), de quoi dessiner les épingles comme dans Kora. Décidé avec le porteur du produit le 17 octobre 2026 : les scripts du site peuvent lire ces informations, comme ils voient déjà l'écran. Tout message entre le site et le panneau a son type dans `src/lib/siteReview.ts`, et chaque côté vérifie l'origine et la fenêtre de l'expéditeur ; jamais `postMessage(…, "*")`.
- Depuis le site, on commente, on annote, on répond et (pour l'agence) on qualifie. Les décisions financières (devis : envoi, acceptation, refus, contre-proposition) et la validation de la version se prennent **sur une page Kora**, jamais dans le cadre : une page que l'agence contrôle pourrait y piéger un clic, et la preuve perdrait sa neutralité.
- L'agence entre dans le panneau par la fenêtre Kora « Je suis de l'agence », avec sa session Kora, et un ticket signé (`src/lib/siteAgency.ts`), jamais par un code (les codes sont aux clients) ni par un jeton dans une adresse ou un message au site. La demande de code ne distingue jamais l'adresse d'un membre de l'agence d'une autre (confirmé par le porteur du produit le 21 octobre 2026). Avec la session du panneau, `agencyActionResponse` n'ouvre que `siteAgencyActions` (`src/lib/siteReview.ts`), sur la version du lien : n'y ajoute ni devis, ni contre-proposition, ni partage, ni validation. Le proxy laisse passer ce cookie vers `/api` : chaque route doit donc vérifier elle-même sa session, comme toutes le font.
- Une demande ne nomme qu'une capture envoyée par la même personne, reconnue comme image à ses octets (`ownCapture`, `imageTypeOf`, `src/lib/siteCapture.ts`) : sinon un client citerait un fichier interne de l'agence et l'ouvrirait par `/api/files`. `/api/files` ne montre une capture qu'à qui voit sa demande.
- Le cadre de Kora sur le site prend deux formes que la barre lui donne (`kora:bubble`, `kora:size`) : une bulle à côté du pin ou du clic, où s'écrit et se lit un commentaire, et la liste des commentaires de la page ; le suivi des demandes (statuts, devis, validation) se fait dans Kora. La bulle est faite des composants de Kora (`ThreadPopover`) : elle change avec eux. Les épingles de la barre recopient celles de Kora (`.canvas-pin` dans `globals.css`, icônes Lucide) : un changement de leur dessin se reporte dans `public/kora-toolbar.js`.
- `public/vendor/modern-screenshot-<version>.js` est la copie de `node_modules/modern-screenshot/dist/index.js` : une mise à jour du paquet se recopie sous le nouveau nom de version, dans la barre et dans le test qui compare les deux.
- La ligne de script porte la clé fixe du livrable, valable pour toutes ses versions (`src/lib/siteKey.ts`, signée sans expiration par `signPermanent`, séparateur `~` : une adresse finissant comme un fichier échapperait à `src/proxy.ts`), jamais le jeton d'un lien ni une clé de toute l'agence : la ligne est lisible par tout visiteur du site, et une clé d'agence permettrait de sonder ses autres sites (décidé avec le porteur du produit le 21 octobre 2026). `/review/site/<clé>` suit les mêmes règles de cadre que le panneau.
- Les tickets (agence, passage vers la revue) sont signés par `src/lib/signedClaim.ts`, chacun avec sa portée, courts, liés au lien, et ne passent que d'une fenêtre Kora à une autre par `postMessage` vérifié : jamais dans une adresse, jamais vers la page du site.
- Les sessions du panneau (`siteSessionCookie` du client, `siteAgencyCookie` de l'agence) sont `SameSite=None` toujours avec `Partitioned` ; la session de la page de revue reste `SameSite=Lax`.

**Figma** (US-054, `src/lib/figma.ts`)
- Un plugin Figma ne lit ni ne touche les commentaires de Figma : tout passe par l'API web de Figma, côté serveur.
- Les clés d'un service tiers sont scellées par `seal` (`src/lib/sealed.ts`, `TOKEN_ENCRYPTION_KEY`) et ne sortent jamais du serveur : ni dans l'état, ni dans une page, une adresse ou un journal. `GET /api/integrations/figma` n'en dit que le nom du compte.
- Chaque membre connecte et retire **son** compte Figma (une ligne par agence et par membre), et agit avec lui : jamais avec le compte d'un collègue, sauf l'import d'une tournée, qui lit avec le compte de qui l'a créée (`figmaImports`) et que reprend le membre qui importe quand ce compte n'est plus connecté. Le code de Figma n'est enregistré que pour la tentative de ce membre dans ce navigateur (`state` signé, cookie, PKCE : `src/lib/figmaOAuth.ts`) ; n'en retire aucun des trois. Un compte Figma connecté entre dans `figmaTeam` et y reste.
- Les lectures de catégorie 1 de Figma (fichier, nœuds, images) sont limitées à **20 par mois** pour une place « lecteur » ou « collaborateur » : jamais une par geste de la page. Les pages d'un fichier se lisent une fois par livrable ; le serveur s'appuie ensuite sur l'attestation signée de sa lecture (`src/lib/figmaReceipt.ts`), liée à l'agence et au fichier, et une tournée reprend les pages de son livrable. Toute nouvelle lecture de catégorie 1 se compte dans les tests (`figmaReads`, `tests/e2e/figmaStandIn.ts`).
- Un livrable « Figma » (`src/lib/figmaLink.ts`) : le serveur ne garde du navigateur que les identifiants choisis (pages, version), vérifiés contre sa propre lecture et l'historique relu auprès de Figma (`figmaRound`, `src/db/workspaceActions.ts`). Une tournée porte une version **nommée** de l'historique de Figma, jamais un enregistrement automatique, et jamais celle de la tournée en cours.
- Un commentaire importé de Figma (`figma` dans la demande, `src/db/figmaImport.ts`) est un brouillon de l'agence tant qu'il n'est pas qualifié, même écrit par le client : il n'entre pas dans `readReviewState` avant (`visibleToClient`). Le client ne modifie ni ne supprime jamais des mots venus de Figma (`clientWords`, `src/db/reviewAccess.ts`). Son auteur est le nom affiché par Figma, jamais une identité vérifiée : il ne compte pas comme une décision du client.
- L'import n'écrit que dans la tournée en cours (jamais une version remplacée ou validée) et n'importe un fil qu'une fois. Les fils de l'agence (compte connecté, `figmaTeam`) restent dans Figma. `figmaTeam` et `figmaImports` sont des réglages de l'agence, jamais envoyés au client.
- « Écrans Figma » (`src/db/figmaScreens.ts`) : le serveur ne télécharge que les adresses que Figma lui a données, gardées dans un ticket signé (`figmaRenderUrl` : stockage de Figma seulement), jamais une adresse envoyée par la page ; il vérifie à ses octets qu'il reçoit une image ou un PDF. Un écran d'une version est un fichier de l'agence (`ownFiles`) ; le client ne l'ouvre que si une version qui lui est partagée le montre (`clientMaySee`, `src/app/api/files/[id]/route.ts`).
- Une réponse d'erreur Figma n'est jamais un `403` : `agencyAction` renvoie alors la page à l'accueil. Non connecté : `409 FIGMA_NOT_CONNECTED` ; limite de Figma atteinte : `429 FIGMA_RATE_LIMITED`.
- Les tests n'appellent jamais Figma : `tests/e2e/figmaStandIn.ts`, démarré par `global-setup.ts`, sur le port 3197 (connexion avec `connectFigma`, `tests/e2e/helpers.ts`).

**Preuve et journal**
- `audit_events` est en ajout seul : jamais d'`UPDATE` ni de `DELETE`. Ne supprime ni ne désactive le trigger. Toute nouvelle colonne s'ajoute au trigger dans une migration.
- L'IP d'une requête se lit avec `requestOrigin()` (`src/lib/api.ts`), jamais directement dans `x-forwarded-for`.
- Une notification porte ce qu'elle concerne (`deliverableId`, et `commentId` ou `open` quand il y a lieu) : la cloche de l'agence l'ouvre (`notificationHref`, `src/app/(agency)/routes.ts`).

**Base de données**
- Toute modification du schéma passe par `npm run db:generate`, et le SQL personnalisé par `npx drizzle-kit generate --custom`. Ne modifie jamais une migration déjà appliquée, même seulement en local. La marche à suivre (base de test migrée par les tests, base locale `kora` par `npm run db:migrate`, renommage sans terminal interactif) : [README.md](README.md), « Migrations, pas à pas ». Vérifie `DATABASE_TARGET` dans `.env.local` avant toute migration : `remote` vise la base en ligne.
- Toute nouvelle table active la sécurité par ligne dans sa migration (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`) : sans elle, l'API publique de Supabase l'exposerait.
- `readState` (`src/db/state.ts`) lit tout l'état d'une agence en **une seule requête SQL**. Une nouvelle collection s'y ajoute dans la même requête ; ne la remplace pas par une suite de requêtes : chacune coûte un aller-retour vers la base en ligne.
- Une migration ne s'applique sur la base en ligne (`DATABASE_TARGET=remote npm run db:migrate`) qu'avec l'accord explicite de l'utilisateur, et avant le déploiement du code qui en dépend.

**IA**
- Une suggestion de qualification (`src/lib/ai/`) ne s'applique jamais seule : elle pré-remplit, l'agence décide. Le client ne la voit jamais (elle n'entre pas dans `readReviewState`), et la preuve garde la décision de l'agence, pas l'avis du modèle.
- Le modèle s'appelle côté serveur seulement ; sa clé n'est jamais une variable `NEXT_PUBLIC_*`. Sa réponse passe par `readSuggestion` (décision connue, ligne parmi celles du périmètre) avant d'être montrée. Le texte du client lui est donné comme une donnée, entre balises, jamais comme une consigne.
- Les tests n'appellent jamais un vrai modèle : `AI_PROVIDER=fake`, ou un faux serveur local à la place de l'API (`tests/e2e/ai-suggestion.spec.ts`).

**Fichiers**
- Les fichiers passent par `src/lib/upload.ts` (envoi direct au stockage, par blocs au-delà de 8 Mo, vérifié par le serveur, qui verrouille le fichier par un bail permanent avant de le relire : aucune adresse d'écriture ne peut plus le remplacer), `storeFile()` et `/api/files` (`src/lib/storage.ts`) : conteneurs privés, accès vérifié, adresse signée courte (`FILE_LINK_SECONDS`, 5 minutes) ; celle d'une vidéo dure sa longueur plus 15 minutes, longueur plafonnée à 3 heures (`videoLinkSeconds`), car elle se lit par morceaux, et le canevas en redemande une si elle expire. Jamais de conteneur public, jamais de fichier en base64 dans l'état. Seuls les types qui n'exécutent rien (images PNG, JPEG, GIF, WebP, AVIF, PDF, vidéo, son) s'ouvrent dans la page ; tout autre fichier (SVG, HTML…) est servi en téléchargement (`shownInline`, `readableUrl`), car ouvert à son adresse il exécuterait ses scripts. Le canevas affiche toujours un SVG, en image.

**Routes API**
- Un fichier `route.ts` n'exporte que des méthodes HTTP. Les helpers vont dans `src/lib/`.
- Une adresse `/api/…` qu'aucune route ne sert répond `404 { error }` (`src/app/api/[...unknown]/route.ts`) : ne la laisse jamais retomber sur les pages.
- Valide toutes les entrées. Côté client, réponds 404 plutôt que 403 quand la réponse révélerait l'existence d'une ressource.
- Toute écriture passe par une route par action (`POST /api/…/comments`), qui construit ses changements depuis la base. `/api/state` est en lecture seule : ne rouvre aucune écriture générique de l'état, ni côté agence ni côté client.
- Une route d'action passe par `agencyActionResponse` (`src/lib/agencyActionRoute.ts`) ou `reviewActionResponse` (`src/lib/reviewViewer.ts`) : session, limite de débit, réserves des rôles, et réponse avec l'état à jour, que la page applique sans le relire. Côté navigateur, elle s'appelle par `agencyAction` ou `reviewAction`, jamais par un `fetch` à part.
- Une page n'envoie jamais l'état : elle envoie l'action, et l'état renvoyé par le serveur remplace ce qu'elle affiche. Un affichage provisoire du geste (la page client le fait) ne doit jamais être réécrit au serveur.
- Une route publique qui envoie des e-mails ou crée des données a sa limite de débit (`withinLimit`, `src/db/requestLimits.ts`). Une route hors du filtre de `src/proxy.ts` (`/api/files`) vérifie elle-même `crossSiteWrite`.
- Les e-mails passent par `sendMail` et `renderMail` (`src/lib/mail.ts`, `src/lib/mailTemplates.ts`), en HTML et en texte, avec un « Répondre à » vers une vraie personne. Destinataires et liens : `src/db/mailTargets.ts` (propriétaire et administrateurs côté agence, **décideurs** seulement côté client). Un e-mail lié à une action part **après** son enregistrement et ne la fait jamais échouer (`src/db/reviewMails.ts`).
- Une demande saisie par l'agence peut porter sa source (`src/lib/requestSource.ts` : canal, date, extrait, capture), visible par le client et reprise dans la preuve. Une capture est une image importée par l'agence elle-même (emplacement `request`, `readPlacement` dans `src/lib/storage.ts`), que le client n'ouvre que s'il voit la demande.
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
- Ne fais pas grossir `src/app/(agency)/AgencyApp.tsx` (près de 2 900 lignes) : place un nouvel écran ou une nouvelle logique dans son propre composant ou module (comme `InviteList.tsx`).
- Interface : composants de `src/components/ui` (shadcn), couleurs et espacements des jetons de `src/theme/tokens.css`, pas de couleur codée en dur. Accessibilité : un libellé pour chaque champ, des rôles corrects, tout utilisable au clavier.
- Pas de `setState` synchrone dans un `useEffect`, pas de fonction impure pendant le rendu (règles React du linter). Préfère un état dérivé (de l'adresse, des données) à un effet.
- N'ajoute pas de `eslint-disable`, et ne contourne pas une règle par un mécanisme qui la fait taire : `useEffectEvent`, par exemple, coupe la règle de pureté sur tout `AgencyApp.tsx`. Si un contournement te semble nécessaire, vérifie qu'une erreur volontaire (`Math.random()` dans le rendu) est toujours signalée, puis retire-la.

## Git

- Une branche par sujet, jamais de travail direct sur `master`.
- Des commits petits et par sujet, chacun compilant seul, avec des messages en anglais au format `type(scope): résumé` (`feat`, `fix`, `test`, `chore`, `docs`).
- Ne pousse pas, ne force pas (`--force`), ne réécris pas l'historique et ne fusionne pas sans demande explicite de l'utilisateur.
- Avant de commiter, relis `git status` et `git diff --cached` : aucun secret, rien de `test-results/` ni de `.env*`.

## Vocabulaire

- Une **demande** est tout retour du livrable, posé par un clic (avec un repère) ou par « + Demande » (sans repère : reçue ailleurs, ou sur tout le livrable). Les **commentaires** sont les réponses dans son fil. Le champ `kind` (`remark` / `request`) est un vestige : la qualification fait foi. Un pin est un **commentaire** jusqu'à sa qualification, puis une **demande** avec un titre ; une demande remise « À clarifier » garde son titre et reste une demande (`isTitledRequest`, `itemLabel` dans `src/app/(agency)/editor/CanvasComments.tsx`).
- Qualifications : « À clarifier » (valeur `À qualifier`), « Inclus » (`Inclus`, prévu au devis), « Hors scope » (`Hors périmètre`, ajout à chiffrer). L'ancienne valeur `À traiter` en base se lit « À clarifier ». La page « À traiter » (`/a-traiter`) est autre chose : les décisions en attente de l'agence sur tous les projets.
- Rôles d'agence : propriétaire, administrateur, membre. Rôles du client sur une revue : décideur, contributeur.

## Pièges connus

- **Édition de fichiers par script** : n'ouvre jamais un fichier en écriture avant de l'avoir lu (en Python, `open(p, "w")` le vide aussitôt). Après une modification par script, vérifie `git diff --stat` : un fichier qui perd presque toutes ses lignes a été vidé, restaure-le depuis git.
- **Tests de l'éditeur** : la page relit l'état après chaque action ; attends l'élément ou la valeur en base (`expect.poll`) avant le geste suivant, jamais un délai fixe.
- **Livrables de test** : un livrable créé par `seedState` doit avoir les champs d'un vrai (`importedAt`, `type`, `version`…), sinon la page plante sur des données qu'aucun utilisateur ne produit.
- **Sélecteurs** : beaucoup de boutons existent deux fois (bulle du fil et panneau latéral). Limite la recherche à la zone visée (`getByRole("dialog", …)`, une ligne du panneau).
- **Services réels** : la base en ligne, Azure et Resend servent des agences réelles ; aucune commande ne les touche sans demande explicite.
- **Base locale copiée de la base en ligne** : elle contient de vraies adresses de clients. Avant tout essai d'invitation, de relance ou de devis en local, `MAIL_TRANSPORT=console` dans `.env.local`, sinon les e-mails partent vraiment. Les fichiers restent sur l'Azure en ligne : `STORAGE_TARGET=remote` pour les voir, mais tout import local y irait aussi.
- **Tests du site de recette** : le faux site est servi par `route.fulfill` sur une adresse `https://…test`, et sa page reçoit la permission `local-network-access` (`otherSitePerson`) : sans elle, Chrome interdit à une page publique d'appeler Kora sur `localhost`, ce qui n'arrive pas en ligne.
- **Aide `upload` des tests** : elle déduit le type du fichier de son extension (`.pdf`, `.png`, `.webm`) ; une capture d'un autre type est refusée par le serveur, à raison.
- **Vidéos de test** (`tests/e2e/fixtures/`) : en WebM, le seul format que le Chromium des tests lit (pas de H.264). `screen-recording.webm` a une seule image clé, comme une capture d'écran : il déclenche l'avertissement « Le rendu de cette vidéo risque d’être dégradé par moments ».

## Compte rendu

- Rends compte fidèlement : ce qui a été vérifié et comment, ce qui échoue, ce qui n'a pas été fait.
- Signale tout effet de bord, par exemple un service réel touché, une donnée créée ou un réglage modifié.

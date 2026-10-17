# Technologies de Kora

Ce document récapitule les technologies utilisées par Kora (nom de code ScopeGuard), leur rôle et la raison de leur choix. Il complète [README.md](README.md), qui explique comment lancer le projet, et [AZURE_PRODUCTION_TRAJECTORY.md](AZURE_PRODUCTION_TRAJECTORY.md), qui décrit la cible de production.

État au 17 octobre 2026.

## Vue d'ensemble

```mermaid
flowchart LR
    Agence[Navigateur de l'agence] --> App
    Client[Navigateur du client] --> App
    subgraph App[Application Next.js]
        Pages[Pages React] --> API[Routes API]
        Proxy[proxy.ts] --> Pages
    end
    API --> DB[(PostgreSQL<br/>Docker ou Supabase)]
    API --> Blob[(Azure Blob Storage<br/>Azurite en local)]
    API --> Mail[Resend<br/>e-mails]
    Client -. lecture signée 5 min .-> Blob
    Agence -. envoi direct signé 15 min .-> Blob
```

Une seule application Next.js porte l'interface et le serveur. Le navigateur ne parle jamais directement à la base. Il ne touche au stockage qu'avec une adresse signée par le serveur, courte et limitée à un fichier : lecture après vérification des droits, ou création d'un fichier que le serveur relit ensuite. Tout le reste passe par les routes API, qui vérifient l'identité et les droits.

## Les technologies, couche par couche

### Interface

| Technologie | Version | Rôle |
| --- | --- | --- |
| **Next.js** (App Router, Turbopack) | 16.3.8 | Cadre de l'application : pages, routes API, compilation. Version exacte figée. |
| **React** | 19.2.8 | Interface. |
| **TypeScript** | 5.9 | Typage de tout le code, interface comme serveur. |
| **Tailwind CSS** | 4.3 | Styles utilitaires, reliés aux jetons du design system Kora (`src/theme/tokens.css`). |
| **shadcn/ui** et **Radix UI** | 4.21 / 1.8 | Composants accessibles : fenêtres, menus, onglets, infobulles. |
| **lucide-react** | 1.56 | Icônes. |
| **sonner** | 2.0 | Notifications à l'écran. |
| **react-pdf** et **pdf.js** | 11.0 / 6.3 | Affichage des PDF. pdf.js est chargé dans sa version « legacy » (`next.config.ts`) : la version moderne exige des navigateurs très récents. |
| **react-zoom-pan-pinch** | 4.2 | Zoom et déplacement sur le plan de travail. |
| **modern-screenshot** | 4.7.0 (exacte) | Capture de la fenêtre quand une demande est posée sur le site de recette. Sa version navigateur est copiée dans `public/vendor/modern-screenshot-4.7.0.js` et chargée par la barre au premier clic seulement ; un test vérifie que la copie est celle du paquet installé. Choisie pour sa légèreté (29 Ko, aucune dépendance) et parce que le navigateur dessine lui-même la page (CSS moderne fidèle). |

### Serveur et données

| Technologie | Version | Rôle |
| --- | --- | --- |
| **Routes API Next.js** | — | Le back-end : `src/app/api/`. Pas de serveur séparé. |
| **PostgreSQL** | 17 | Base de données. Docker en local, Supabase (Francfort) en ligne, Azure Database for PostgreSQL à terme. Choisie pour les relations entre les données, les transactions et la sécurité par ligne. |
| **Drizzle ORM** et **drizzle-kit** | 0.45 / 0.31 | Accès à la base en TypeScript, schéma (`src/db/schema.ts`) et migrations versionnées (`drizzle/`). |
| **node-postgres** (`pg`) | 8.23 | Pilote PostgreSQL. |

### Authentification

| Technologie | Version | Rôle |
| --- | --- | --- |
| **Better Auth** | 1.7.10 | Comptes de l'agence : e-mail et mot de passe (haché en scrypt), Google en option, réinitialisation, limitation des tentatives. Module « organization » pour les agences, les membres, les rôles et les invitations. Les données restent dans notre base. |
| **Accès client maison** | — | Les clients n'ont pas de compte : lien personnel, code à 6 chiffres par e-mail, appareil reconnu 30 jours (`src/db/reviewAuth.ts`). |

### Fichiers

| Technologie | Version | Rôle |
| --- | --- | --- |
| **Azure Blob Storage** | SDK 12.34 | Fichiers importés : un conteneur privé par agence, rangé par projet, livrable et version, fichiers nommés par leur empreinte SHA-256 (`src/lib/storage.ts`). Lecture par adresse signée valable 5 minutes. Import envoyé directement par le navigateur avec une adresse de création seule (15 minutes), puis relu et vérifié par le serveur (`src/lib/upload.ts`). |
| **Azurite** | 3.35 | Émulateur officiel d'Azure Storage, dans Docker, pour le développement et les tests. |

### E-mails

| Technologie | Rôle |
| --- | --- |
| **Resend** (API HTTP) | Invitations, codes d'accès, relances, réinitialisations, demandes d'accès, devis envoyés et décisions du client. Domaine `gmmforge.com` vérifié (SPF, DKIM ; DMARC à ajouter). Chaque e-mail part en HTML et en texte, avec « Répondre à » vers le membre de l'agence concerné (`src/lib/mail.ts`, `src/lib/mailTemplates.ts`). |

### Tests et qualité

| Technologie | Version | Rôle |
| --- | --- | --- |
| **Playwright Test** | 1.63 | 97 tests de bout en bout (`tests/e2e/`, `npm run test:e2e`) : l'application compilée pour la production, une base de test recréée à chaque lancement, Azurite, e-mails écrits dans un fichier. Couvre la connexion, les agences et leurs rôles, chaque geste de l'agence et du client dans l'interface et par l'API (refus compris), l'accès client et ses rôles, les fichiers, la preuve, les relances et les notifications. |
| **ESLint** | 9.39 | Analyse du code, avec la configuration de Next.js. |
| **Prettier** | 3.9 | Mise en forme. |

### Outils de développement

| Outil | Rôle |
| --- | --- |
| **Docker Compose** | PostgreSQL et Azurite en local (`npm run db:up`). |
| **Agentation** | Annotation de l'interface pour les agents IA, en développement seulement. |
| **Node.js** | 22 LTS. |

### Hébergement

| Service | Usage |
| --- | --- |
| **Vercel** | Déploiement actuel (prévisualisations et pilotes). Fonctions à Francfort (`fra1`, fixé dans `vercel.json`), à côté de Supabase : chaque requête à la base ne fait qu'un aller-retour court. |
| **Supabase** | PostgreSQL en ligne. Seule la base est utilisée : ni son API REST (fermée par la sécurité par ligne), ni son authentification, ni son stockage. |
| **Azure** | Stockage des fichiers aujourd'hui ; cible de production pour l'application et la base (voir la trajectoire Azure). |

## Environnements

Chaque service se choisit par une variable, de la même façon :

| Variable | `local` | `remote` |
| --- | --- | --- |
| `DATABASE_TARGET` | PostgreSQL dans Docker | Supabase, puis Azure |
| `STORAGE_TARGET` | Azurite dans Docker | Compte Azure Storage |

Les e-mails partent par Resend dès que `RESEND_API_KEY` et `MAIL_FROM` sont renseignées. `MAIL_TRANSPORT=console` les affiche dans la console sans jamais les envoyer, quoi qu'il arrive : c'est le mode des tests. La liste complète des variables est dans [.env.example](.env.example). Les secrets ne sont jamais commités : `.env.local` en local, les variables d'environnement de Vercel en ligne.

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/app/(agency)/` | L'espace agence (l'application principale, l'éditeur, la barre latérale, l'équipe). |
| `src/app/review/[token]/` | La page de revue du client et son écran de vérification. |
| `src/app/connexion`, `bienvenue`, `invitation`, `reinitialiser` | Connexion, création de l'agence, invitation d'un collègue, nouveau mot de passe. |
| `src/app/api/` | Les routes API. |
| `src/db/` | Schéma, lecture de l'état (`state.ts`), actions de l'agence (`agencyActions.ts`, `workspaceActions.ts`) et du client (`reviewActions.ts`, règles dans `reviewAccess.ts`), accès client (`reviewAuth.ts`), droits (`agencyPermissions.ts`), preuve (`proof.ts`). |
| `src/lib/` | Authentification, sessions, stockage, e-mails, rôles client (`clientRoles.ts`), lecture de l'état et envoi des actions côté navigateur (`stateSync.ts`, `actionRequest.ts`). |
| `src/proxy.ts` | Redirection rapide vers `/connexion` sans session (l'ancien « middleware » de Next.js). |
| `drizzle/` | Migrations SQL, à appliquer avant chaque déploiement qui en ajoute. |
| `tests/e2e/` | La suite de tests. |

## La sécurité, en bref

- **Isolation des agences** : chaque enregistrement porte l'identifiant de son agence dans sa clé primaire, et le serveur filtre chaque requête dessus.
- **Rôles** : les décisions commerciales et irréversibles sont réservées aux administrateurs, et le serveur les refuse aux membres (`src/db/agencyPermissions.ts`).
- **Clients** : ils n'accèdent qu'à la version partagée avec eux, sans voir qui d'autre est invité. Seuls les décideurs désignés par l'agence prennent les décisions (devis, validation) ; les contributeurs commentent. Ils écrivent une action à la fois, que le serveur construit depuis la base : leurs propres commentaires, leurs décisions et la validation. Le serveur signe ce qu'ils écrivent avec leur nom et leur adresse vérifiée (`src/db/reviewActions.ts`, `src/db/reviewAccess.ts`).
- **Journal d'audit** : il est en ajout seul, et un trigger PostgreSQL refuse toute modification ou suppression. Chaque événement garde l'heure du serveur, l'identité constatée, l'IP et le navigateur. Il alimente la preuve de validation (`src/db/proof.ts`).
- **Base** : la sécurité par ligne est activée sur toutes les tables, ce qui ferme l'API publique de Supabase.
- **Fichiers** : les conteneurs sont privés, l'accès est vérifié avant chaque lecture, et l'adresse signée n'est valable que 5 minutes. Une adresse d'import ne permet que de créer un fichier, jamais de le lire ou d'en remplacer un ; le serveur recalcule l'empreinte de ce qu'il reçoit et supprime tout fichier non conforme.
- **Adresses IP** : seule l'adresse ajoutée par un proxy de confiance est retenue (`TRUSTED_PROXY_HOPS`). Sinon, elle est marquée « non vérifiée ».
- **En-têtes HTTP** (`next.config.ts`, `src/lib/securityHeaders.ts`) : politique de sécurité du contenu en production (scripts et connexions limités au site et au stockage, pas de plugin, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS en HTTPS. Next.js ne s'annonce plus. Les scripts gardent `'unsafe-inline'` : une politique à nonces rendrait toutes les pages dynamiques.
- **Requêtes d'un autre site** : toute écriture dont l'origine n'est pas le site est refusée (`src/proxy.ts`, `crossSiteWrite`), en plus des cookies `SameSite=Lax`.
- **Panneau sur le site de recette** (US-048) : la seule page que Kora laisse afficher dans un cadre, `/review/:token/site`, et seulement par le site du livrable (`frame-ancestors` posé par `src/proxy.ts`, origine vérifiée par la page). Ses sessions (client, agence) sont des cookies partitionnés, propres à ce site ; celle de l'agence vient d'un ticket signé remis par une fenêtre Kora, et n'ouvre que commenter, répondre et qualifier sur la version du lien. Une demande n'y nomme qu'une capture envoyée par son auteur (image JPEG ou PNG reconnue à ses octets, `src/lib/siteCapture.ts`) : jamais un autre fichier de l'agence. Le script du site et le panneau vérifient l'origine et la fenêtre de chaque message, et le site ne reçoit jamais le texte des demandes.
- **Limites de débit** (`src/db/requestLimits.ts`), comptées en base : imports par heure, enregistrements par minute, invitations par heure, réglables par variable d'environnement, et 10 demandes d'accès par heure et par adresse IP. Elles s'ajoutent aux limites de connexion (Better Auth) et des codes client.
- **Adresses `/api` inconnues** : elles répondent `404 { error }` (`src/app/api/[...unknown]/route.ts`) au lieu de retomber sur les pages.

## Points d'attention

- **Synchronisation d'état** : les pages lisent l'état par `/api/state` (agence) et `/api/review/:token` (client), en une seule requête SQL (`readState`), et le relisent toutes les 2 secondes ; chaque action renvoie l'état à jour dans sa réponse. Elles ne l'écrivent jamais : chaque écriture a sa route par action (`src/db/agencyActions.ts`, `workspaceActions.ts`, `reviewActions.ts`). Les routes du client serviront aussi à l'annotation des sites web.
- **Imports abandonnés** : un fichier envoyé au stockage sans validation y reste (aucun enregistrement ne le sert). Un nettoyage périodique est à prévoir.
- **Fichiers antérieurs au stockage Azure** : la table `files` est conservée, mais ses fichiers ne sont plus servis (Supabase n'en contient aucun).
- **`npm audit`** signale encore, en production, des paquets qui ne sont pas exploitables dans Kora : `drizzle-kit` et `esbuild` (tirés par Better Auth ; la faille d'esbuild concerne son serveur de développement), `source-map-js` (compilation CSS) et `sharp` (optimisation d'images de Next, désactivée par `images.unoptimized`). À revoir à chaque mise à jour de ces dépendances.
- **Dette** : `src/app/(agency)/AgencyApp.tsx` fait près de 2 900 lignes (à découper au fil des évolutions de l'éditeur), et 20 erreurs ESLint anciennes restent à traiter.
- **Sauvegardes et suivi des erreurs** : à vérifier (offre Supabase) et à brancher (Sentry ou équivalent) avant d'élargir les pilotes.

## Commandes utiles

| Commande | Effet |
| --- | --- |
| `npm run db:up` | Démarre PostgreSQL et Azurite. |
| `npm run db:migrate` | Applique les migrations sur la base choisie (`DATABASE_TARGET`). |
| `npm run db:generate` | Crée une migration après une modification du schéma. |
| `npm run dev` | Lance l'application en développement. |
| `npm run test:e2e` | Lance la suite de tests (Docker doit tourner). |
| `npm run build` | Compile l'application pour la production. |

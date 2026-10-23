# Kora (nom de code ScopeGuard)

> Le portail de validation client qui transforme les demandes hors perimetre en decisions facturees.

> **État du produit.** Kora est en ligne pour des pilotes (Vercel à Francfort, Supabase, Azure, Resend). Les sections qui suivent décrivent le positionnement et le MVP visé ; l'état réel de chaque fonctionnalité est suivi dans [PERSONAS_USER_STORIES.md](PERSONAS_USER_STORIES.md#suivi-de-réalisation). La pile et la sécurité sont décrites dans [TECHNOLOGIES.md](TECHNOLOGIES.md), les règles pour les agents IA dans [AGENTS.md](AGENTS.md).

Kora est un SaaS destine aux agences web, studios de design et consultants creatifs. Il centralise les retours clients sur des livrables visuels et aide les equipes a transformer chaque demande en une decision claire : incluse dans le perimetre, modification mineure, ou prestation supplementaire a chiffrer.

Le produit ne cherche pas a etre un simple outil de commentaires sur PDF. Son objectif est de proteger la marge des agences, accelerer les validations et fournir une preuve exploitable de ce qui a ete demande, accepte et livre.

## Le probleme

Les agences produisent des maquettes, identites visuelles, sites web, landing pages, rapports et documents marketing. Leur validation client est souvent dispersee entre :

- e-mails, messages WhatsApp et conversations Slack ;
- captures d'ecran annotees manuellement ;
- fichiers PDF avec commentaires difficiles a consolider ;
- outils de gestion de projet que les clients utilisent peu ;
- demandes vagues, formulees apres une premiere livraison.

Cette fragmentation rend les decisions ambigues. Un retour tel que "ajouter une section" peut etre traite comme une petite correction, alors qu'il implique parfois plusieurs jours de conception, developpement et validation supplementaires.

Les consequences sont concretes :

- retards de livraison dus aux relances et aux validations implicites ;
- travail non facture parce que le hors perimetre n'est pas identifie assez tot ;
- tensions entre l'agence et son client sur ce qui etait compris dans le devis ;
- perte de contexte entre le commentaire initial, la reponse, le devis et la facture ;
- difficulte a prouver quelle version a ete effectivement approuvee.

## Notre reponse

Kora place la discussion directement sur le livrable et structure le parcours de decision.

1. L'agence importe un PDF, une image ou une vidéo dans un projet, ou donne l'adresse de son site de recette (le client commente alors directement le site, avec la barre Kora).
2. Le client recoit un lien de revue simple, sans devoir apprendre un outil de gestion de projet.
3. Les commentaires sont attaches a un emplacement precis du livrable.
4. L'agence qualifie chaque demande : `Inclus`, `Hors scope` ou `À clarifier`.
5. Pour une demande hors perimetre, l'agence cree une proposition complementaire avec un descriptif, un cout, un impact sur le planning et une date limite de validite.
6. Le client accepte ou refuse explicitement cette proposition.
7. La version finale est approuvee et verrouillee avec un journal horodate des decisions.

Chaque retour devient ainsi soit une action prevue, soit une prestation supplementaire acceptee. Le travail additionnel ne reste plus cache dans une chaine d'e-mails.

## Proposition de valeur

**Pour les agences :** recuperer du temps facturable et reduire les litiges de perimetre.

**Pour les clients :** donner un retour clair et approuver un livrable sans naviguer dans un outil complexe.

**Pour les chefs de projet :** obtenir un historique unique qui relie commentaire, arbitrage, devis, approbation et livraison.

La promesse produit est simple :

> Chaque retour client devient une decision claire, et chaque travail supplementaire peut etre accepte avant d'etre realise.

## Utilisateurs cibles

Le produit commencera par les petites et moyennes agences qui realisent des livrables visuels et travaillent au forfait.

| Segment | Situation | Valeur apportee |
| --- | --- | --- |
| Agences web | Retours repetes sur wireframes, maquettes et recettes de sites | Encadrer les revisions et chiffrer les nouvelles demandes |
| Studios de branding | Multiples allers-retours sur logos, identites et chartes | Tracer les validations de versions et limiter les cycles |
| Agences marketing | Validations de landing pages, publicites, rapports et campagnes | Accelérer les approbations et rendre les changements visibles |
| Freelances premium | Peu de temps administratif et risque eleve de travail gratuit | Formaliser les decisions sans imposer un outil lourd au client |

Le premier segment recommande est celui des agences web de 3 a 30 personnes. Elles ont des projets suffisamment structures pour souffrir du hors perimetre, mais n'ont pas toujours les outils ou procedures des grandes entreprises.

## Positionnement

Kora est un **systeme de controle du perimetre client pour agences creatrices de livrables visuels**.

La validation visuelle est le point d'entree. La valeur distinctive est la transformation d'un retour client en decision operationnelle et commerciale avant que le travail soit engage.

Ce positionnement evite deux erreurs courantes :

- devenir un clone d'outil d'annotation PDF ;
- devenir un outil de gestion de projet generaliste que les clients evitent d'utiliser.

## Comparaison avec les alternatives

| Alternative | Ce qu'elle fait bien | Limite pour notre cas | Difference Kora |
| --- | --- | --- | --- |
| Filestage / Ziflow | Relecture, commentaires et circuits de validation de contenu | Oriente production et conformite ; le lien avec le hors perimetre et le devis reste secondaire | Qualification native des demandes et creation de propositions supplementaires |
| Frame.io | Revue video avancee : plages de temps, dessin, image par image, comparaison de versions | Optimise surtout les workflows de production video | La video y est commentee (moment et endroit, US-052), au service du perimetre commercial, comme les PDF, les maquettes et les sites |
| Marker.io / BugHerd | Retours poses sur le site, contexte technique (navigateur, console), envoi vers Jira, Asana, Linear, Slack | Le retour part en ticket sans etre qualifie ni chiffre | Chaque retour est qualifie, chiffre si besoin et accepte par le client avant d'etre execute |
| MarkUp.io | Commentaires visuels rapides et simples | Peu de mecanismes pour transformer un retour en accord commercial | Du commentaire a la proposition acceptee, avec une piste d'audit |
| ClickUp / Asana / Trello | Taches, planification et travail interne | L'experience client est trop lourde et le contexte visuel est limite | Un espace client focalise sur une decision par livrable |
| CRM / devis / facturation | Devis, contrats, factures et suivi commercial | Le contexte du retour se perd avant le devis | Le devis complementaire part du commentaire visuel exact qui l'a motive |
| E-mail et messageries | Universels et immediats | Decisions dispersees, aucune traçabilite fiable, pas de garde-fou commercial | Un historique unique, structure et exportable |

La concurrence valide l'existence du besoin de revue et d'approbation. Kora ne cherche pas a gagner par un plus grand catalogue de fonctionnalites. Il gagne par une question plus proche de la marge : **cette demande etait-elle incluse, et le client a-t-il accepte de payer le supplement avant execution ?**

## Fonctionnalites du MVP

Le MVP doit permettre de tester ce positionnement avec un flux complet, sans construire un outil de production generaliste.

### Projets et livrables

- Espaces de travail par agence.
- Projets associes a un client.
- Import de PDF, d'images et de vidéos (jusqu'à `MAX_VIDEO_UPLOAD_MB`, 1 Go par défaut).
- Revue d'un site de recette : le livrable « Lien » et la barre Kora sur le site (US-048), qui remplacent la capture d'une page depuis une URL.
- Versions de livrables avec statut clair : brouillon, en revue, modifications demandees, approuve.

### Revue client

- Liens partageables et proteges.
- Commentaires positionnes sur un point precis du document.
- Sur une vidéo, commentaires posés sur un moment et un endroit de l'image : la frise montre un repère par commentaire, et ouvrir un commentaire ramène la vidéo à son moment (US-052). À l'import, Kora prévient l'agence, sans bloquer, d'une vidéo que le navigateur ne lit pas ou dont les sauts « baveront » (images clés trop rares, fréquent avec les enregistreurs d'écran).
- Fils de discussion, et discussion close par l'agence : lecture seule pour tous jusqu'à sa réouverture.
- Comparaison de deux versions d'une image ou d'un PDF, côté agence comme côté client (US-053) : la frise des versions, côte à côte avec le zoom synchronisé ou un rideau avant/après, les demandes de l'ancienne version posées dessus, les PDF page par page. Le client ne compare que les versions qui lui sont partagées ; une version non partagée entre elles n'apparaît que par son numéro.
- Boutons explicites `Demander des modifications` *(regle serveur faite, bouton a ajouter cote client)* et `Approuver la version`.
- Relances par e-mail pour les validations en attente.
- Revue d'un site de recette, à la manière de la barre de Vercel : le client commente directement le site *(essai, voir plus bas)*.

### Controle du perimetre

- Qualification de chaque demande : `incluse`, `modification mineure`, `hors perimetre`, `a clarifier` *(realise : « Inclus », « Hors scope » et « À clarifier »)*.
- Justification interne facultative pour l'equipe *(a faire)*.
- Conversion d'un commentaire en proposition complementaire.
- Proposition comprenant description, prix, impact planning et date d'expiration *(la date d'expiration est a faire)*.
- Acceptation ou refus explicite par le client.

### Tracabilite

- Journal horodate des commentaires, classifications, reponses et approbations.
- Version approuvee verrouillee et identifiable.
- Export partageable du recapitulatif de validation.
- Historique disponible avant emission d'une facture ou en cas de litige.

## Ce qui est volontairement hors MVP

Les elements suivants sont utiles mais ne doivent pas retarder la validation du besoin principal :

- Lecture video avancee : plages de temps, dessin sur l'image, image par image, comparaison de versions *(la base est faite : moment et endroit, US-052)*.
- Coedition en temps reel.
- Edition de documents dans le produit.
- Connecteurs vers de nombreux outils de gestion de projet.
- Generation automatique de contrats complexes.
- Classification automatique des demandes par IA *(une suggestion, que l'agence confirme toujours, est prevue avec le perimetre de reference, US-045)*.
- Gestion comptable complete.

Une integration Stripe, puis des connecteurs vers les outils deja utilises par les agences, seront abordes une fois que le parcours commentaire -> devis complementaire -> acceptation sera valide.

## Modele economique

Kora est un produit B2B par abonnement. Sa valeur est liee au chiffre d'affaires protege et au temps administratif evite, et non au volume brut de fichiers importes.

| Offre | Prix indicatif | Inclut |
| --- | ---: | --- |
| Solo | 19 USD / mois | 1 utilisateur, projets et liens client limites |
| Studio | 49 USD / mois | Petite equipe, projets actifs et historique de validation |
| Agence | 119 USD / mois | Equipe, branding, propositions supplementaires et exports |
| White-label | A partir de 299 USD / mois | Domaine personnalise, marque blanche, controles avances et support prioritaire |

Les leviers de monétisation complementaires peuvent inclure les utilisateurs supplementaires, un volume de projets actifs plus eleve, la conservation longue duree des preuves et les integrations de facturation.

## Hypotheses a valider

Le projet repose sur des hypotheses explicites a tester avant un investissement produit important :

1. Les agences perdent regulierement une quantite mesurable de temps ou de marge a cause de demandes hors perimetre.
2. Les equipes veulent qualifier ces demandes au moment du retour client, pas seulement pendant la facturation.
3. Les clients accepteront un lien de revue dedie si l'experience est plus simple qu'un outil de projet.
4. Une proposition complementaire reliee a une demande visuelle precise reduit les discussions et facilite l'acceptation.
5. Les agences sont pretes a payer entre 49 et 119 USD par mois si le produit permet de recuperer au moins une partie de leur travail non facture.

## Strategie de validation

Avant de construire un ensemble large de fonctionnalites, mener des entretiens avec 15 a 20 dirigeants d'agences web et studios de design.

Questions de recherche :

- Sur vos trois derniers projets, quelles demandes n'etaient pas prevues au devis initial ?
- Combien d'heures non facturees ces demandes ont-elles represente ?
- Comment decidez-vous aujourd'hui si un retour est inclus ou hors perimetre ?
- Comment obtenez-vous l'accord du client avant de commencer une prestation supplementaire ?
- Pouvez-vous montrer un exemple anonymise d'un e-mail ou d'une conversation qui a cree une ambiguite ?
- Accepteriez-vous de tester un prototype sur un projet client reel ?

Le signal le plus fort n'est pas une reponse positive abstraite. C'est une agence qui accepte de tester le flux sur un projet en cours, partage ses procedures actuelles ou souhaite payer pour eviter une perte de marge recurrente.

## Mesures de succes

Le produit doit demontrer un effet concret sur le flux commercial des agences.

- Taux de clients qui ouvrent un lien de revue.
- Delai moyen entre envoi et approbation.
- Nombre de demandes qualifiees hors perimetre par projet.
- Taux d'acceptation des propositions complementaires.
- Montant de chiffre d'affaires supplementaire accepte via Kora.
- Temps moyen consacre aux relances de validation.
- Taux de projets disposant d'une preuve de validation complete.

## Vision

A terme, Kora doit devenir la source de verite des decisions client sur les projets au forfait : le lieu ou une demande est contextualisee, arbitree, chiffree, acceptee et rattachee a une livraison.

Le produit ne remplace pas un outil de gestion de projet, un CRM ou une solution comptable. Il les relie au moment le plus fragile de la relation agence-client : celui ou une remarque apparemment simple peut se transformer en travail gratuit.

## Lancer le prototype en local

Les données sont enregistrées dans PostgreSQL. Le fichier `.env.local` choisit la base avec `DATABASE_TARGET` : `local` (Postgres dans Docker) ou `remote` (Supabase, puis Azure).

```bash
cp .env.example .env.local   # puis renseigner BETTER_AUTH_SECRET (et DATABASE_URL_REMOTE si besoin)
npm install
npm run db:up                # Postgres et Azurite (émulateur Azure Storage) dans Docker
npm run db:migrate           # crée les tables sur la base choisie par DATABASE_TARGET
npm run dev
npm run test:e2e             # la suite de tests : base de test kora_test recréée, e-mails écrits dans un fichier
```

- Base en ligne (Supabase) : `DATABASE_URL_REMOTE` = chaîne « Session pooler » (Connect › Session pooler), puis `DATABASE_TARGET=remote npm run db:migrate`. Toutes les tables ont la sécurité par ligne activée sans règle : l'API REST publique de Supabase n'y voit rien, l'application (propriétaire des tables) n'est pas concernée. Désactivez aussi l'API de données (Project Settings › Data API). Les variables `NEXT_PUBLIC_SUPABASE_*` ne servent pas.
- `npm run db:generate` : crée une migration après une modification de `src/db/schema.ts`.
- `npm run db:studio` : explore les données.
- Le journal d'audit (`audit_events`) est en ajout seul : la base refuse toute modification ou suppression d'un événement.

### Déploiement

L'application tourne sur Vercel, dans la région de Francfort (`fra1`, fixée par [vercel.json](vercel.json)), à côté de la base Supabase : une base éloignée multiplie la latence de chaque action. À chaque déploiement :

1. **Migrations d'abord.** Si le déploiement ajoute des fichiers dans `drizzle/`, appliquez-les sur la base en ligne **avant** de déployer le code : `DATABASE_TARGET=remote npm run db:migrate`.
2. **Variables d'environnement** (Vercel › Settings › Environment Variables), voir [.env.example](.env.example) : `DATABASE_TARGET=remote`, `DATABASE_URL_REMOTE` (pooler Supabase de Francfort), `DATABASE_SSL_CA` (le texte PEM du certificat), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (l'adresse publique), `TRUSTED_PROXY_HOPS=1`, `STORAGE_TARGET=remote` et les `STORAGE_*_REMOTE`, `RESEND_API_KEY`, `MAIL_FROM` ; selon les besoins, `GOOGLE_*`, `MICROSOFT_*`, `DEMO_REQUESTS_TO`, `MAX_VIDEO_UPLOAD_MB` et `FILE_LINK_SECONDS`. Jamais `MAIL_TRANSPORT` en ligne. Vercel sépare les variables *Production* et *Preview* : cochez aussi *Preview* pour qu'une branche se construise, en sachant que sa préversion utilise alors la vraie base et le vrai Azure.
3. **E-mails** : le domaine d'envoi doit avoir SPF, DKIM et un enregistrement DMARC, sans quoi les codes d'accès arrivent en spam.
4. **Une dépendance ajoutée** et la build échoue sur un module introuvable : relancez le déploiement sans le cache de build (*Redeploy*, « Use existing Build Cache » décoché).
5. **Après le déploiement**, un onglet resté ouvert sur l'ancienne version doit être rechargé.

### Fichiers importés

Les fichiers vont dans Azure Blob Storage (`src/lib/storage.ts`), choisi par `STORAGE_TARGET` comme la base : `local` (Azurite, dans Docker) ou `remote` (compte Azure). Chaque agence a son propre conteneur privé, enregistré dans `agency_storage` avec son compte, pour pouvoir lui donner plus tard un compte à part. Dans le conteneur, les fichiers suivent l'organisation de l'agence :

```
agence-<agence>/projets/<id>/livrables/<id>/v<version>/<sha256>.<ext>
agence-<agence>/projets/<id>/livrables/<id>/couverture/<sha256>.<ext>
```

Le fichier est nommé par son empreinte SHA-256 : une version ne peut pas changer de contenu sans changer de nom. Les chemins utilisent les identifiants, pas les noms, et ne bougent pas si l'on renomme ou déplace un projet (la base fait foi). Les pages n'accèdent jamais au stockage : `/api/files/<id>` vérifie que la personne est membre de l'agence, ou client vérifié invité sur une revue qui montre ce fichier, puis redirige vers une adresse en lecture seule valable 5 minutes (`FILE_LINK_SECONDS`). Une vidéo se lit par morceaux, chacun avec cette adresse : la sienne dure donc sa longueur plus 15 minutes (longueur lue par le navigateur de l'agence à l'import, comptée jusqu'à 3 heures), et si elle expire quand même (pause, onglet laissé ouvert), le canevas en redemande une et reprend au même moment. La taille maximale d'un import est `MAX_UPLOAD_MB` (50 par défaut) ; une vidéo importée comme version a la sienne, `MAX_VIDEO_UPLOAD_MB` (1 024 par défaut), car un film pèse bien plus qu'une maquette.

L'import ne passe pas par l'application (dont l'hébergeur limite la taille des requêtes, 4,5 Mo sur Vercel) : la page calcule l'empreinte du fichier et demande une autorisation (`POST /api/files/upload`), qui vérifie session, place, taille et limite de débit. Elle reçoit une adresse d'écriture valable 15 minutes (une minute de plus par 25 Mo, 6 heures au plus), qui ne permet que de créer ce fichier-là (ni le lire, ni en remplacer un autre), et un jeton signé par le serveur. Elle envoie le fichier à Azure, puis demande sa validation (`POST /api/files/complete`) : le serveur relit le fichier dans le stockage et recalcule lui-même l'empreinte ; s'il ne correspond pas à celui annoncé, il est supprimé et refusé (`src/lib/upload.ts`, `prepareUpload` et `completeUpload` dans `src/lib/storage.ts`). Un fichier de toute taille, jusqu'à un film de plusieurs Go : la page lit le fichier par morceaux de 8 Mo pour en calculer l'empreinte (@noble/hashes, déjà utilisé par Better Auth), sans jamais le charger en entier, et au-delà de 8 Mo l'envoie en blocs, 4 à la fois, un bloc raté renvoyé seul, que le stockage assemble ensuite ; l'import affiche son avancement. Un envoi en blocs demande le droit d'écriture, et pas seulement de création : avant de relire le fichier, le serveur le verrouille donc par un bail Azure permanent, dont personne ne garde l'identifiant. Une fois enregistré, aucun fichier ne peut plus être remplacé, même avec l'adresse qui a servi à l'envoyer.

- Le compte Azure reçoit une règle CORS (toutes origines, GET, HEAD et PUT) : le lecteur PDF suit la redirection avec une origine « null », et la page envoie les fichiers directement. Sans adresse signée, rien n'est lisible ni modifiable.
- pdf.js est chargé dans sa version « legacy » (`next.config.ts`) : la version moderne exige des navigateurs très récents.
- Les fichiers importés avant ce changement (table `files` de Postgres) ne sont plus servis : réimportez-les si besoin.

### Connexion

Un visiteur non connecté voit à `/` la page d'accueil publique (`/decouvrir`), avec « Réserver une démo » (`/demo`, transmise par e-mail à `DEMO_REQUESTS_TO`) et « Commencer » (`/commencer`, la création du compte). L'espace agence demande un compte (`/connexion`) : e-mail et mot de passe (12 caractères au moins, variés, rien de courant ni de personnel, `src/lib/passwordPolicy.ts`), ou Google et Microsoft si leurs clés sont renseignées. L'adresse est confirmée par un lien envoyé par e-mail avant la première connexion (les comptes créés avant cette règle sont considérés comme confirmés, migration `0008`) ; une adresse Microsoft n'en est dispensée que si Microsoft la garantit, et une invitation d'agence ne s'accepte qu'avec une adresse confirmée.

Chaque compte travaille dans une agence. Après l'inscription, la personne crée la sienne (`/bienvenue`) et en devient propriétaire, puis met en place son premier espace, son premier projet et ses collègues (`/demarrer`), ou rejoint l'agence qui l'a invitée. Le propriétaire et les administrateurs invitent leurs collègues depuis le menu du compte, « Équipe » : l'invité reçoit un lien `/invitation/:id` qu'il ne peut accepter qu'avec l'adresse invitée. Le lien ne montre que le nom de l'agence et l'adresse masquée : l'invité saisit lui-même son adresse. Toutes les données sont rangées par agence (`organization_id` dans chaque clé primaire) et le serveur filtre chaque requête sur l'agence du membre ; retirer quelqu'un de l'équipe lui coupe l'accès immédiatement.

| Rôle | Peut faire |
| --- | --- |
| Membre | Tout le travail de production : voir, commenter, importer des versions, qualifier une demande, préparer un devis en brouillon, partager une revue, restaurer depuis la corbeille |
| Administrateur | En plus : envoyer un devis, répondre à une contre-proposition, révoquer un lien client, supprimer un espace ou un projet, vider la corbeille, gérer l'équipe |
| Propriétaire | En plus : supprimer l'agence, nommer un autre propriétaire |

Le serveur refuse ces actions à un membre (`src/db/agencyPermissions.ts`), l'interface les affiche grisées avec la raison.

Le client n'a ni compte ni mot de passe. L'agence l'invite par e-mail depuis « Partager la revue » ; il reçoit un lien personnel, qui ne contient qu'un identifiant aléatoire et montre son adresse masquée (`c•••••@client.fr`) : celui qui détient le lien n'apprend pas l'adresse, et le code est demandé par l'identifiant de l'invitation, puis envoyé à l'adresse invitée; sinon, rien ne lui révèle qu'elle existe. Tant que personne n'est invité, « Partager la revue » prévient que le lien copié ne s'ouvrira pour personne. Avec le lien copié-collé, seule une adresse invitée reçoit un code ; l'écran du code dit aux autres de demander une invitation à la personne qui leur a transmis le lien. Personne ne peut demander l'accès depuis Kora (retiré pour des raisons de sécurité le 21 octobre 2026) ; les demandes reçues avant se règlent encore dans « Partager la revue ». Retirer une invitation coupe l'accès immédiatement. Le lien ne donne accès qu'à la version partagée, et le serveur n'accepte du client que ses propres commentaires, ses décisions sur les propositions envoyées et la validation, signés de son adresse vérifiée (voir `src/db/reviewAuth.ts` et `src/db/reviewAccess.ts`).

Chaque invité a un rôle sur la revue (`src/lib/clientRoles.ts`). Un **décideur** valide la version, demande des modifications, accepte ou refuse les devis et fait des contre-propositions. Un **contributeur** consulte, commente et répond. L'agence choisit le rôle en invitant (décideur par défaut) et peut le changer dans « Partager la revue » ; une demande d'accès acceptée donne le rôle de contributeur. Le serveur refuse les décisions d'un contributeur, les relances ne partent qu'aux décideurs, et la page du client ne reçoit jamais la liste des autres invités.

« + Demande » sert aux demandes reçues ailleurs (e-mail, appel, réunion, Slack, Figma) ou portant sur tout le livrable. Leur source (canal, date, extrait collé, capture) est visible par le client, qui voit ainsi qu'il s'agit de sa propre demande, et figure dans la preuve avec l'empreinte de la capture (`src/lib/requestSource.ts`). La capture est une image importée par l'agence (`projets/<id>/livrables/<id>/demandes/`), que le client n'ouvre que s'il voit la demande.

Le client voit ses propres demandes, et celles de l'agence dont elle a choisi le statut : « Inclus », « À clarifier » créée par « + Demande », et « Hors scope » une fois un devis envoyé. Un pin posé par l'agence sur le rendu, sans statut choisi, reste interne tant qu'elle ne l'a pas qualifié ; sa bulle l'indique. Sa qualification propose les mêmes trois choix que « + Demande » : « À clarifier » avec un titre le rend visible au client. Ce que l'agence a écrit pour elle-même reste interne : le texte du pin et les réponses écrites avant que le client voie la demande. Le client, comme la preuve, lit le titre et la description, puis les échanges qui suivent (`src/lib/internalNotes.ts`) ; l'éditeur marque ces messages « Interne ». Un devis en brouillon ne quitte jamais le serveur, pas même dans les données reçues par la page. Une demande cachée est introuvable pour le client, y compris par l'API (`visibleToClient`, `src/db/reviewAccess.ts`).

La page du client écrit une action à la fois, chacune sur sa route (`src/db/reviewActions.ts`). Le serveur construit la modification à partir de ce qu'il a en base, la passe par les règles du client, puis l'applique en une transaction, avec son événement d'audit et, pour une décision, la notification de l'agence. Une action que les règles refusent est refusée en entier (409).

| Route (`/api/review/:token/…`) | Action |
| --- | --- |
| `POST comments` | Commentaire sur la version, ou demande posée sur le site de recette (`site`) |
| `PATCH comments/:id` | Modifier son commentaire (`message`) ou déplacer son repère (`page`, `x`, `y`) |
| `DELETE comments/:id` | Supprimer son commentaire, tant que l'agence ne l'a pas qualifié |
| `POST comments/:id/replies` | Répondre dans un fil de la version |
| `PATCH`, `DELETE comments/:id/replies/:replyId` | Modifier ou supprimer sa réponse |
| `POST proposals/:id/decision` | Accepter ou refuser un devis envoyé, une seule fois |
| `POST proposals/:id/adaptation` | Demander une adaptation, si l'agence l'a permise |
| `POST changes-request` | Demander des modifications |
| `GET versions` | Les versions de ce livrable partagées avec ce client, chacune comme sa page la montrerait, pour les comparer |
| `POST approval` | Valider la version, ce qui la verrouille ; refusé tant qu'un devis envoyé attend la décision du client (la fenêtre de validation les liste, à accepter ou refuser). Les remarques encore « À clarifier » sont abandonnées en validant : la fenêtre le dit et les liste, le journal les nomme |

Dans la cloche, chaque activité ouvre ce qu'elle concerne : une décision du client ouvre la demande, une demande d'accès reçue avant leur retrait ouvre « Partager la revue » sur le livrable, une relance ouvre la version (`notificationHref`, `src/app/(agency)/routes.ts`). Les notifications plus anciennes, ou dont le livrable a disparu, restent du simple texte.

Seul le client valide une version, depuis sa page : l'agence n'a aucune route pour le faire. L'agence suit le même chemin pour toutes ses écritures (`src/db/agencyActions.ts`, `src/db/workspaceActions.ts`) : le serveur signe chaque message avec le membre, refuse toute écriture sur une version validée ou remplacée et sur une demande dont le devis est tranché, et applique aux membres les réserves de `src/db/agencyPermissions.ts`. `/api/state` est en lecture seule : les pages lisent l'état et le relisent après chaque action.

| Route (`/api/comments…`) | Action de l'agence |
| --- | --- |
| `POST /api/comments` | Commentaire (`deliverableId`, `message`…), demande saisie par l'agence (`request` : « À clarifier », « Inclus » ou « Hors scope », avec sa source facultative : canal, date, extrait, capture), ou commentaire remis après sa suppression (`restore`) |
| `PATCH /api/comments/:id` | Modifier un message de l'agence (`message`) ou déplacer un repère (`page`, `x`, `y`) |
| `DELETE /api/comments/:id` | Supprimer un commentaire de l'agence |
| `PUT /api/comments/:id/closure` | Clore une discussion (lecture seule pour tous, refusé tant qu'une proposition attend le client) ou la rouvrir |
| `PUT /api/comments/:id/qualification` | « Inclus », « Hors scope » avec un chiffrage en brouillon, « À clarifier » avec un titre (visible du client), ou retour « À clarifier » sans titre |
| `POST /api/comments/:id/replies` | Répondre |
| `PATCH`, `DELETE /api/comments/:id/replies/:replyId` | Modifier ou supprimer une réponse de l'agence |
| `POST /api/comments/:id/proposal` | Envoyer un premier devis écrit dans la fenêtre de proposition (administrateurs) |
| `POST /api/comments/:id/proposal/send` | Envoyer le devis en brouillon (administrateurs) |
| `POST /api/comments/:id/proposal/versions` | Nouvelle version : envoyée à la place du devis en attente (`send: true`, administrateurs), ou rechiffrage après un refus, en brouillon (`send: false`) |
| `POST /api/comments/:id/adaptation/decision` | Accepter ou refuser la contre-proposition du client (administrateurs) |
| `POST /api/deliverables/:id/review-link` | Lien client de la version : l'actif, ou un nouveau au jeton tiré par le serveur |
| `DELETE /api/deliverables/:id/review-link` | Révoquer le lien (administrateurs) |
| `DELETE /api/deliverables/:id/review-link/invites/:email` | Retirer une invitation, ce qui coupe l'accès de cette adresse |
| `POST /api/deliverables/:id/reopen` | Rouvrir la validation, avec la raison dans le journal |
| `PATCH /api/deliverables/:id/review-link` | Expiration du lien après 7 jours, ou jamais (`autoExpire`) |
| `POST /api/spaces`, `PATCH`, `DELETE /api/spaces/:id` | Créer, renommer, supprimer un espace (suppression : administrateurs) |
| `POST /api/projects`, `PATCH`, `DELETE /api/projects/:id` | Créer, renommer (`name`), déplacer (`clientId`), supprimer un projet (suppression : administrateurs) |
| `POST /api/deliverables` | Nouveau livrable, ses fichiers importés au préalable |
| `POST /api/deliverables/:id/versions` | Nouvelle version : les précédentes sont figées |
| `PATCH`, `DELETE /api/deliverables/:id` | Renommer (`name`), déplacer (`projectId`) ou mettre à la corbeille toutes les versions d'un livrable |
| `POST /api/trash/:id/restore` | Restaurer un élément de la corbeille |
| `DELETE /api/trash/:id`, `DELETE /api/trash`, `DELETE /api/trash/expired` | Supprimer définitivement un élément, tout, ou ce qui a plus de 30 jours (administrateurs) |

- E-mails de devis et de décisions (`src/db/reviewMails.ts`) : un devis envoyé, ou la réponse à une contre-proposition, part par e-mail aux **décideurs** du client, avec leur lien personnel (« Répondre à » : l'administrateur qui l'a envoyé). Chaque décision du client (devis accepté ou refusé, contre-proposition, validation, demande de modifications) part au **propriétaire et à tous les administrateurs** de l'agence, avec un lien vers la demande (« Répondre à » : le client). Ni les membres ni les contributeurs ne les reçoivent. Un e-mail qui échoue est journalisé et n'annule jamais l'action.
- E-mails : renseignez `RESEND_API_KEY` et `MAIL_FROM` (domaine vérifié dans Resend, avec SPF, DKIM et DMARC). Chaque e-mail part en HTML avec sa version texte, et avec un « Répondre à » vers le membre de l'agence concerné (ou `MAIL_REPLY_TO`) : l'adresse d'envoi n'a pas de boîte. `MAIL_TRANSPORT=console` n'envoie jamais rien et affiche les e-mails dans la console, même avec une clé Resend (tests, démonstrations). Sans clé, en développement, ils s'affichent dans la console ; ailleurs, l'agence copie le lien personnel de chaque invité depuis « Partager la revue ».

### Revue d'un site de recette (essai, US-048)

Pour un livrable « Lien », dont l'adresse est le site de recette, le tableau du livrable (« Paramétrer la barre Kora ») donne une ligne de script à placer **une seule fois** sur le site, et le lien à envoyer au client (l'adresse du site suivie de `?kora`, aussi dans les e-mails d'invitation et de relance) :

```html
<script src="https://<kora>/kora-toolbar.js" data-site="<clé du livrable>" defer></script>
```

- Le tableau du livrable donne la ligne selon l'outil du site (HTML, Next.js avec `<Script>` dans `app/layout.tsx`, WordPress, Webflow, Shopify, Tag Manager) et dit, en direct, quand la barre a été vue sur le site : son panneau demandé dans un cadre par le site du livrable lui-même (`src/db/siteSeen.ts`, un réglage de l'agence, écrit au plus toutes les 5 minutes, jamais envoyé au client).
- La clé est fixe pour le livrable, signée par Kora (`src/lib/siteKey.ts`, `GET /api/deliverables/:id/site-key`) : `/review/site/<clé>` ouvre la dernière version partagée avec un lien actif, ou dit qu'aucune ne l'est. La ligne ne change donc ni avec les versions ni avec les liens, et le jeton du lien n'apparaît plus sur le site. Une ligne plus ancienne, avec `data-review="<jeton>"`, ouvre toujours sa version.
- Le script (`public/kora-toolbar.js`) n'affiche la barre qu'à qui a ouvert le site avec `?kora`, puis s'en souvient sur l'appareil. Il ouvre le panneau Kora (`/review/:token/site`) dans un cadre servi par Kora.
- Le panneau ne s'affiche que sur le site du livrable : le proxy n'autorise que l'origine qu'il nomme (`frame-ancestors`), et la page vérifie que c'est celle du livrable (`reviewedSiteOrigin`). Toutes les autres pages de Kora refusent toujours d'être affichées dans un cadre.
- Le client s'y vérifie par le même code e-mail. Sa session est un cookie partitionné (`kora_review_site_session`, `SameSite=None; Partitioned`), que le navigateur ne garde que pour ce site.
- Sur le site, le logo Kora en bas à droite, déplaçable, qui garde sa place sur l'appareil. Un clic déplie la barre avec les outils du canevas de Kora : « Naviguer » (`V`, par défaut : le site fonctionne normalement) et « Commenter » (`C` : chaque clic sur un élément ouvre un commentaire, jusqu'au retour à « Naviguer » ou Échap), « Commentaires » (la liste de ceux de la page, à droite) et l'aide ; une aide s'affiche à la première ouverture. Un commentaire s'écrit et se lit dans une bulle à côté de l'épingle ou du clic, comme sur le canevas. Il passe par `POST comments` avec sa place (`site` : page, élément, position dans l'élément, largeur d'écran, `src/lib/siteReview.ts`), puis suit le parcours habituel côté agence.
- L'agence aussi travaille sur le site : « Je suis de l'agence » ouvre une petite fenêtre Kora, qui voit la session habituelle du membre et remet au panneau un ticket signé (2 minutes, pour ce lien). Le panneau l'échange contre sa propre session (`kora_agency_site_session`, partitionnée, 12 heures, liée au membre, à l'agence et à la version ; l'appartenance et le lien sont relus à chaque requête : un membre retiré, un lien révoqué ou expiré la ferment aussitôt). L'agence y voit toutes les épingles, y compris ses brouillons, pose ses commentaires, répond et qualifie. Depuis le site, ses routes n'ouvrent que ces gestes (`siteAgencyActions`) et seulement sur cette version : devis, contre-propositions et partage répondent `403 KORA_ONLY`, à faire dans Kora.
- Au clic, la barre capture la fenêtre telle que le client la voit, sans la barre ni le panneau (`modern-screenshot`, chargé depuis Kora au premier clic). Le panneau l'envoie (`POST /api/review/:token/site/capture` : image JPEG ou PNG, 3 Mo au plus), puis la demande la nomme. La barre dessine dans l'image le cadre de l'élément visé et le point du clic : la capture se suffit à elle-même, où qu'on l'ouvre. Elle se voit dans le fil de la demande, côté agence comme côté client, et la preuve garde l'empreinte de cette image annotée. C'est une copie reconstituée, pas une photo de l'écran : une image d'un autre site qui refuse d'être lue y reste blanche. Si la capture échoue (site qui bloque les scripts de Kora, Safari capricieux), la demande part sans.
- La bulle a l'apparence de Kora parce qu'elle en reprend les composants : le fil de Kora (`ThreadPopover` : réponses, modification, qualification par l'agence). Sur le site, les épingles sont celles de Kora : initiales de l'auteur sur un commentaire, icône et couleur du statut sur une demande.
- Le site ne reçoit que de quoi dessiner les épingles (élément, position, statut, initiales, libellé), jamais le texte des demandes, leur montant ni l'identité complète de leur auteur, qui restent dans le cadre. Une épingle dont l'élément a disparu est signalée « élément introuvable ».
- Le livrable « Lien » doit être un site déployé en `https` : Kora refuse, à la création comme pour une nouvelle version, une adresse de cet ordinateur, du réseau local ou en `http` (une page en `http` peut être modifiée en chemin, et le client n'ouvrirait pas une adresse locale). Une nouvelle version demande l'adresse du site, pré-remplie avec celle de la précédente.
- Dans Kora, un livrable « Lien » s'affiche en tableau de recette (`src/app/(agency)/editor/SiteBoard.tsx`), côté agence comme côté client : une feuille en forme de fenêtre de navigateur qui dit quoi faire (le paramétrage pour l'agence, les étapes pour le client), puis chaque demande comme une page du canevas, sa capture avec son épingle là où le clic a eu lieu. L'agence peut épingler ses propres brouillons sur une capture et les déplacer. « Ouvrir le site » ouvre la recette avec la barre.
- Les devis et la validation restent sur la page de revue : une page que l'agence contrôle ne doit pas pouvoir piéger un clic sur une décision. Le panneau signale ce qui attend le client (« 1 devis attend votre décision ») et ouvre la revue dans un onglet sans redemander de code : l'onglet reçoit du panneau un ticket signé (2 minutes, cette adresse et ce lien, `src/lib/siteHandoff.ts`), échangé contre la session habituelle tant que l'adresse reste invitée.

Limites de l'essai : testé dans Chrome seulement (Safari et Firefox à vérifier à la main) ; le site de l'agence doit accepter le script et le cadre de Kora s'il a sa propre politique de sécurité ; les numéros des épingles diffèrent entre la vue de l'agence (pins internes compris) et celle du client.

### Commentaires Figma (en cours, US-054)

Kora lira les commentaires des fichiers Figma de l'agence pour les qualifier. Un plugin Figma ne peut ni toucher à l'interface de Figma ni lire ses commentaires : seule l'API web de Figma le permet. Étape 1, faite : la connexion.

- Dans « Paramètres de l'agence », le propriétaire ou un administrateur clique sur « Connecter Figma ». Figma demande son accord, puis revient sur Kora (`GET /api/integrations/figma/connect`, puis `/callback`). Un membre voit l'état de la connexion, sans pouvoir la changer.
- La tentative est liée au membre, à l'agence et au navigateur : un `state` signé (10 minutes), un cookie de ce navigateur avec la même valeur et le vérificateur PKCE (`src/lib/figmaOAuth.ts`). Le code de Figma n'est enregistré que si les trois correspondent, et si le membre peut encore gérer l'agence.
- Les clés de Figma sont scellées en base (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`, `src/lib/sealed.ts`), dans `figma_connections`, une ligne par agence. Elles ne sont jamais envoyées à une page : `GET /api/integrations/figma` ne donne que le nom du compte Figma et qui l'a connecté.
- « Déconnecter Figma » efface les clés (`DELETE /api/integrations/figma`). Figma ne permet pas de les révoquer : on retire aussi Kora dans les paramètres du compte Figma.
- À configurer : une application OAuth sur figma.com/developers, avec l'adresse de retour `<BETTER_AUTH_URL>/api/integrations/figma/callback` et les autorisations de `figmaScopes` (`src/lib/figma.ts`). Puis `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET` et `TOKEN_ENCRYPTION_KEY` (voir [.env.example](.env.example)). Sans eux, la section Figma n'apparaît pas. Une application privée ne sert qu'à l'équipe Figma qui l'a créée : pour d'autres agences, Figma doit l'approuver.
- Les tests n'appellent jamais Figma : un faux serveur local (`tests/e2e/figmaStandIn.ts`) tient sa place.

### Preuve de validation

« Synthèse & export » produit, depuis la base et non depuis la page, la preuve d'une version : empreinte SHA-256 du fichier validé, chaque demande avec sa qualification et ses devis, chaque décision avec l'identité constatée par le serveur (membre de l'agence ou adresse e-mail vérifiée du client), l'heure du serveur et l'adresse IP, puis le journal complet de la version et l'empreinte du récapitulatif (`src/db/proof.ts`). Le journal est en ajout seul, IP et navigateur compris.

- L'IP est lue dans `x-forwarded-for` : en ligne, renseignez `TRUSTED_PROXY_HOPS` (1 derrière Azure Front Door ou Vercel) pour ne garder que l'adresse ajoutée par le proxy ; sans proxy déclaré, l'adresse est marquée « non vérifiée », car un visiteur peut envoyer son propre en-tête.

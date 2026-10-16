# Personas et user stories de ScopeGuard

Ce document définit les utilisateurs prioritaires et les besoins fonctionnels du MVP de ScopeGuard. Il complète le cadrage produit de [README.md](README.md) et le plan d'exécution de [PLAN_EXECUTION.md](PLAN_EXECUTION.md).

ScopeGuard ne doit pas être conçu comme un simple outil d'annotation. Le produit doit aider les agences à transformer chaque retour client en décision claire : travail inclus, demande à clarifier ou prestation supplémentaire acceptée.

> **Mise à jour du 15 octobre 2026.** Le prototype s'appelle désormais **Kora** dans l'interface. Il dispose d'une base de données PostgreSQL, de comptes agence (e-mail et mot de passe, Google en option), d'agences isolées avec équipe et rôles, et d'un accès client vérifié par code e-mail. Les stories existantes ont été mises à jour en conséquence, les nouvelles stories sont regroupées dans les Epics 14 à 16, et la section [Suivi de réalisation](#suivi-de-réalisation) donne l'état de chaque story.
>
> **Mise à jour du 16 octobre 2026.** Kora est en ligne (Vercel à Francfort, Supabase, Azure, e-mails Resend). Une adresse agence est confirmée par e-mail avant la première connexion. Les fichiers sont envoyés directement au stockage et vérifiés par le serveur. Chaque action, de l'agence comme du client, passe par sa propre route et est contrôlée par le serveur. Seul le client valide une version ; l'agence peut rouvrir une validation en donnant la raison.

## Personas prioritaires

Le produit concerne une relation à trois niveaux : l'agence qui vend et produit, le membre de l'agence qui gère le projet et le client qui valide et paie.

### Persona 1 : dirigeant d'agence

**Profil**

- Fondateur ou directeur d'une agence web.
- Agence de 3 à 30 collaborateurs.
- Projets vendus au forfait.
- Responsable de la rentabilité et de la relation client.
- Utilise plusieurs outils qui ne sont pas toujours bien intégrés.

**Problèmes**

- Le travail hors périmètre réduit la marge.
- L'équipe accepte parfois des demandes supplémentaires sans les facturer.
- Les litiges apparaissent lorsque le client affirme que la demande était incluse.
- Il ne sait pas combien de revenus sont perdus à cause des modifications non cadrées.

**Objectifs**

- Protéger la marge des projets.
- Réduire les discussions conflictuelles avec les clients.
- Obtenir une preuve claire des décisions.
- Détecter les demandes supplémentaires avant leur réalisation.

**Pourquoi il achète**

Il n'achète pas simplement un outil de commentaires. Il achète la possibilité de récupérer du chiffre d'affaires perdu et de réduire les risques de litige.

> Je veux que mon équipe arrête de faire gratuitement des modifications qui n'étaient pas prévues dans le devis.

### Persona 2 : chef de projet ou account manager

**Profil**

- Gère plusieurs projets en parallèle.
- Fait le lien entre le client, les designers et les développeurs.
- Relance les clients et centralise les retours.
- Est généralement l'utilisateur principal de ScopeGuard.

**Problèmes**

- Les retours arrivent sur plusieurs canaux.
- Il doit reformuler les demandes pour l'équipe.
- Il ne sait pas toujours si un changement est inclus dans le devis.
- Les validations sont longues et difficiles à prouver.
- Il perd du temps à relancer les clients.

**Objectifs**

- Centraliser les retours.
- Obtenir une réponse claire pour chaque demande.
- Identifier rapidement le hors périmètre.
- Envoyer une proposition complémentaire sans recréer tout un devis.
- Savoir quelle version du livrable est actuellement approuvée.

**Pourquoi il utilise le produit**

ScopeGuard lui fait gagner du temps et lui donne une procédure claire pour traiter les demandes délicates.

> Je veux pouvoir répondre à chaque commentaire client sans fouiller dans trois outils différents.

### Persona 3 : designer ou développeur

**Profil**

- Produit le livrable soumis à validation.
- Travaille sur des maquettes, pages web, identités visuelles ou documents.
- N'est pas nécessairement responsable de la relation commerciale.

**Problèmes**

- Il reçoit des demandes vagues ou contradictoires.
- Il commence parfois une modification avant que son périmètre soit confirmé.
- Il ne sait pas quelle version du fichier est définitive.
- Il reçoit des retours par captures d'écran ou messages incomplets.

**Objectifs**

- Voir précisément où se trouve le commentaire.
- Savoir si la demande est validée et planifiée.
- Ne travailler que sur les demandes confirmées.
- Éviter les modifications annulées ou contradictoires.

**Pourquoi il utilise le produit**

Pour obtenir des demandes exploitables, contextualisées et validées.

> Je veux travailler sur une demande claire, liée à la bonne version, avec une décision explicite.

### Persona 4 : client approbateur

**Profil**

- Responsable marketing, fondateur, directeur de communication ou représentant métier.
- N'utilise pas ScopeGuard tous les jours.
- Reçoit un lien envoyé par l'agence.
- N'a ni compte ni mot de passe : il confirme son adresse e-mail avec un code à usage unique.
- Peut valider une maquette, demander une modification ou accepter un supplément.

**Problèmes**

- Il ne sait pas toujours où commenter.
- Il reçoit parfois plusieurs versions par e-mail.
- Il ne comprend pas toujours pourquoi une demande est facturée en plus.
- Il trouve les outils de gestion de projet trop lourds.

**Objectifs**

- Donner un retour rapidement.
- Comprendre les conséquences de sa demande.
- Voir le prix et l'impact planning d'une modification supplémentaire.
- Approuver explicitement la bonne version.

**Pourquoi il accepte d'utiliser le produit**

Son expérience doit être plus simple qu'un échange d'e-mails.

> Je veux voir ce qui doit changer, comprendre le coût éventuel et valider en quelques clics.

### Persona 5 : responsable administratif ou financier

Ce persona n'est pas prioritaire pour le premier MVP, mais il deviendra utile plus tard.

**Besoins**

- Vérifier qu'un supplément a été accepté.
- Rattacher la décision à une facture.
- Télécharger un historique de validation.
- Contrôler les montants facturés.

Ce persona justifie les futures intégrations avec Stripe, les outils de facturation ou les CRM.

## Persona principal du MVP

> Le chef de projet d'une agence web de 3 à 30 personnes qui gère des validations client et perd du temps ou de la marge sur les demandes hors périmètre.

Le décideur économique est le dirigeant d'agence, mais l'utilisateur quotidien est le chef de projet.

| Rôle | Fonction dans l'achat |
| --- | --- |
| Dirigeant | Paie et évalue le retour financier ; propriétaire de l'agence dans Kora |
| Chef de projet | Utilise ScopeGuard chaque jour ; administrateur dans Kora |
| Designer ou développeur | Produit le livrable et traite les demandes ; membre dans Kora |
| Client final | Commente, accepte ou refuse |
| Finance | Exploite les preuves et les factures plus tard |

## User stories du MVP

### Epic 1 : gérer une agence

#### US-001 : créer un espace agence

**En tant que** dirigeant d'agence,  
**je veux** créer un espace de travail,  
**afin de** centraliser mes projets et mon équipe.

**Critères d'acceptation**

- Un espace agence peut être créé avec un nom, juste après l'inscription (page « Bienvenue »).
- Le créateur devient **propriétaire** de l'agence.
- Un compte ne peut créer qu'une agence ; il peut en rejoindre d'autres sur invitation.
- Les données de l'agence sont isolées des autres organisations : chaque enregistrement porte l'identifiant de l'agence et le serveur filtre chaque requête dessus.
- Une nouvelle agence démarre vide, sans données de démonstration.
- Le nom et les paramètres de l'agence peuvent être modifiés *(possible par l'API, écran à faire)*.

#### US-002 : inviter un collaborateur

**En tant que** administrateur,  
**je veux** inviter un chef de projet ou un membre de l'équipe,  
**afin de** travailler sur les mêmes projets.

**Critères d'acceptation**

- Le propriétaire ou un administrateur saisit une adresse e-mail depuis « Équipe », dans le menu du compte.
- Le rôle (`Membre` ou `Administrateur`) est défini lors de l'invitation.
- L'invité reçoit un lien `/invitation/:id`, valable 7 jours ; le lien peut aussi être copié et transmis à la main.
- L'invitation ne peut être acceptée que par un compte utilisant l'adresse invitée.
- Une invitation en attente peut être annulée.
- Un membre peut être retiré de l'agence : il perd l'accès immédiatement, l'historique (journal, messages signés de son nom) est conservé.

### Epic 2 : créer un projet client

#### US-003 : créer un client

**En tant que** chef de projet,  
**je veux** enregistrer un client,  
**afin de** rattacher ses projets et ses validations.

**Critères d'acceptation**

- Dans Kora, un client est un **espace** ; il possède au minimum un nom (l'adresse e-mail est facultative).
- Plusieurs projets peuvent être associés au même client.
- Les informations internes du client ne sont pas visibles dans le lien public.

#### US-004 : créer un projet

**En tant que** chef de projet,  
**je veux** créer un projet avec un client associé,  
**afin de** organiser les livrables à valider.

**Critères d'acceptation**

- Un projet possède un nom, un client et un statut.
- Le projet peut être `brouillon`, `en cours`, `en attente client`, `terminé` ou `archivé`.
- Seuls les membres autorisés de l'agence peuvent voir le projet.

### Epic 3 : soumettre un livrable

#### US-005 : importer un livrable

**En tant que** chef de projet,  
**je veux** importer un PDF ou une image,  
**afin de** le soumettre à la revue du client.

**Critères d'acceptation**

- Les formats autorisés sont clairement indiqués.
- Le fichier est stocké de manière sécurisée : conteneur privé propre à l'agence, lecture par adresse signée valable 5 minutes.
- Le navigateur envoie le fichier directement au stockage ; le serveur en recalcule l'empreinte SHA-256 et refuse un fichier différent de celui annoncé.
- Une première version est créée automatiquement.
- Le fichier possède un nom, une date et un auteur.
- Le système refuse les fichiers trop volumineux (`MAX_UPLOAD_MB`, 50 Mo par défaut) ou invalides.
- Un livrable ne peut pointer que vers des fichiers importés par sa propre agence ; un lien web n'accepte que `http` et `https`.

#### US-006 : créer une nouvelle version

**En tant que** chef de projet,  
**je veux** envoyer une nouvelle version du livrable,  
**afin de** conserver l'historique des modifications.

**Critères d'acceptation**

- Une nouvelle version ne remplace jamais l'ancienne.
- Les commentaires sont liés à une version précise.
- La version précédente reste consultable par l'agence.
- Une version approuvée est verrouillée.

#### US-007 : envoyer le livrable en revue

**En tant que** chef de projet,  
**je veux** passer un livrable au statut `en revue`,  
**afin de** permettre au client de le consulter.

**Critères d'acceptation**

- Un lien client sécurisé est généré, un par version du livrable ; son jeton est tiré au sort par le serveur.
- Le lien peut être révoqué *(réservé aux administrateurs)* ; la révocation est inscrite au journal.
- Le lien expire automatiquement après 7 jours, sauf si l'agence désactive l'expiration.
- Ouvrir le lien ne suffit pas : seules les adresses invitées y accèdent, après vérification par code (voir Epic 15).
- Le client ne voit que le livrable et les informations prévues pour lui : le serveur ne lui transmet que la version partagée, ses commentaires et ses propositions.

### Epic 4 : recueillir les retours client

#### US-008 : commenter un emplacement précis

**En tant que** client,  
**je veux** cliquer sur une zone du document et ajouter un commentaire,  
**afin de** montrer exactement ce qui doit être modifié.

**Critères d'acceptation**

- Le commentaire conserve ses coordonnées et sa page.
- Le commentaire indique son auteur et sa date ; pour un client, l'auteur est son nom complet (demandé à sa première vérification) et son adresse e-mail vérifiée, fixés par le serveur.
- Le commentaire est lié à la version consultée.
- Le client peut modifier, déplacer ou supprimer son commentaire tant que l'agence ne l'a pas qualifié ; il ne peut jamais modifier un message de l'agence.

#### US-009 : répondre à un commentaire

**En tant que** membre de l'agence,  
**je veux** répondre à un commentaire,  
**afin de** demander une précision ou confirmer sa prise en compte.

**Critères d'acceptation**

- La réponse apparaît dans le fil du commentaire.
- Les participants concernés sont notifiés.
- Le fil conserve son historique.
- Un commentaire peut être marqué comme résolu.

#### US-010 : demander des modifications

**En tant que** client,  
**je veux** demander des modifications sur une version,  
**afin de** signaler que le livrable n'est pas encore approuvé.

**Critères d'acceptation**

- Le client peut envoyer une demande globale accompagnée de commentaires.
- Le livrable passe au statut `modifications demandées`.
- L'agence reçoit une notification ; le message du client est inscrit au journal.
- La validation finale n'est pas possible tant que le client demande des modifications.

*État : la règle et la route serveur existent et sont testées, mais la page client n'a pas de bouton pour les déclencher.*

### Epic 5 : qualifier le périmètre

#### US-011 : qualifier une demande

**En tant que** chef de projet,  
**je veux** qualifier chaque commentaire client,  
**afin de** distinguer le travail prévu du travail supplémentaire.

**Valeurs possibles**

- `Incluse dans le périmètre`
- `Modification mineure`
- `Hors périmètre`
- `À clarifier`

*Implémentation actuelle : trois états, `À qualifier`, `Inclus` (« À traiter ») et `Hors périmètre` (« Hors scope »). `Modification mineure` n'existe pas encore ; `À clarifier` correspond à l'état non qualifié.*

**Critères d'acceptation**

- Tout membre de l'agence, quel que soit son rôle, peut qualifier une demande.
- Une demande possède une seule qualification active.
- La qualification est visible par l'équipe autorisée.
- Le client ne voit pas les notes internes.
- Tout changement de qualification est enregistré dans l'historique.
- L'agence peut ajouter une justification interne.

#### US-012 : demander une clarification

**En tant que** chef de projet,  
**je veux** demander une précision au client,  
**afin de** ne pas développer une interprétation incorrecte.

**Critères d'acceptation**

- Le commentaire passe au statut `à clarifier`.
- Le client reçoit une notification.
- La demande reste bloquée tant qu'aucune réponse n'est fournie.
- La réponse du client est ajoutée au même fil.

### Epic 6 : transformer un retour en proposition commerciale

#### US-013 : créer une proposition complémentaire

**En tant que** chef de projet,  
**je veux** convertir un commentaire hors périmètre en proposition,  
**afin de** faire accepter le coût avant de commencer le travail.

**La proposition contient**

- Le commentaire à l'origine de la demande
- Une description de la prestation
- Le prix
- L'impact estimé sur le planning
- Une date d'expiration
- Les conditions éventuelles

**Critères d'acceptation**

- La proposition conserve le lien vers le commentaire d'origine.
- Une proposition peut être enregistrée comme brouillon, par tout membre de l'agence.
- Elle peut être envoyée au client, après confirmation, **par un administrateur ou le propriétaire uniquement** ; le serveur refuse l'envoi à un membre.
- Le travail ne doit pas être marqué comme accepté avant la décision client.

#### US-014 : accepter une proposition

**En tant que** client,  
**je veux** accepter une proposition complémentaire,  
**afin de** autoriser clairement le travail et son coût.

**Critères d'acceptation**

- Le client voit la description, le prix et l'impact planning.
- L'acceptation nécessite une action explicite.
- L'identité et la date de l'acceptation sont enregistrées : adresse e-mail vérifiée du client, heure du serveur.
- Le client ne peut accepter qu'une proposition réellement envoyée, et une seule fois ; il ne peut pas modifier le montant.
- Le statut devient `acceptée`.
- L'agence reçoit une notification.
- L'acceptation ne doit pas être modifiable silencieusement.

#### US-015 : refuser une proposition

**En tant que** client,  
**je veux** refuser une proposition complémentaire,  
**afin de** ne pas autoriser le travail supplémentaire.

**Critères d'acceptation**

- Le refus peut être accompagné d'un commentaire.
- Le statut devient `refusée`.
- L'agence est notifiée.
- La demande reste visible dans l'historique.
- Aucun statut ne doit laisser croire que le travail est autorisé.

### Epic 7 : approuver un livrable

#### US-016 : approuver une version

**En tant que** client,  
**je veux** approuver une version précise du livrable,  
**afin de** confirmer qu'elle peut être considérée comme validée.

**Critères d'acceptation**

- Le client voit clairement le numéro ou l'identifiant de version.
- Les demandes bloquantes doivent être résolues ou explicitement traitées.
- Une confirmation explicite est demandée avant l'approbation.
- L'identité, la date et la version sont enregistrées (adresse e-mail vérifiée, heure du serveur).
- La version approuvée devient verrouillée : le serveur refuse ensuite toute écriture du client sur cette version, et une approbation ne peut pas être annulée par le client.
- **Seul le client approuve une version** : l'agence, même son propriétaire, n'a aucun moyen de le faire à sa place.
- Une version ne se valide pas tant qu'un devis envoyé attend la décision du client : la fenêtre de validation liste ces devis, à accepter ou refuser un par un, et le serveur refuse la validation sinon. Aucun devis n'est refusé implicitement.
- Les remarques encore « À clarifier » ne bloquent pas la validation : la fenêtre prévient qu'en validant, le client y renonce, les liste, et le bouton devient « Valider et renoncer à ces remarques ». L'événement de validation les nomme dans le journal et la preuve.
- *À venir* : la validation « avec réserves », qui liste les corrections « À traiter » encore ouvertes et les inscrit dans la preuve.
- L'agence reçoit une notification.
- L'agence peut rouvrir la validation d'une version (« Rouvrir la validation ») en expliquant pourquoi ; la raison est inscrite au journal.

#### US-017 : consulter la preuve de validation

**En tant que** dirigeant d'agence,  
**je veux** consulter un récapitulatif de validation,  
**afin de** pouvoir démontrer ce qui a été demandé et accepté.

**Le récapitulatif contient**

- Le nom du projet et du client
- Le livrable et sa version
- La liste des commentaires
- La qualification de chaque demande
- Les propositions complémentaires
- Les décisions du client
- La date et l'identité des approbateurs
- L'empreinte ou l'identifiant du fichier approuvé

**Critères d'acceptation**

- Le récapitulatif est construit par le serveur à partir de la base, jamais à partir de l'état de la page.
- Chaque décision (acceptation d'un devis, validation, demande de modifications) indique l'identité constatée par le serveur : membre de l'agence (nom et e-mail) ou adresse e-mail vérifiée du client.
- Chaque décision indique l'heure du serveur et l'adresse IP d'origine ; une IP qui n'a pas pu être vérifiée est signalée comme telle.
- Les retours et réponses du client figurent aussi dans le journal, horodatés par le serveur.
- Le fichier validé est identifié par son empreinte SHA-256.
- Le récapitulatif porte sa propre empreinte SHA-256.
- Il peut être imprimé ou enregistré en PDF.
- Tout membre de l'agence peut l'exporter ; une autre agence ne peut pas y accéder.

### Epic 8 : notifications et relances

#### US-018 : notifier le client

**En tant que** chef de projet,  
**je veux** envoyer automatiquement un e-mail au client,  
**afin de** lui signaler qu'un livrable attend sa revue.

**Critères d'acceptation**

- L'invitation par e-mail envoie à chaque client son lien personnel de revue.
- L'e-mail part par Resend, en HTML et en texte, avec « Répondre à » vers le membre de l'agence concerné ; sans service configuré, en développement, il s'affiche dans la console du serveur.
- Si l'e-mail ne peut pas partir, l'agence en est avertie et peut copier le lien personnel pour le transmettre.

#### US-019 : relancer une validation

**En tant que** chef de projet,  
**je veux** relancer un client qui n'a pas répondu,  
**afin de** réduire le délai d'approbation.

**Critères d'acceptation**

- La relance est déclenchée manuellement, depuis « Partager la revue », par tout membre de l'agence.
- Un e-mail part vers chaque client invité sur la revue, avec son lien personnel.
- L'e-mail rappelle ce qui attend le client : la version à valider et le nombre de propositions en attente de décision.
- L'agence voit la date du dernier envoi.
- Une seule relance par revue toutes les 24 heures, contrôlée par le serveur.
- La relance est impossible tant que personne n'est invité, ou quand la version est déjà validée.
- La relance est enregistrée dans le journal et dans les notifications de l'agence.

## Epic 9 : expérience client dédiée

#### US-020 : ouvrir une revue client

**En tant que** client,  
**je veux** ouvrir un lien de revue dédié,  
**afin de** consulter le livrable sans accéder à l'espace interne de l'agence.

**Critères d'acceptation**

- Une route `/review/[token]` affiche la revue associée au lien, après vérification de l'adresse du client (voir US-042).
- Le client ne voit pas la navigation ni les informations internes de l'agence.
- Le client voit le projet, le livrable et la version partagée.
- Un lien inconnu, révoqué ou expiré affiche un état d'accès refusé.
- L'interface est utilisable sur mobile.

#### US-021 : commenter depuis la revue client

**En tant que** client,  
**je veux** commenter directement le livrable partagé,  
**afin de** donner un retour contextualisé à l'agence.

**Critères d'acceptation**

- Un clic sur le livrable ouvre le formulaire de commentaire.
- Le commentaire conserve sa position et la version consultée.
- Le client voit son commentaire après envoi.
- Le commentaire rejoint le fil visible par l'agence.

#### US-022 : prendre une décision commerciale depuis la revue

**En tant que** client,  
**je veux** accepter ou refuser une proposition liée à mon commentaire,  
**afin de** autoriser ou refuser clairement le travail supplémentaire.

**Critères d'acceptation**

- Le client ne voit que les propositions qui lui sont destinées : celles des demandes de la version partagée.
- Chaque proposition est liée à son commentaire d'origine.
- L'acceptation et le refus sont explicites et horodatés.
- Une proposition déjà décidée ne peut pas être modifiée silencieusement.

## Epic 10 : traçabilité et démonstration

#### US-023 : consulter le journal d'activité

**En tant que** chef de projet,  
**je veux** consulter les événements de la revue dans l'ordre chronologique,  
**afin de** comprendre et prouver les décisions prises.

**Critères d'acceptation**

- Les commentaires, réponses, qualifications, propositions et décisions sont enregistrés.
- Chaque événement possède un acteur et une date.
- Le serveur ajoute l'heure d'enregistrement et l'identité qu'il a constatée (membre de l'agence ou adresse vérifiée du client).
- Le journal est consultable depuis le projet.
- Le journal est en ajout seul : la base de données refuse toute modification ou suppression d'un événement, même par une requête directe.

#### US-024 : réinitialiser une démonstration

> **Abandonnée.** Les données ne vivent plus dans le navigateur mais dans la base de l'agence, et une nouvelle agence démarre vide. Pour rejouer une démonstration, on crée une agence de démonstration.

**En tant que** fondateur,  
**je veux** remettre les données de démonstration à zéro,  
**afin de** pouvoir rejouer le parcours avec une agence pilote.

**Critères d'acceptation**

- L'action demande une confirmation.
- Les données locales sont supprimées puis remplacées par les données initiales.
- Le projet revient à son état de démonstration.
- Aucun fichier du projet ou document de cadrage n'est supprimé.

## Epic 11 : persistance serveur

#### US-025 : persister les données de l'agence

**En tant que** membre d'agence,  
**je veux** retrouver mes projets et décisions depuis n'importe quel navigateur,  
**afin de** travailler avec des données fiables et partagées.

**Critères d'acceptation**

- Les projets, livrables, commentaires et décisions sont stockés côté serveur (PostgreSQL : Docker en local, Supabase puis Azure en ligne).
- Les fichiers importés sont stockés une seule fois sur le serveur.
- Les données sont isolées par organisation.
- Un rechargement ou un changement de navigateur ne perd aucune décision.
- Chaque action (commenter, qualifier, envoyer un devis, déplacer un projet…) passe par sa propre route ; le serveur la construit à partir de la base et renvoie l'état à jour.
- Les changements d'un membre ou du client apparaissent chez les autres en quelques secondes.
- Une action refusée est signalée et disparaît de la page ; un message s'affiche si la base est injoignable.

#### US-026 : sécuriser les accès et les rôles

**En tant que** administrateur d'agence,  
**je veux** gérer les membres et les accès client,  
**afin de** protéger les données des projets.

**Critères d'acceptation**

- Les membres disposent d'un rôle : propriétaire, administrateur ou membre (détail en US-039).
- Les liens clients sont révocables et expirables côté serveur.
- Une organisation ne peut jamais lire ni modifier les données d'une autre, même avec des identifiants identiques.
- Les actions sensibles sont enregistrées dans le journal d'audit.
- Une écriture venant d'un autre site est refusée, et le nombre d'écritures, d'imports et d'invitations est limité par personne.

## Epic 12 : adaptation des propositions commerciales

#### US-027 : demander une adaptation

**En tant que** client,  
**je veux** demander une adaptation d'une proposition complémentaire,  
**afin de** signaler une contrainte ou préciser le périmètre souhaité sans chiffrer moi-même la prestation.

**Critères d'acceptation**

- Le client peut demander une adaptation depuis une proposition envoyée.
- Il doit expliquer sa demande.
- Il peut indiquer une contrainte budgétaire ou de délai, de manière facultative.
- Il ne peut pas modifier le prix de la proposition.
- La proposition passe au statut `Adaptation demandée`.
- L'agence reçoit une notification.
- L'ancienne proposition reste visible dans l'historique.
- Aucun travail supplémentaire n'est considéré comme accepté.

#### US-028 : répondre à une demande d'adaptation

**En tant que** chef de projet,  
**je veux** répondre à une demande d'adaptation,  
**afin de** proposer un périmètre ou un prix réaliste.

**Critères d'acceptation**

- L'agence voit le message du client.
- La réponse (accepter, refuser l'adaptation, ou envoyer une nouvelle version) est réservée aux administrateurs.
- Elle peut modifier le périmètre, le montant et le délai.
- Elle peut envoyer une nouvelle version de la proposition.
- L'ancienne version reste conservée.
- Une seule proposition est active à la fois.

#### US-029 : accepter la nouvelle proposition

**En tant que** client,  
**je veux** accepter la nouvelle version proposée par l'agence,  
**afin de** confirmer le travail et son coût.

**Critères d'acceptation**

- Le client voit clairement qu'il s'agit d'une nouvelle version.
- Le prix et le délai sont affichés.
- L'ancienne version n'est plus présentée comme active.
- L'acceptation est explicite et horodatée.
- La nouvelle proposition devient verrouillée.
- L'agence reçoit une notification.

## Epic 13 : contexte et isolation des données

#### US-030 : sélectionner un projet

**En tant que** chef de projet,  
**je veux** sélectionner un projet parmi mes projets,  
**afin de** consulter uniquement les livrables, commentaires et décisions associés à ce projet.

**Critères d'acceptation**

- La liste affiche les projets accessibles par l'agence.
- Le projet actif est clairement identifiable.
- Le changement de projet met à jour le titre et le contexte de la page.
- Les données d'un autre projet ne sont pas affichées.
- Le projet sélectionné reste conservé après actualisation.

#### US-031 : sélectionner un livrable

**En tant que** chef de projet,  
**je veux** sélectionner un livrable du projet actif,  
**afin de** consulter ses versions, commentaires, propositions et décisions.

**Critères d'acceptation**

- Seuls les livrables du projet actif sont proposés.
- Le livrable actif est clairement identifiable.
- Les commentaires affichés appartiennent uniquement au livrable actif.
- Les propositions et décisions affichées appartiennent uniquement au livrable actif.
- Le changement de livrable ne supprime pas les données des autres livrables.

#### US-032 : filtrer les projets par client

**En tant que** chef de projet,  
**je veux** sélectionner un client,  
**afin de** ne voir que ses projets.

**Critères d'acceptation**

- La sélection d'un client filtre la liste des projets.
- Le projet actif est réinitialisé s'il n'appartient pas au client sélectionné.
- Les livrables et commentaires suivent automatiquement le nouveau projet actif.
- Aucun projet d'un autre client ne peut apparaître dans le contexte sélectionné.

#### US-033 : isoler les données commerciales par livrable

**En tant que** chef de projet,  
**je veux** que les propositions, adaptations et décisions soient rattachées au livrable actif,  
**afin de** ne jamais mélanger les négociations de plusieurs livrables.

**Critères d'acceptation**

- Une proposition est liée à un commentaire précis.
- Un commentaire est lié à un livrable précis.
- Un changement de livrable ne montre pas les propositions d'un autre livrable.
- Le journal d'activité peut être filtré par livrable.
- Les décisions client restent associées à la bonne version.

#### US-034 : utiliser un viewer de revue interactif

**En tant que** client ou membre de l'agence,  
**je veux** zoomer, déplacer et afficher le livrable en plein écran,  
**afin de** lire précisément le document et positionner mes commentaires sans ambiguïté.

**Critères d'acceptation**

- Les boutons de zoom avant et arrière modifient réellement l'affichage.
- Le niveau de zoom affiché correspond au zoom courant.
- Le zoom est limité à une plage raisonnable, par exemple de `50 %` à `300 %`.
- Le bouton plein écran agrandit réellement la zone de revue.
- Les commentaires restent attachés aux bonnes coordonnées pendant le zoom et le déplacement.
- Un nouveau commentaire utilise les coordonnées du document, et non celles de la fenêtre.
- Les contrôles respectent l'état verrouillé d'une version sans empêcher sa consultation.
- Le viewer reste utilisable sur mobile.

#### US-035 : consulter un livrable PDF multi-pages

**En tant que** client ou membre de l'agence,  
**je veux** consulter toutes les pages d'un livrable PDF,  
**afin de** lire et commenter précisément l'ensemble du document.

> **Choix retenu :** toutes les pages sont chargées à la suite sur le plan de travail et l'on fait défiler le document. La navigation page à page (indicateur, boutons précédent / suivant) est abandonnée.

**Critères d'acceptation**

- Toutes les pages du PDF s'affichent l'une sous l'autre sur le plan de travail.
- Le zoom et le déplacement s'appliquent à l'ensemble du document.
- Un commentaire conserve le numéro de page auquel il est attaché et s'affiche sur cette page.
- Le client et l'agence consultent le même document et les mêmes commentaires.
- Passer à un PDF plus court ne demande jamais une page qui n'existe pas.

#### US-036 : capturer une page web depuis une URL

> *État : un livrable de type « Lien » enregistre l'URL, mais aucune capture n'est encore réalisée. L'annotation d'un site en ligne fait l'objet de l'US-048.*

**En tant que** développeur ou chef de projet,  
**je veux** importer une page web depuis une URL,  
**afin de** faire valider un rendu réel au client sans envoyer manuellement des captures d'écran.

**Contexte**

Cette story concerne les sites vitrines, landing pages, interfaces applicatives et environnements de staging. La page capturée devient un livrable immuable, comparable à une image ou à un PDF. Une capture est la source de vérité de la revue : les modifications ultérieures du site ne doivent pas modifier silencieusement ce que le client a validé.

**Critères d'acceptation**

- L'agence peut saisir une URL `http` ou `https` valide.
- L'application vérifie que l'URL est correctement formée avant de lancer la capture.
- L'agence peut choisir au minimum une taille de capture desktop.
- Une capture réussie crée un livrable avec une première version.
- La capture peut être commentée avec le même viewer qu'une image importée.
- L'URL source est conservée avec le livrable.
- La date et l'heure de capture sont conservées avec la version.
- La capture devient immuable après sa création.
- Une nouvelle capture de la même URL crée une nouvelle version et ne remplace jamais l'ancienne.
- Les commentaires, décisions, propositions et approbations restent rattachés à la version capturée.
- Le client voit clairement qu'il consulte une capture de page web et non une page dynamique en direct.
- Une URL inaccessible, expirée ou invalide affiche une erreur compréhensible.
- Un délai maximal empêche une capture bloquée de rester indéfiniment en attente.
- Les redirections sont limitées et contrôlées.
- L'application bloque les URLs susceptibles d'accéder à des ressources internes ou privées du réseau serveur.
- Le contenu capturé ne peut pas exécuter de script arbitraire dans l'espace de revue du client.

**Cas de staging et d'authentification**

- Une URL publique peut être capturée directement.
- Une URL protégée par authentification est refusée par défaut avec un message explicite, ou utilise un mécanisme d'accès temporaire documenté.
- L'application ne stocke jamais de mot de passe dans l'URL.
- Les captures nécessitant une session utilisateur doivent utiliser un mécanisme sécurisé distinct, par exemple un accès de preview temporaire.

**Preuve et historique**

- Le récapitulatif de validation indique qu'il s'agit d'une capture web.
- Le récapitulatif affiche l'URL source, la date de capture, le viewport utilisé et l'identifiant de la version.
- Une version approuvée reste consultable même si la page originale change ou disparaît.
- La révocation du lien de revue ne supprime pas la capture ni son historique interne.

**Hors périmètre de cette story**

- Modifier le site directement depuis ScopeGuard.
- Afficher une page dynamique interactive comme source de preuve principale.
- Maintenir une synchronisation en temps réel avec le site source.
- Gérer les comptes utilisateurs du site client.
- Capturer automatiquement toutes les pages d'un domaine.

## Epic 14 : comptes, agences et équipe

#### US-037 : se connecter à l'espace agence

**En tant que** membre d'une agence,  
**je veux** me connecter avec mon e-mail et un mot de passe, ou avec Google,  
**afin de** retrouver mon agence et mes projets en toute sécurité.

**Critères d'acceptation**

- La page `/connexion` propose « Se connecter » et « Créer un compte ».
- Le mot de passe compte au moins 10 caractères ; il est stocké haché, jamais en clair.
- Un compte créé par e-mail doit confirmer son adresse par le lien reçu avant sa première session ; tant qu'il ne l'a pas fait, chaque connexion renvoie le lien.
- Un e-mail inconnu et un mauvais mot de passe donnent le même message.
- Les tentatives répétées sont bloquées pendant une minute.
- « Mot de passe oublié » envoie un lien valable une heure et à usage unique ; il ferme les autres sessions.
- « Continuer avec Google » apparaît lorsque l'agence a configuré Google.
- Un compte Google n'est jamais rattaché automatiquement à un compte à mot de passe de même adresse.
- Toutes les pages de l'agence et leurs données exigent une session ; sans session, on revient à `/connexion` puis à la page demandée.

#### US-038 : rejoindre une agence sur invitation

**En tant que** collaborateur invité,  
**je veux** rejoindre l'agence depuis le lien reçu,  
**afin de** travailler sur ses projets sans autre démarche.

**Critères d'acceptation**

- Sans compte, le lien mène à la page de connexion avec l'adresse invitée pré-remplie et l'onglet « Créer un compte » ouvert.
- Après connexion, la page d'invitation propose « Rejoindre l'agence » ou « Refuser ».
- Un compte connecté avec une autre adresse voit « Ce n'est pas le bon compte » et peut changer de compte.
- Une invitation expirée, annulée ou déjà utilisée affiche un message clair.
- Les invitations en attente sont aussi proposées sur la page « Bienvenue ».

#### US-039 : appliquer les droits selon le rôle

**En tant que** propriétaire d'agence,  
**je veux** que les décisions commerciales et irréversibles soient réservées aux administrateurs,  
**afin de** garder la maîtrise de ce qui est promis et facturé au client.

**Droits**

| Action | Propriétaire | Administrateur | Membre |
| --- | :-: | :-: | :-: |
| Voir, commenter, importer des versions, qualifier une demande, préparer un devis en brouillon, partager une revue, supprimer un livrable, restaurer depuis la corbeille | ✅ | ✅ | ✅ |
| Envoyer un devis, répondre à une contre-proposition, révoquer un lien client, supprimer un espace ou un projet, vider la corbeille | ✅ | ✅ | ❌ |
| Inviter, changer les rôles, retirer des membres | ✅ | ✅ (sauf le propriétaire) | ❌ |
| Supprimer l'agence, nommer un autre propriétaire | ✅ | ❌ | ❌ |

**Critères d'acceptation**

- Le serveur refuse à un membre toute action réservée, avec un message qui la nomme.
- L'interface d'un membre montre ces actions grisées, avec la raison.
- Un changement de rôle s'applique dès la requête suivante.

#### US-040 : changer d'agence

**En tant que** personne membre de plusieurs agences,  
**je veux** passer de l'une à l'autre depuis le menu du compte,  
**afin de** ne jamais mélanger leurs données.

**Critères d'acceptation**

- Le menu du compte affiche l'agence active et, s'il y en a plusieurs, la liste des agences.
- Changer d'agence recharge entièrement l'application sur les données de l'autre agence.
- Les préférences du navigateur (onglets ouverts, favoris, récents) sont propres à chaque agence.

## Epic 15 : accès client vérifié

#### US-041 : inviter un client sur une revue

**En tant que** chef de projet,  
**je veux** inviter les bonnes personnes chez le client,  
**afin que** seules elles puissent consulter et valider le livrable.

**Critères d'acceptation**

- Depuis « Partager la revue », l'agence saisit une ou plusieurs adresses.
- Chaque invité reçoit par e-mail un lien personnel (`/review/<lien>?invitation=<id>`) qui pré-remplit son adresse.
- Chaque invité a un bouton pour copier son lien personnel.
- Retirer une invitation coupe l'accès de cette personne immédiatement, même sur un appareil déjà reconnu.

#### US-042 : confirmer son identité par un code

**En tant que** client,  
**je veux** recevoir un code par e-mail plutôt que créer un compte,  
**afin d'**accéder à la revue sans mot de passe tout en prouvant que c'est bien moi.

**Critères d'acceptation**

- Avec son lien personnel, l'adresse est pré-remplie ; « Ce n'est pas moi » permet d'en changer.
- Un code à 6 chiffres est envoyé, valable 10 minutes, avec 5 essais au maximum.
- Les envois sont limités (1 par minute, 5 par heure et par adresse).
- Le code n'est envoyé qu'aux adresses invitées, mais l'écran est identique dans tous les cas : on ne peut pas deviner qui est invité.
- Une fois vérifié, l'appareil est reconnu 30 jours.
- À sa première vérification, le client indique son nom complet ; il apparaît sur ses messages (initiales comprises) et dans la preuve.
- Les commentaires, réponses, acceptations et validations du client sont signés par le serveur avec son nom et son adresse vérifiée.

#### US-043 : demander l'accès à une revue

**En tant que** personne qui a reçu le lien d'un collègue,  
**je veux** demander l'accès à l'agence,  
**afin de** participer à la revue sans attendre un nouvel e-mail.

**Critères d'acceptation**

- Depuis l'écran de vérification, la personne saisit son adresse et un message facultatif.
- L'écran du code explique qu'un code n'arrive qu'aux adresses invitées et propose « Demander l'accès à l'agence ».
- Dans la cloche de l'agence, la notification de la demande ouvre le livrable avec « Partager la revue », sur la demande ; les autres activités (décision sur un devis, validation, relance) ouvrent aussi ce qu'elles concernent.
- Le propriétaire et les administrateurs reçoivent un e-mail (message de la personne, lien vers le livrable, « Répondre à » vers elle) ; l'agence reçoit aussi une notification et voit la demande dans « Partager la revue », avec « Accepter » et « Refuser ».
- Accepter invite l'adresse : elle reçoit son lien personnel.
- Une adresse n'a qu'une demande en attente par lien, un lien n'en accumule pas plus de 20, et une même adresse IP n'en envoie pas plus de 10 par heure.
- Une demande acceptée vaut invitation, avec le rôle de **contributeur** (voir US-049) : la personne reçoit son lien personnel, confirme son adresse par un code, puis donne son nom si c'est sa première revue.

#### US-044 : prévisualiser la page client

**En tant que** membre de l'agence,  
**je veux** voir la revue telle que le client la voit,  
**afin de** vérifier ce que je lui partage.

**Critères d'acceptation**

- Un membre de l'agence qui possède le lien ouvre la page client sans code.
- L'aperçu est en lecture seule et l'indique ; aucune action n'y est enregistrée.
- Un membre d'une autre agence n'a pas d'aperçu.

#### US-049 : attribuer un rôle aux personnes invitées

**En tant que** chef de projet,  
**je veux** distinguer chez le client qui décide et qui donne seulement son avis,  
**afin que** seule la personne habilitée valide la version et engage un budget.

**Droits**

| Action | Décideur | Contributeur |
| --- | :-: | :-: |
| Consulter la version, commenter, répondre | ✅ | ✅ |
| Accepter ou refuser un devis, faire une contre-proposition | ✅ | ❌ |
| Valider la version, demander des modifications | ✅ | ❌ |

**Critères d'acceptation**

- L'agence choisit le rôle en invitant (décideur par défaut) et peut le changer à tout moment dans « Partager la revue » ; le changement est inscrit au journal.
- Une demande d'accès acceptée donne le rôle de contributeur.
- Les invitations faites avant l'existence des rôles sont des invitations de décideur.
- Le serveur refuse à un contributeur toute décision, avec un message qui l'explique ; la page ne lui montre ni « Valider cette version » ni les boutons de décision, et lui dit à qui elles reviennent.
- L'e-mail d'invitation d'un contributeur lui demande ses retours, pas sa validation ; les relances ne partent qu'aux décideurs.
- La preuve indique « Client vérifié, décideur » sur les décisions du client.
- Un client ne voit jamais la liste des autres invités ni leurs liens personnels.

## Epic 16 : prochaines évolutions

#### US-045 : définir le périmètre de référence

**En tant que** chef de projet,  
**je veux** saisir le périmètre vendu (lignes du devis, nombre de rounds de révision inclus),  
**afin de** qualifier chaque demande par rapport au devis plutôt qu'à l'intuition.

**Critères d'acceptation**

- Un projet porte une liste de lignes de devis et un nombre de rounds de révision inclus.
- Kora compte les rounds consommés à chaque nouvelle version.
- Une qualification `Inclus` ou `Hors périmètre` peut citer la ligne de devis concernée.
- Le dépassement du nombre de rounds est signalé.

#### US-046 : offrir une demande hors périmètre

**En tant que** dirigeant d'agence,  
**je veux** marquer une demande hors périmètre comme « offerte »,  
**afin de** faire un geste commercial tout en mesurant ce qu'il me coûte.

**Critères d'acceptation**

- `Offert` est un résultat possible d'une demande hors périmètre, à côté de l'envoi d'un devis.
- Le tableau de bord affiche les montants facturés, acceptés et offerts.
- Le client n'est pas sollicité pour une demande offerte.

#### US-047 : envoyer les demandes acceptées vers Jira ou Notion

**En tant que** chef de projet,  
**je veux** qu'une demande hors périmètre acceptée par le client crée un ticket dans l'outil de l'équipe,  
**afin que** le travail n'entre dans le backlog qu'une fois payé.

**Critères d'acceptation**

- L'agence configure un projet Jira ou une base Notion par projet Kora.
- À l'acceptation, un ticket est créé avec le titre, la description, le montant, le délai, la date d'acceptation et un lien vers la demande.
- La clé du ticket est conservée sur la demande ; aucun doublon n'est créé.
- En cas d'échec, la demande n'est pas perdue et l'envoi peut être relancé.

#### US-048 : annoter un site web en ligne

**En tant que** client,  
**je veux** commenter directement le site de recette en naviguant de page en page,  
**afin de** donner mes retours sur le vrai rendu.

**Critères d'acceptation**

- L'agence ajoute un script Kora sur son site de recette ; il ne fonctionne que sur les domaines déclarés.
- Le client se vérifie avec le même code par e-mail que pour les autres livrables.
- Un commentaire est rattaché à la page, à l'élément visé et à la largeur d'écran ; une capture est conservée.
- Si l'élément a disparu, le commentaire est signalé « élément introuvable » au lieu d'être perdu.
- Les commentaires rejoignent le panneau « Demandes » et le même parcours de qualification.

## User stories à reporter

Ces stories sont pertinentes mais ne doivent pas entrer dans le premier parcours :

- En tant qu'agence, je veux connecter ScopeGuard à Stripe.
- En tant qu'agence, je veux synchroniser les demandes avec ClickUp *(remplacé par l'envoi vers Jira ou Notion, US-047)*.
- En tant qu'agence, je veux générer automatiquement une facture.
- En tant qu'agence, je veux que l'IA détecte le hors périmètre.
- En tant que client, je veux commenter une vidéo image par image.
- En tant qu'agence, je veux utiliser un domaine entièrement personnalisé.
- En tant que dirigeant, je veux analyser tous les projets dans un tableau de bord financier.

Elles répondent à des besoins réels, mais elles ne servent pas à vérifier la première hypothèse : **une agence peut-elle gagner du temps et récupérer du revenu en qualifiant ses retours client dans un espace unique ?**

## Priorité de développement

### Must have

- Créer une agence
- Créer un client et un projet
- Importer un PDF ou une image
- Créer une version
- Générer un lien client
- Ajouter un commentaire positionné
- Répondre et résoudre un commentaire
- Qualifier une demande
- Créer une proposition complémentaire
- Accepter ou refuser une proposition
- Approuver une version
- Conserver un journal d'audit

### Should have

- E-mails de notification
- Relances manuelles
- Export PDF ou HTML du récapitulatif
- US-034 : viewer de revue interactif
- Gestion des rôles *(réalisé : US-039)*
- Expiration et révocation des liens *(réalisé)*
- Accès client vérifié par code *(réalisé : US-041 à US-043)*
- US-045 : périmètre de référence
- US-046 : demande offerte
- Page mobile optimisée pour le client

### Could have

- US-036 : capture de page web depuis une URL
- US-048 : annotation d'un site web en ligne
- US-047 : envoi des demandes acceptées vers Jira ou Notion
- US-035 : PDF multi-pages *(réalisé : pages à la suite, navigation page à page abandonnée)*
- Stripe
- Capture automatique d'une URL
- Branding agence
- Modèles de propositions
- Statistiques par projet
- Intégration ClickUp ou Trello

### Won't have dans le premier MVP

- Application mobile native
- Vidéo
- IA
- Coédition en temps réel
- CRM complet
- Comptabilité
- Signature électronique qualifiée

## Story critique à prototyper en premier

Le prototype doit se concentrer sur cette séquence :

> Un client commente une maquette. Le chef de projet identifie que la demande est hors périmètre. Il transforme le commentaire en proposition complémentaire. Le client accepte le prix et le délai. L'agence dispose ensuite d'une preuve claire de l'accord.

Si ce scénario fonctionne avec trois agences pilotes, ScopeGuard possède une base produit crédible. Si les utilisateurs contournent encore le flux par e-mail ou n'osent pas qualifier les demandes, il faudra revoir le positionnement avant de développer davantage.

## Suivi de réalisation

État au 16 octobre 2026. ✅ réalisé · 🟡 partiel · ⬜ à faire · ⛔ abandonné.

| Story | État | Remarque |
| --- | :-: | --- |
| US-001 créer un espace agence | 🟡 | Création, propriétaire et isolation faits ; pas encore d'écran pour renommer l'agence |
| US-002 inviter un collaborateur | ✅ | Invitation par e-mail, rôle, annulation, retrait |
| US-003 créer un client | ✅ | Le client est un « espace » |
| US-004 créer un projet | 🟡 | Statuts limités à `Brouillon` et `En cours` |
| US-005 importer un livrable | ✅ | Envoi direct vers Azure, empreinte vérifiée par le serveur ; l'auteur de l'import est enregistré, pas encore affiché |
| US-006 créer une nouvelle version | ✅ | Les versions remplacées sont verrouillées |
| US-007 envoyer le livrable en revue | ✅ | Lien par version au jeton tiré par le serveur, expiration 7 jours, révocation |
| US-008 commenter un emplacement précis | ✅ | Épingle, zone, page ; auteur client signé par le serveur |
| US-009 répondre à un commentaire | 🟡 | Fil de réponses fait ; pas de statut « résolu » |
| US-010 demander des modifications | 🟡 | Règle et route serveur faites ; pas de bouton sur la page client |
| US-011 qualifier une demande | 🟡 | Trois états au lieu de quatre ; pas de justification interne |
| US-012 demander une clarification | 🟡 | État « À qualifier » ; pas de blocage ni de notification dédiés |
| US-013 créer une proposition complémentaire | 🟡 | Brouillon, envoi, montant, délai ; pas de date d'expiration de l'offre |
| US-014 accepter une proposition | ✅ | Adresse vérifiée, heure du serveur, une seule décision |
| US-015 refuser une proposition | ✅ | |
| US-016 approuver une version | ✅ | Par le client seulement ; verrouillage contrôlé par le serveur ; réouverture par l'agence avec sa raison |
| US-017 consulter la preuve de validation | ✅ | Construite par le serveur : identités vérifiées, heures du serveur, IP, empreintes du fichier et du récapitulatif |
| US-018 notifier le client | ✅ | Resend, HTML et texte, « Répondre à » ; DMARC à publier pour la délivrabilité |
| US-019 relancer une validation | ✅ | E-mail à chaque invité ; une relance par jour et par revue |
| US-020 ouvrir une revue client | ✅ | Après vérification par code |
| US-021 commenter depuis la revue client | ✅ | |
| US-022 décision commerciale depuis la revue | ✅ | |
| US-023 consulter le journal d'activité | ✅ | Journal en ajout seul, garanti par la base |
| US-024 réinitialiser une démonstration | ⛔ | Remplacé par la création d'une agence de démonstration |
| US-025 persister les données de l'agence | ✅ | PostgreSQL ; une route par action, état relu en une requête |
| US-026 sécuriser les accès et les rôles | ✅ | |
| US-027 demander une adaptation | ✅ | |
| US-028 répondre à une demande d'adaptation | ✅ | Réservé aux administrateurs |
| US-029 accepter la nouvelle proposition | ✅ | |
| US-030 à US-033 contexte et isolation | ✅ | |
| US-034 viewer de revue interactif | ✅ | |
| US-035 PDF multi-pages | ✅ | Pages à la suite sur le plan de travail ; navigation page à page abandonnée |
| US-036 capturer une page web | ⬜ | L'URL est enregistrée, pas de capture |
| US-037 se connecter à l'espace agence | ✅ | Adresse confirmée par e-mail ; Google à configurer |
| US-038 rejoindre une agence sur invitation | ✅ | |
| US-039 droits selon le rôle | ✅ | |
| US-040 changer d'agence | ✅ | |
| US-041 inviter un client sur une revue | ✅ | |
| US-042 confirmer son identité par un code | ✅ | Nom complet demandé à la première vérification |
| US-043 demander l'accès à une revue | ✅ | E-mail au propriétaire et aux administrateurs |
| US-044 prévisualiser la page client | ✅ | |
| US-045 périmètre de référence | ⬜ | Prochaine priorité produit |
| US-046 demande offerte | ⬜ | |
| US-047 envoi vers Jira ou Notion | ⬜ | |
| US-048 annoter un site web en ligne | ⬜ | |
| US-049 rôles des personnes invitées | ✅ | Décideur et contributeur, contrôlés par le serveur |

**Avant les premiers pilotes**, il reste à :

- décider du bouton « Demander des modifications » côté client (US-010) ;
- publier un enregistrement DMARC sur le domaine d'envoi, pour que les e-mails n'arrivent pas en spam ;
- brancher un suivi des erreurs en production et vérifier les sauvegardes de la base ;
- nettoyer les fichiers envoyés au stockage mais jamais validés.

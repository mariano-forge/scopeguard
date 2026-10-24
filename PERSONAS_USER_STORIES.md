# Personas et user stories de Kora

Ce document définit les utilisateurs prioritaires et les besoins fonctionnels du MVP de Kora (nom de code ScopeGuard). Il complète le cadrage produit de [README.md](README.md) et le plan d'exécution de [PLAN_EXECUTION.md](PLAN_EXECUTION.md).

Kora ne doit pas être conçu comme un simple outil d'annotation. Le produit doit aider les agences à transformer chaque retour client en décision claire : travail inclus, demande à clarifier ou prestation supplémentaire acceptée.

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
- Est généralement l'utilisateur principal de Kora.

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

Kora lui fait gagner du temps et lui donne une procédure claire pour traiter les demandes délicates.

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
- N'utilise pas Kora tous les jours.
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
| Chef de projet | Utilise Kora chaque jour ; administrateur de l'agence |
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
- Elle n'est jamais partagée automatiquement : après l'import, « Partager la V03 ? » propose les personnes invitées sur la version précédente, cochées avec leur rôle (modifiable) ; « Partager » leur envoie un e-mail « Nouvelle version », « Plus tard » la laisse à l'agence.
- Tant qu'une dernière version n'est partagée avec personne, l'éditeur l'indique (« La V03 n'est partagée avec personne », avec « Partager ») et « À traiter » la liste. Le rappel de l'éditeur se ferme d'une croix, pour cette version et dans ce navigateur ; « À traiter » le garde.
- Le client sur une version remplacée voit « Vous consultez une ancienne version » et « Voir la V03 », sans nouveau code, seulement si cette version lui a été partagée ; sinon, seulement « Lecture seule · Cette version n'est plus en revue ».
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

*Implémentation actuelle : trois états, `À qualifier`, `Inclus` (« Inclus », prévu au devis) et `Hors périmètre` (« Hors scope »). `Modification mineure` n'existe pas encore ; `À clarifier` correspond à l'état non qualifié.*

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
- *À venir* : la validation « avec réserves », qui liste les demandes « Inclus » encore ouvertes et les inscrit dans la preuve.
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

- Modifier le site directement depuis Kora.
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

- Sans compte, le lien mène à la page de connexion sur l'onglet « Créer un compte », avec le nom de l'agence et l'adresse invitée masquée (« c•••••@agence.fr ») ; la personne saisit elle-même son adresse, que le serveur vérifie à l'acceptation. Quelqu'un qui détiendrait le lien n'apprend pas l'adresse.
- Après connexion, la page d'invitation propose « Rejoindre l'agence » ou « Refuser ».
- Un compte connecté avec une autre adresse voit « Ce n'est pas le bon compte », avec l'adresse invitée masquée, et peut changer de compte.
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
- Chaque invité reçoit par e-mail un lien personnel (`/review/<lien>?invitation=<id>`, un identifiant aléatoire) qui montre son adresse masquée (« c•••••@client.fr ») : quelqu'un qui détiendrait le lien n'apprend pas l'adresse.
- Chaque invité a un bouton pour copier son lien personnel.
- Retirer une invitation coupe l'accès de cette personne immédiatement, même sur un appareil déjà reconnu.

#### US-042 : confirmer son identité par un code

**En tant que** client,  
**je veux** recevoir un code par e-mail plutôt que créer un compte,  
**afin d'**accéder à la revue sans mot de passe tout en prouvant que c'est bien moi.

**Critères d'acceptation**

- Avec son lien personnel, l'adresse est reconnue sans être affichée en entier : le code part à l'adresse invitée ; « Ce n'est pas moi » permet de saisir une autre adresse.
- Un code à 6 chiffres est envoyé, valable 10 minutes, avec 5 essais au maximum.
- Les envois sont limités (1 par minute, 5 par heure et par adresse).
- Le code n'est envoyé qu'aux adresses invitées, mais l'écran est identique dans tous les cas : on ne peut pas deviner qui est invité.
- Une fois vérifié, l'appareil est reconnu 30 jours.
- À sa première vérification, le client indique son nom complet ; il apparaît sur ses messages (initiales comprises) et dans la preuve.
- Les commentaires, réponses, acceptations et validations du client sont signés par le serveur avec son nom et son adresse vérifiée.

#### US-043 : demander l'accès à une revue (retirée le 21 octobre 2026)

> Retirée pour des raisons de sécurité : personne ne demande plus l'accès depuis Kora. L'écran du code dit qu'il n'arrive qu'aux adresses invitées et de demander une invitation à qui a transmis le lien. Les demandes reçues avant se règlent encore dans « Partager la revue ». Les critères ci-dessous décrivent ce qui existait.

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

#### US-050 : saisir une demande reçue ailleurs

**En tant que** chef de projet,  
**je veux** enregistrer dans Kora une demande que le client a faite par e-mail, au téléphone, en réunion ou sur Slack,  
**afin que** toutes les demandes finissent dans le même registre, d'où qu'elles viennent.

**Critères d'acceptation**

- « + Demande » crée une demande « À clarifier », « Inclus » ou « Hors scope », pour une demande reçue ailleurs ou portant sur tout le livrable (une zone qu'on ne peut pas pointer).
- La source est facultative : E-mail, Appel, Réunion, Slack, Figma ou Autre, avec la date de la demande d'origine.
- L'agence peut coller le texte du client (l'extrait) et joindre une capture (image collée dans l'extrait ou choisie) ; les deux sont indiqués « Visible par le client ».
- La demande affiche « Demande reçue par e-mail le 14/10/2026, saisie par Alice Martin », avec l'extrait et la capture, chez l'agence comme chez le client.
- Le serveur n'accepte qu'un canal connu, une date valide, un extrait de 5 000 caractères au plus, et une image importée par l'agence elle-même.
- La preuve reprend la source, l'extrait et l'empreinte SHA-256 de la capture.

#### US-051 : être prévenu par e-mail des devis et des décisions

**En tant que** client ou membre de l'agence,  
**je veux** recevoir un e-mail quand un devis m'attend ou quand l'autre partie a décidé,  
**afin de** ne pas dépendre d'une visite de l'application pour savoir qu'il faut agir.

**Critères d'acceptation**

- Un devis envoyé (premier, nouvelle version, réponse à une contre-proposition) part aux décideurs invités sur la version, avec le titre, le montant, le délai et leur lien personnel ; « Répondre à » vers l'administrateur qui l'a envoyé.
- La réponse de l'agence à une contre-proposition (acceptée ou non retenue) part aux décideurs.
- Un devis accepté ou refusé, une contre-proposition, la validation et la demande de modifications partent au propriétaire et à tous les administrateurs, avec un lien direct vers la demande ou la version ; « Répondre à » vers le client.
- Les membres de l'agence et les contributeurs du client ne reçoivent pas ces e-mails.
- Un e-mail qui ne part pas n'annule jamais l'action : la notification de la cloche reste.

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

> **Avancement (24 octobre 2026) :** le projet a trois onglets : Livrables, Périmètre, Suivi. Décidé avec le porteur du produit : le périmètre est la référence du projet, pas un livrable, et il se définit avant les livrables.
>
> - **Périmètre** (`/projets/:id/perimetre`) : il se remplit de deux façons, au choix et dans n'importe quel ordre. « Extraire avec l'IA », la plus rapide, lit le PDF du devis ou du cahier des charges, ou un texte collé ; le moteur reste à configurer, et l'agence relit chaque proposition avant de l'ajouter. Sinon, la saisie à la main. Quatre sections : l'extraction, « Inclus », « Non inclus » (une ligne par élément : désignation en texte long, quantité, unité) et « Avenants », qui ne sont que les devis hors scope acceptés dans Kora. Le périmètre s'active comme référence (signé par le serveur, inscrit au journal) et peut repasser en brouillon. Le cadre (budget, tours, dates), la liste des documents de référence, la source, l'échéance et le livrable de chaque ligne ont été retirés à la demande du porteur du produit ; les périmètres déjà saisis gardent leur budget et leurs tours, que « Suivi » lit encore.
> - **Suivi** : ce que Kora rapporte, calculé de ce qui existe déjà. Le hors scope de la demande repérée au devis accepté (montants gagnés, en attente, refusés, demandes encore à chiffrer), les allers-retours de chaque livrable (ses versions), les demandes version après version (tous les livrables, ou l'un d'eux), les demandes semaine par semaine en courbes par qualification, et le délai de première réponse de l'équipe au client. Chaque section a ses propres filtres (livrable, période).
> - **Côté client** : il lit le périmètre actif depuis sa page de revue (inclus, non inclus, avenants de sa version), et a sa propre cloche : réponses de l'agence, devis à valider, ses demandes qualifiées, nouvelle version partagée.
> - Un onglet « Clients » (organisation, contacts et leurs accès) a été essayé puis abandonné le 23 octobre 2026 : les invités des livrables suffisent.
>
> À venir : la confirmation du périmètre par le client, la ligne citée à la qualification, le branchement du moteur d'extraction.

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

**En tant que** client d'une agence web,  
**je veux** commenter directement le site de recette en naviguant de page en page,  
**afin de** donner mes retours sur le vrai rendu.

> **Modèle retenu (17 octobre 2026) :** la barre d'outils de Vercel (commentaires sur les prévisualisations), sans compte à créer pour le client. C'est le parcours des agences web : elles font valider un site de recette, rarement des images ou des PDF. Marker.io ou BugHerd envoient un retour vers le backlog ; Kora le qualifie d'abord, et seul ce qui est inclus ou payé part en production.

**Comment ça marche**

1. Le livrable est de type « Lien » : son adresse est le site de recette, et son domaine le seul où la barre s'ouvre.
2. L'agence colle une ligne de script sur le site. La barre ne s'affiche qu'à qui l'active (lien `?kora` reçu de l'agence, puis mémorisé sur l'appareil) : un visiteur du site ne voit rien.
3. Le client ouvre le panneau Kora, affiché dans un cadre servi par Kora : il se vérifie par le même code e-mail, sans compte.
4. Une pastille « Kora », en bas à droite et déplaçable, qui se déplie à l'ouverture avec les outils du canevas de Kora : « Naviguer » (`V`) ou « Commenter » (`C`) ; en « Commenter », il clique sur un élément, écrit sa demande, l'envoie. Les épingles de la page réapparaissent sur le site avec leur fil.
5. L'agence qualifie dans son panneau « Demandes », comme aujourd'hui. Les devis et la validation se font sur la page de revue Kora, ouverte depuis le panneau.

**Critères d'acceptation**

- Le panneau Kora ne s'affiche que dans une page du domaine du livrable, en `https` ; ailleurs, il ne montre rien.
- Depuis le site : demandes, annotations, réponses, et qualification par l'agence. Les devis (envoi, acceptation, refus, contre-proposition) et la validation de la version se font dans Kora, que le panneau ouvre sans redemander de code.
- Le client se vérifie avec le même code par e-mail que pour les autres livrables ; sa session sur le site est propre à ce site.
- Une demande est rattachée à la page, à l'élément visé, à sa position dans l'élément et à la largeur d'écran ; la capture de la fenêtre au moment du clic, annotée (cadre de l'élément, point du clic), est conservée, montrée avec la demande et reprise dans la preuve.
- Le site de l'agence ne reçoit jamais le texte des demandes : seulement de quoi placer les épingles (numéro, élément, position). Le texte reste dans le cadre Kora.
- Les épingles affichées sur le site sont celles que le client voit sur sa page de revue (`readReviewState`) : jamais un pin interne de l'agence ni un devis en brouillon.
- Si l'élément a disparu, la demande est signalée « élément introuvable » dans le panneau au lieu d'être perdue.
- Les demandes rejoignent le panneau « Demandes » et le même parcours de qualification.

**Pas dans cette story** : afficher le site de l'agence dans Kora (relais ou cadre), une extension de navigateur, dessiner sur la capture, les erreurs techniques de la page, l'extension WordPress.

#### US-053 : comparer deux versions

**En tant que** client ou chef de projet,  
**je veux** comparer deux versions d'une maquette ou d'un PDF,  
**afin de** vérifier que chaque demande a été traitée avant d'envoyer, ou avant de valider.

> Décidé avec le porteur du produit le 22 octobre 2026 : des deux côtés ; une frise des versions, animée de la plus ancienne à la plus récente ; côté client, une version non partagée entre deux des siennes apparaît comme un nœud avec son numéro seul.

**Critères d'acceptation**

- « Comparer les versions » s'ouvre depuis le menu du livrable (agence) ou l'en-tête de la revue (client), dès qu'il y a deux versions image ou PDF à comparer.
- La frise montre les versions de la plus ancienne à la plus récente ; on y choisit « avant » et « après » (par défaut, la précédente et l'actuelle).
- Côte à côte, le zoom et le déplacement sont synchronisés ; le rideau superpose les deux, une poignée passant de l'une à l'autre.
- Les demandes de la version « avant » restent dessus, en lecture seule ; un clic sur une épingle en affiche le texte.
- Un PDF se compare page par page ; un nombre de pages différent est signalé.
- Le client ne reçoit que les versions qui lui sont partagées, chacune comme sa page la montrerait ; une version non partagée n'est jamais envoyée, ni son contenu ni ses demandes.

**Plus tard** : surbrillance automatique des différences.

#### US-052 : commenter un moment d'une vidéo

**En tant que** client ou chef de projet,  
**je veux** poser un commentaire sur un moment précis d'une vidéo, à un endroit de l'image,  
**afin que** chacun retrouve exactement ce qui est visé, comme sur YouTube ou Frame.io.

> Décidé avec le porteur du produit le 22 octobre 2026 : une épingle a un moment **et** une place sur l'image ; une limite de taille propre aux vidéos (`MAX_VIDEO_UPLOAD_MB`), réglable à part, car une vidéo peut peser un Go.

**Critères d'acceptation**

- Sur le canevas, la vidéo se lit avec une barre de Kora : lecture, pause, temps, son, et une frise.
- Un clic sur l'image (outil « Commenter ») met la vidéo en pause et pose une épingle à cet endroit, au moment affiché ; une zone dessinée aussi.
- Le moment est enregistré à la seconde près (au dixième) ; le serveur refuse un moment qui n'en est pas un (négatif, texte, au-delà d'un jour) et ne l'enregistre pas.
- Une épingle n'apparaît sur l'image qu'autour de son moment ; sur la frise, chaque commentaire a son repère, de la couleur de son épingle.
- Ouvrir un commentaire (repère de la frise, épingle, ligne du panneau) amène la vidéo à son moment, en pause.
- Le moment se lit dans le fil, dans la liste du panneau et dans la description du commentaire (« Vidéo · 1:23 »), reprise par l'export et la preuve.
- Même chose côté agence et côté client ; le client ne change jamais le moment d'un commentaire de l'agence.
- Une vidéo importée comme version a sa propre limite de taille ; les autres fichiers, et une vidéo en couverture, gardent la limite générale.
- Une vidéo se lit par morceaux, chacun avec l'adresse signée du fichier : elle dure la longueur de la vidéo plus 15 minutes (longueur lue à l'import, comptée jusqu'à 3 heures). Si elle expire quand même (pause, onglet laissé ouvert), le lecteur en redemande une et reprend au même moment, sans que personne ne le voie.
- À l'import (nouveau livrable ou nouvelle version), Kora prévient l'agence sans jamais bloquer : une vidéo que ce navigateur ne lit pas (ProRes, HEVC…), ou dont les images clés sont espacées de plus de 10 secondes (enregistreurs d'écran : les sauts « bavent »). La vérification lit l'en-tête, une image et l'index des images clés, jamais le fichier entier. Le client ne voit pas cet avertissement (décidé avec le porteur du produit le 22 octobre 2026).

**Plus tard** : capture de l'image au moment du clic (vignette et preuve), reconversion dans le navigateur des vidéos à images clés rares, commentaire sur une plage de temps, dessin sur l'image, image par image.

#### US-054 : qualifier les commentaires Figma

**En tant que** designer ou chef de projet d'une agence qui fait relire ses maquettes dans Figma,  
**je veux** que les commentaires laissés sur le fichier Figma arrivent dans Kora pour que je les qualifie,  
**afin de** garder l'habitude de mes clients sans perdre la qualification, les devis et la preuve.

> Demandé par le porteur du produit le 23 octobre 2026 : un bouton « Qualifier » sur les commentaires de Figma. **Impossible tel quel** : un plugin Figma n'a pas le droit de toucher à l'interface de Figma, ni même de lire les commentaires. Seule l'API web de Figma lit et écrit les commentaires. Retenu : Kora se connecte à Figma, importe les commentaires et répond dans leur fil ; un plugin, plus tard, montre la même liste dans un panneau à côté du fichier.
>
> Décidé avec le porteur du produit le 23 octobre 2026 : **comme pour un site de recette** : le livrable est le fichier entier, chaque commentaire arrive avec la capture de son écran, une version est une tournée de revue déclarée par l'agence, liée à une version enregistrée dans l'historique de Figma ; seules les pages cochées par l'agence sont en revue ; le compte connecté et les personnes cochées « équipe » sont de l'agence, leurs commentaires ne sont pas importés ; Kora répond toujours dans le fil Figma à la qualification.

**Comment ça marche**

1. L'agence connecte son compte Figma à Kora, une seule fois (OAuth Figma). Kora garde la clé de connexion chiffrée en base, ne la renvoie jamais à la page, et la connexion se retire depuis les réglages.
2. Elle crée un livrable « Figma » à partir du lien du fichier, comme un « Lien » à partir de l'adresse du site, et coche les pages soumises à la revue (toutes par défaut ; elle décoche « Brouillons », « Archive »…).
3. Une version est une tournée de revue qu'elle déclare en choisissant une version enregistrée dans l'historique de Figma (« V3 envoyée au client ») ; Kora lui rappelle d'en enregistrer une avant d'envoyer au client.
4. Les commentaires des pages en revue arrivent dans Kora : à l'ouverture du livrable, par « Actualiser », et dès qu'ils sont postés quand Figma prévient Kora.
5. Chaque commentaire du client devient une demande de la version en cours, avec la capture de l'écran Figma où il a été posté, prise **dans la version Figma de la tournée** (ce qui a été soumis, pas le fichier modifié depuis), le point visé marqué, comme la capture prise au clic sur un site, et sa source « Figma » (auteur Figma, date, lien vers le commentaire). Ses réponses dans Figma forment son fil. Les commentaires de l'agence (compte connecté, personnes cochées « équipe ») restent dans Figma.
6. L'agence qualifie dans Kora comme toute demande. Kora répond dans le fil Figma (« Kora · Hors scope : un devis va vous être proposé », avec le lien de la revue).
7. Les devis et la validation se décident sur la page de revue Kora, par les décideurs invités, comme pour le site de recette. La preuve nomme la version Figma validée (« fichier Accueil, version “V3 envoyée au client” du 22 octobre »).

**Critères d'acceptation**

- Chaque membre de l'agence connecte son propre compte Figma, et le retire quand il veut (décidé le 23 octobre 2026, à la place d'une connexion unique de l'agence : les fichiers sont souvent partagés avec chaque designer, le quota de Figma est par compte, et les comptes connectés désignent l'équipe). Sa clé est chiffrée en base et n'apparaît jamais dans l'état, une page, une adresse ou un journal.
- Un livrable « Figma » n'accepte qu'une adresse `https://www.figma.com/…` d'un fichier que le compte connecté peut lire ; sinon, un message clair, et rien n'est créé.
- Un commentaire Figma n'est importé qu'une fois, même relu cent fois (identifiant Figma conservé). Un commentaire résolu dans Figma avant l'import n'est pas importé.
- Un commentaire importé est un brouillon de l'agence tant qu'il n'est pas qualifié : le client ne le voit pas dans Kora, comme un pin posé sans statut.
- Sa source dit qu'il vient de Figma, avec le nom affiché par Figma : Kora n'a pas vérifié cette identité, et la preuve le dit (« commentaire Figma de Marie D., importé le … »). Il ne compte jamais comme une décision du client.
- Kora ne répond dans Figma qu'après l'enregistrement de la qualification, et un échec de Figma ne la fait jamais échouer. La réponse ne dit que ce que le client verrait dans Kora : jamais le montant ni l'existence d'un devis en brouillon.
- Une notification de Figma n'est jamais crue sur parole : son mot de passe est vérifié, puis Kora relit les commentaires auprès de Figma.
- Les tests n'appellent jamais Figma : un faux serveur local tient sa place.

**Étapes de réalisation**, chacune livrable seule, avec ses tests :

1. **Connexion** : OAuth Figma, clé chiffrée, déconnexion. Fait d'abord pour l'agence (propriétaire et administrateurs), puis **reprise en connexions personnelles** : chaque membre connecte son compte ; il agit avec lui (lire un fichier, créer un livrable ou une tournée) ; un livrable garde le compte de qui l'a créé pour relire ses commentaires, et un collègue le reprend avec son propre compte si ce membre part ou se déconnecte ; les comptes connectés de l'agence sont son équipe dans Figma.
2. **Livrable « Figma » et import**, en deux temps : (a) création depuis le lien du fichier, pages en revue, tournée liée à une version Figma ; (b) import des commentaires du client et de leurs réponses, source « Figma », « Actualiser », liste « équipe ».
2c. **Revue des écrans Figma dans Kora** (décidée le 23 octobre 2026, avant l'étape 3) : l'agence colle le lien d'un fichier, Kora détecte ses écrans ; elle coche ceux à faire valider, choisit le format de chaque écran parmi ceux de Figma, PNG (par défaut), JPEG, SVG ou PDF, d'un coup pour tous ou écran par écran (décidé le 23 octobre 2026, à la place d'un format unique), puis les dispose dans une grande fenêtre : une grille de vignettes avec leur nom, dans l'ordre de Figma au départ, qu'elle réordonne (glisser, ou au clavier) et dont elle règle le nombre par ligne. « Importer » copie les écrans dans Kora : le client commente dans Kora, sans compte Figma, sur un canevas où les écrans sont posés dans cet ordre, et la preuve garde l'empreinte de chaque écran. Une nouvelle version réimporte les mêmes écrans dans leur état actuel. Lectures de catégorie 1 par import : une pour les écrans, puis une par format choisi (Figma dessine un format par demande ; la fenêtre le dit). Écarté : le placement libre des écrans (un éditeur à part entière).
3. **Réponse dans Figma et notifications** : réponse à la qualification, webhook `FILE_COMMENT` et relecture.
4. **Captures** : l'image de l'écran de chaque commentaire dans la version Figma de la tournée, le point visé marqué, demandées par lot à Figma, conservées et reprises dans la preuve.
5. **Plugin Figma** : un panneau dans Figma qui liste les demandes du fichier et permet de les qualifier, connecté par la session Kora de l'agence, jamais par une clé collée.

**Contraintes de Figma** (relevées le 23 octobre 2026) :

- Une application OAuth privée ne sert qu'à l'équipe Figma qui l'a créée ; pour d'autres agences, il faut la publier et la faire approuver par Figma : à demander dès les premiers pilotes.
- Limites de Figma (constatées le 23 octobre 2026 : un compte Starter gratuit a épuisé ses lectures en quelques essais, bloqué 4 jours et demi). La lecture d'un fichier, de ses écrans ou d'une image est limitée à **20 par mois** avec une place « lecteur » ou « collaborateur », à 10 à 20 par minute avec une place d'éditeur. Les commentaires et l'historique : 5 par minute avec une place « lecteur », 25 à 100 avec une place d'éditeur. Kora lit donc les pages une fois par livrable ; le classement des commentaires par page et les captures devront tenir dans une lecture par tournée, et peut-être être facultatifs pour les comptes à limite basse. Kora fonctionne au mieux avec une place d'éditeur.
- L'API ne sait pas marquer un commentaire comme résolu.
- Figma ne garde qu'une clé active par compte Figma et par application : un même compte Figma connecté à deux agences Kora déconnecterait la première. Chaque agence connecte son propre compte.
- Les notifications de Figma (`FILE_COMMENT`) se créent sur un fichier par quelqu'un qui peut le modifier ; une offre minimale est peut-être exigée, à vérifier sur un vrai compte. À défaut, Kora relit à l'ouverture et sur « Actualiser ».

**Pas dans cette story** : écrire dans Figma autre chose qu'une réponse, résoudre un commentaire Figma, prendre une décision (devis, validation) depuis Figma, importer les fichiers FigJam.

#### Décisions et pistes notées (16 octobre 2026)

Discutées avec le porteur du produit ; à reprendre telles quelles :

- **Validation avec réserves** *(à voir avec le designer)* : la fenêtre de validation liste les demandes « Inclus » encore ouvertes ; la version est « validée avec réserves » et la preuve les nomme. Les devis en attente restent bloquants, les « À clarifier » sont abandonnées (déjà fait).
- **Demande offerte** (US-046) : en attente du designer.
- **Qualifier en lot** : sélectionner plusieurs demandes et les qualifier d'un coup.
- **Devis groupé** : un devis couvrant plusieurs demandes, accepté ou refusé en entier ; le client retire ce qu'il ne veut pas par une contre-proposition (pas d'acceptation partielle).
- **Alignement « demande »** : abandonner la distinction par le champ `kind` ; la qualification et la présence d'un repère suffisent.
- **Bouton « J'ai terminé mes retours »** côté client (US-010) : reporté, utile surtout pour compter les tournées de révision (US-045).
- **Lien copié sans invité** : seul un avertissement dans « Partager la revue » (fait). Écarté : ouvrir le lien à tout porteur. Écarté pour l'instant : autoriser un domaine entier.
- **Annotation de site web** (US-048) : un script Kora sur le site de recette, limité aux domaines déclarés ; vérification par le même code e-mail ; retours dans le même panneau ; une version = une tournée de revue déclarée par l'agence (« V3 en ligne ») ; la preuve repose sur des captures, pas sur le site en direct ; « élément introuvable » si l'élément a disparu. Difficultés : la connexion depuis un autre domaine (cookies tiers), les sites protégés. Écartés : afficher le site dans Kora (relais ou cadre), extension de navigateur. *Précisé le 17 octobre : modèle de la barre Vercel ; c'est le panneau Kora qui s'affiche dans un cadre sur le site, limité à son domaine, avec une session propre à ce site.*
- **Décisions depuis le site de recette** *(17 octobre)* : pour l'instant, on y commente, annote, répond et qualifie ; les décisions financières et la validation restent dans Kora (clic piégé possible dans un cadre sur une page de l'agence, et la preuve doit rester neutre). Évolution notée : tout dans la barre, chaque décision confirmée dans une petite fenêtre Kora (comme 3-D Secure). À revoir selon la friction constatée chez les premiers testeurs.
- **Jira / Notion** (US-047) : aucune licence requise ; jeton API pour les pilotes (chiffré en base, jamais renvoyé à la page), OAuth ensuite.
- **E-mails groupés** : un e-mail par action pour l'instant ; un récapitulatif seulement si les pilotes s'en plaignent.

#### Décisions notées (24 octobre 2026)

- **PDF nets au zoom** : une page zoomée du canevas est redessinée plus finement, par-dessus elle-même (rien ne clignote), par paliers (×1,5, ×2, ×3, ×4) une fois le zoom stabilisé, pour les seules pages visibles, dans un budget de 10 millions de pixels par page ; dézoomée, la copie et sa mémoire disparaissent. Pour les livrables PDF et les écrans Figma en PDF ; pas encore dans la comparaison de versions.
- **Commentaires faits dans Figma retirés de l'interface** : trop de lectures Figma (commentaires, écrans de chaque tournée) pour les offres personnelles, et vite pour les agences. Le code reste et ses tests tournent (`FIGMA_COMMENTS=1` le remet) ; à rouvrir quand des agences le demandent. « Figma » dans « Nouveau livrable » mène aux écrans copiés dans Kora.
- **Plus de livrable « Document »** (Word, PowerPoint, Excel…) : Kora ne sait pas l'afficher, rien ne s'y épingle ni ne s'y qualifie précisément ; relire un document à plusieurs est le métier d'un autre outil. Retiré de « Nouveau livrable », refusé par le serveur ; aucun n'existait dans la copie de la base. Un « Document » créé avant s'affiche toujours. À l'agence qui en a un : l'importer en PDF.

#### Décisions notées (21 et 22 octobre 2026)

- **Barre du site de recette** *(21 octobre)* : une ligne de script par livrable, jamais une clé de toute l'agence (lisible par tout visiteur, elle permettrait de sonder ses autres sites) ; l'agence entre dans la barre par sa session Kora, les codes sont aux clients ; la demande de code ne distingue jamais l'adresse d'un membre. Acceptés : plus de demandes d'accès (US-043), un « Lien » doit être un site déployé en `https`.
- **Vidéo** *(22 octobre)* : une épingle a un moment et une place sur l'image ; la limite de taille des vidéos se règle à part (`MAX_VIDEO_UPLOAD_MB`) ; à l'import, Kora prévient sans bloquer d'une vidéo illisible ou dont les sauts « baveront ».
- **IA** *(22 octobre)* : une suggestion de qualification (« Inclus » ou « Hors scope », la ligne du devis citée, une phrase de raison), que l'agence confirme toujours ; le client ne la voit jamais, la preuve garde la décision de l'agence. Elle se branche sur le périmètre de référence (US-045), que le designer prépare. Fournisseur à choisir : Azure OpenAI en Europe recommandé (RGPD, déjà sur Azure), Claude possible ; le code reste indépendant du fournisseur.

## User stories à reporter

Ces stories sont pertinentes mais ne doivent pas entrer dans le premier parcours :

- En tant qu'agence, je veux connecter Kora à Stripe.
- En tant qu'agence, je veux synchroniser les demandes avec ClickUp *(remplacé par l'envoi vers Jira ou Notion, US-047)*.
- En tant qu'agence, je veux générer automatiquement une facture.
- En tant qu'agence, je veux que l'IA détecte le hors périmètre *(une suggestion, que l'agence confirme, est prévue avec le périmètre de référence, US-045)*.
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
- US-048 : annotation d'un site web en ligne *(essai fait ; la cible des agences web)*
- Page mobile optimisée pour le client

### Could have

- US-036 : capture de page web depuis une URL
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
- Vidéo avancée : plages de temps, dessin, image par image *(la base est faite : US-052)*
- IA qui décide seule *(une suggestion de qualification, que l'agence confirme toujours, est prévue avec US-045)*
- Coédition en temps réel
- CRM complet
- Comptabilité
- Signature électronique qualifiée

## Story critique à prototyper en premier

Le prototype doit se concentrer sur cette séquence :

> Un client commente une maquette. Le chef de projet identifie que la demande est hors périmètre. Il transforme le commentaire en proposition complémentaire. Le client accepte le prix et le délai. L'agence dispose ensuite d'une preuve claire de l'accord.

Si ce scénario fonctionne avec trois agences pilotes, Kora possède une base produit crédible. Si les utilisateurs contournent encore le flux par e-mail ou n'osent pas qualifier les demandes, il faudra revoir le positionnement avant de développer davantage.

## Suivi de réalisation

État au 23 octobre 2026. ✅ réalisé · 🟡 partiel · ⬜ à faire · ⛔ abandonné.

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
| US-009 répondre à un commentaire | ✅ | Fil de réponses ; l'agence clôt une discussion, en lecture seule pour tous jusqu'à sa réouverture |
| US-010 demander des modifications | 🟡 | Règle et route serveur faites ; pas de bouton sur la page client |
| US-011 qualifier une demande | 🟡 | Trois états au lieu de quatre ; pas de justification interne |
| US-012 demander une clarification | 🟡 | État « À qualifier » ; pas de blocage ni de notification dédiés |
| US-013 créer une proposition complémentaire | 🟡 | Brouillon, envoi, montant, délai ; pas de date d'expiration de l'offre |
| US-014 accepter une proposition | ✅ | Adresse vérifiée, heure du serveur, une seule décision |
| US-015 refuser une proposition | ✅ | |
| US-016 approuver une version | ✅ | Par le client seulement ; verrouillage contrôlé par le serveur ; réouverture par l'agence avec sa raison |
| US-017 consulter la preuve de validation | ✅ | Construite par le serveur : identités vérifiées, heures du serveur, IP, empreintes du fichier et du récapitulatif |
| US-018 notifier le client | ✅ | Resend, HTML et texte, « Répondre à » ; SPF, DKIM et DMARC publiés |
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
| US-036 capturer une page web | ⬜ | L'URL est enregistrée, pas de capture ; remplacée en pratique par le livrable « Lien » et la barre sur le site (US-048) |
| US-037 se connecter à l'espace agence | ✅ | Adresse confirmée par e-mail ; mots de passe selon les règles de la CNIL ; Google et Microsoft dès que leurs clés sont renseignées |
| US-038 rejoindre une agence sur invitation | ✅ | |
| US-039 droits selon le rôle | ✅ | |
| US-040 changer d'agence | ✅ | |
| US-041 inviter un client sur une revue | ✅ | |
| US-042 confirmer son identité par un code | ✅ | Nom complet demandé à la première vérification |
| US-043 demander l'accès à une revue | ⛔ | Pour des raisons de sécurité (21 octobre 2026) ; les demandes déjà reçues se règlent encore |
| US-044 prévisualiser la page client | ✅ | |
| US-045 périmètre de référence | 🟡 | En cours : l'écran du périmètre (designer). Le moteur de suggestion IA est prêt (`src/lib/ai/`, Claude ou aucun), à brancher sur ses lignes de devis |
| US-046 demande offerte | ⬜ | |
| US-047 envoi vers Jira ou Notion | ⬜ | |
| US-048 annoter un site web en ligne | 🟡 | Essai du 17 octobre : barre sur le site, vérification par code dans le panneau, demande posée sur un élément, épingles, « élément introuvable » ; testé dans Chrome. Site en `https` obligatoire. L'agence dans la barre (fenêtre Kora, commentaires, réponses, qualification ; devis et partage refusés depuis le site). Passage vers la revue Kora sans nouveau code, avec l'appel « devis en attente ». Capture de la fenêtre au clic, dans le fil et la preuve. Ligne de script posée une fois (clé fixe du livrable, dernière version partagée), donnée selon l'outil du site, avec la détection en direct de la barre sur le site ; les e-mails d'invitation et de relance mènent au site avec `?kora`. Dans Kora, un tableau de recette : chaque demande en page du canevas, sa capture avec son épingle. À faire : Safari et Firefox à vérifier à la main, mobile |
| US-049 rôles des personnes invitées | ✅ | Décideur et contributeur, contrôlés par le serveur |
| US-050 saisir une demande reçue ailleurs | ✅ | Source, date, extrait et capture ; visibles par le client et dans la preuve |
| US-051 e-mails des devis et des décisions | ✅ | Décideurs côté client, propriétaire et administrateurs côté agence |
| US-053 comparer deux versions | ✅ | Images et PDF, côté agence et client : frise animée des versions, « avant » puis « après » choisis librement, côte à côte synchronisé, rideau, fil en lecture seule des demandes de l'ancienne version ; le client ne compare que ses versions partagées |
| US-054 qualifier les commentaires Figma | 🟡 | Faits : connexion de chaque membre à son compte Figma (OAuth avec PKCE, clés scellées et renouvelées, déconnexion ; les comptes connectés forment l'équipe ; reprise d'un livrable par un collègue), essayée avec le vrai Figma ; livrable « Figma » (lien du fichier, pages en revue, version enregistrée dans Figma, tournées), une seule lecture du fichier par livrable ; import des commentaires à l'ouverture et sur « Actualiser » (fils du client sur les pages en revue, réponses, liste « équipe », brouillons jusqu'à la qualification, mots de Figma non modifiables par le client). Revue des écrans Figma dans Kora : choix des écrans par page, format par écran (PNG, JPEG, SVG, PDF), copie dans Kora, grande fenêtre de disposition (grille réordonnable, au clavier aussi, écrans par ligne), canevas en lignes, réimport comme nouvelle version, preuve par écran. À faire : réponse dans Figma et notifications, captures, plugin |
| US-052 commenter un moment d'une vidéo | 🟡 | Épingle au moment et à l'endroit, frise des repères, retour au moment en ouvrant un commentaire ; limite de taille propre aux vidéos ; avertissement à l'import (format illisible, images clés rares). Liens de la durée de la vidéo, renouvelés s'ils expirent ; fichiers de plusieurs Go envoyés par blocs. À faire : capture de l'image, reconversion des captures d'écran, plages de temps |

**Avant les premiers pilotes**, il reste à :

- décider du bouton « Demander des modifications » côté client (US-010) ;
- brancher un suivi des erreurs en production et vérifier les sauvegardes de la base ;
- nettoyer les fichiers envoyés au stockage mais jamais validés.

**Prochaines étapes** (23 octobre 2026), dans l'ordre :

1. **US-045, périmètre et suggestion IA.** Le designer construit l'écran du périmètre (lignes du devis, tours de révision). Ensuite : enregistrer les suggestions dans une table réservée à l'agence, les calculer à l'arrivée de chaque demande, pré-remplir « Qualifier », importer un devis en PDF. À fixer avant : où et sous quelle forme le designer range les lignes du devis ; le fournisseur (API Claude d'Anthropic, ou Azure : Claude dans Foundry, ou OpenAI en Europe, conseillé pour le RGPD) ; une clé d'API pour un essai réel.
2. **Essai sur une préversion Vercel**, avec le vrai Azure : une vidéo de plusieurs centaines de Mo à 1 Go envoyée par blocs, une vraie vidéo MP4 (aucun avertissement, sauts nets), la capture GNOME (avertissement), la barre détectée sur le site de démo Café Boréal, Safari et Firefox.
3. **Notes internes** : le designer revient sur le fait de montrer tout le fil d'une demande qualifiée au client. Le README décrit encore l'ancien comportement (notes internes, « Hors scope » visible une fois le devis envoyé), AGENTS.md le nouveau : aligner l'un sur l'autre une fois son retour fait.
4. **Test instable du designer** : glisser une épingle sur une capture d'un « Lien » (`site-toolbar.spec.ts`) échoue parfois dans la suite complète. Vu aussi une fois le 23 octobre 2026 (1 passage complet sur environ 20, branche `feat/figma-comments`, qui ne touche ni la barre ni ce test) : « once in, Kora's logo opens the bar alone » n'a pas trouvé le bouton « Commenter » après la touche C, alors que le panneau de vérification était ouvert ; 20 passages sur 20 seul et 4 passages complets ensuite sans échec, trace perdue : à surveiller, peut-être la même cause (un état relu trop tôt). Cause probable : `ReviewCanvas.tsx` lit au relâchement un état `moving` pas encore rendu ; le corriger par une référence (`useRef`).
5. **Commentaires Figma (US-054)**, demandé et cadré le 23 octobre 2026. Faits : étape 1 (connexion, essayée avec le vrai Figma le 23 octobre), étape 2a (livrable « Figma ») et étape 2b (import des commentaires). Essayé avec le vrai Figma le 23 octobre : le commentaire d'un client arrive avec sa réponse, celui de l'agence reste dans Figma, et Figma accroche bien un commentaire à l'écran de premier niveau (sa page est reconnue). Piste notée : « Relier mon compte Figma » pour chaque membre de l'agence (Figma ne donne pas l'adresse des auteurs de commentaires, seulement au compte connecté lui-même), qui reconnaîtrait l'équipe sans cocher ; à faire si le tri manuel gêne les premières agences. Ensuite l'étape 3 : la réponse de Kora dans le fil Figma et les notifications de Figma. Remarques notées en passant : sur la page client d'un « Figma », le panneau vide dit « Cliquez sur le livrable pour commenter » (à adapter : on commente dans Figma) ; un client peut aujourd'hui modifier le commentaire d'un autre client de la même version (règle existante, à trancher). Pour un essai réel : l'application Figma, créée par le porteur du produit sur figma.com/developers (identifiant et secret dans `.env.local`).
6. **Propositions en attente d'un oui** : un bouton « Comparer » dans le panneau « Versions », des boutons de zoom dans la comparaison, la surbrillance automatique des différences ; vidéo : capture de l'image au clic, reconversion des captures d'écran, plages de temps ; Jira (US-047) ; la page « Pilotage » (branche locale `feat/dashboard`, jamais poussée).

# Personas et user stories de ScopeGuard

Ce document définit les utilisateurs prioritaires et les besoins fonctionnels du MVP de ScopeGuard. Il complète le cadrage produit de [README.md](README.md) et le plan d'exécution de [PLAN_EXECUTION.md](PLAN_EXECUTION.md).

ScopeGuard ne doit pas être conçu comme un simple outil d'annotation. Le produit doit aider les agences à transformer chaque retour client en décision claire : travail inclus, demande à clarifier ou prestation supplémentaire acceptée.

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
| Dirigeant | Paie et évalue le retour financier |
| Chef de projet | Utilise ScopeGuard chaque jour |
| Designer ou développeur | Produit le livrable et traite les demandes |
| Client final | Commente, accepte ou refuse |
| Finance | Exploite les preuves et les factures plus tard |

## User stories du MVP

### Epic 1 : gérer une agence

#### US-001 : créer un espace agence

**En tant que** dirigeant d'agence,  
**je veux** créer un espace de travail,  
**afin de** centraliser mes projets et mon équipe.

**Critères d'acceptation**

- Un espace agence peut être créé avec un nom.
- Le créateur devient administrateur.
- Les données de l'agence sont isolées des autres organisations.
- Le nom et les paramètres de l'agence peuvent être modifiés.

#### US-002 : inviter un collaborateur

**En tant que** administrateur,  
**je veux** inviter un chef de projet ou un membre de l'équipe,  
**afin de** travailler sur les mêmes projets.

**Critères d'acceptation**

- L'administrateur saisit une adresse e-mail.
- L'invité reçoit un lien d'activation.
- Le rôle est défini lors de l'invitation.
- Un membre peut être désactivé sans supprimer l'historique.

### Epic 2 : créer un projet client

#### US-003 : créer un client

**En tant que** chef de projet,  
**je veux** enregistrer un client,  
**afin de** rattacher ses projets et ses validations.

**Critères d'acceptation**

- Le client possède au minimum un nom et une adresse e-mail.
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
- Le fichier est stocké de manière sécurisée.
- Une première version est créée automatiquement.
- Le fichier possède un nom, une date et un auteur.
- Le système refuse les fichiers trop volumineux ou invalides.

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

- Un lien client sécurisé est généré.
- Le lien peut être révoqué.
- Une date d'expiration peut être définie.
- Le client ne voit que le livrable et les informations prévues pour lui.

### Epic 4 : recueillir les retours client

#### US-008 : commenter un emplacement précis

**En tant que** client,  
**je veux** cliquer sur une zone du document et ajouter un commentaire,  
**afin de** montrer exactement ce qui doit être modifié.

**Critères d'acceptation**

- Le commentaire conserve ses coordonnées et sa page.
- Le commentaire indique son auteur et sa date.
- Le commentaire est lié à la version consultée.
- Le client peut modifier ou supprimer son commentaire tant qu'il n'est pas traité.

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
- L'agence reçoit une notification.
- La validation finale n'est pas possible tant que le client demande des modifications.

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

**Critères d'acceptation**

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
- Une proposition peut être enregistrée comme brouillon.
- Elle peut être envoyée au client.
- Le travail ne doit pas être marqué comme accepté avant la décision client.

#### US-014 : accepter une proposition

**En tant que** client,  
**je veux** accepter une proposition complémentaire,  
**afin de** autoriser clairement le travail et son coût.

**Critères d'acceptation**

- Le client voit la description, le prix et l'impact planning.
- L'acceptation nécessite une action explicite.
- L'identité et la date de l'acceptation sont enregistrées.
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
- L'identité, la date et la version sont enregistrées.
- La version approuvée devient verrouillée.
- L'agence reçoit une notification.

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

### Epic 8 : notifications et relances

#### US-018 : notifier le client

**En tant que** chef de projet,  
**je veux** envoyer automatiquement un e-mail au client,  
**afin de** lui signaler qu'un livrable attend sa revue.

#### US-019 : relancer une validation

**En tant que** chef de projet,  
**je veux** relancer un client qui n'a pas répondu,  
**afin de** réduire le délai d'approbation.

**Critères d'acceptation**

- La relance est déclenchée manuellement dans le MVP.
- L'agence voit la date du dernier envoi.
- Le système évite les relances trop fréquentes.
- Le client peut accéder directement au livrable concerné.

## Epic 9 : expérience client dédiée

#### US-020 : ouvrir une revue client

**En tant que** client,  
**je veux** ouvrir un lien de revue dédié,  
**afin de** consulter le livrable sans accéder à l'espace interne de l'agence.

**Critères d'acceptation**

- Une route `/review/[token]` affiche la revue associée au lien.
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

- Le client ne voit que les propositions qui lui sont destinées.
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
- Le journal est consultable depuis le projet.
- Les événements importants ne sont pas supprimés lorsqu'une décision change.

#### US-024 : réinitialiser une démonstration

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

- Les projets, livrables, commentaires et décisions sont stockés côté serveur.
- Les données sont isolées par organisation.
- Un rechargement ou un changement de navigateur ne perd aucune décision.
- Les erreurs de synchronisation sont visibles et récupérables.

#### US-026 : sécuriser les accès et les rôles

**En tant que** administrateur d'agence,  
**je veux** gérer les membres et les accès client,  
**afin de** protéger les données des projets.

**Critères d'acceptation**

- Les membres disposent d'un rôle.
- Les liens clients sont révocables et expirables côté serveur.
- Une organisation ne peut jamais lire les données d'une autre.
- Les actions sensibles sont enregistrées dans le journal d'audit.

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

#### US-035 : naviguer dans un livrable PDF multi-pages

**En tant que** client ou membre de l'agence,  
**je veux** naviguer entre les pages d'un livrable PDF,  
**afin de** consulter et commenter précisément l'ensemble du document.

**Critères d'acceptation**

- Le viewer indique la page courante et le nombre total de pages.
- Les boutons précédent et suivant changent réellement de page.
- Les boutons sont désactivés sur la première et la dernière page lorsque nécessaire.
- Un commentaire conserve le numéro de page auquel il est attaché.
- Les commentaires d'une autre page ne sont pas affichés sur la page courante.
- Le client et l'agence consultent le même document, la même page et les mêmes commentaires.
- Le zoom et le déplacement sont conservés lors d'un changement de page ou réinitialisés de manière explicite.

#### US-036 : capturer une page web depuis une URL

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

## User stories à reporter

Ces stories sont pertinentes mais ne doivent pas entrer dans le premier parcours :

- En tant qu'agence, je veux connecter ScopeGuard à Stripe.
- En tant qu'agence, je veux synchroniser les demandes avec ClickUp.
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
- Gestion des rôles
- Expiration et révocation des liens
- Page mobile optimisée pour le client

### Could have

- US-036 : capture de page web depuis une URL
- US-035 : navigation dans les PDF multi-pages
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

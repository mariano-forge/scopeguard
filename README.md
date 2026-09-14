# ScopeGuard

> Le portail de validation client qui transforme les demandes hors perimetre en decisions facturees.

ScopeGuard est un SaaS destine aux agences web, studios de design et consultants creatifs. Il centralise les retours clients sur des livrables visuels et aide les equipes a transformer chaque demande en une decision claire : incluse dans le perimetre, modification mineure, ou prestation supplementaire a chiffrer.

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

ScopeGuard place la discussion directement sur le livrable et structure le parcours de decision.

1. L'agence importe un PDF, une image ou une capture de page web dans un projet.
2. Le client recoit un lien de revue simple, sans devoir apprendre un outil de gestion de projet.
3. Les commentaires sont attaches a un emplacement precis du livrable.
4. L'agence qualifie chaque demande : `incluse`, `modification mineure`, `hors perimetre` ou `a clarifier`.
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

ScopeGuard est un **systeme de controle du perimetre client pour agences creatrices de livrables visuels**.

La validation visuelle est le point d'entree. La valeur distinctive est la transformation d'un retour client en decision operationnelle et commerciale avant que le travail soit engage.

Ce positionnement evite deux erreurs courantes :

- devenir un clone d'outil d'annotation PDF ;
- devenir un outil de gestion de projet generaliste que les clients evitent d'utiliser.

## Comparaison avec les alternatives

| Alternative | Ce qu'elle fait bien | Limite pour notre cas | Difference ScopeGuard |
| --- | --- | --- | --- |
| Filestage / Ziflow | Relecture, commentaires et circuits de validation de contenu | Oriente production et conformite ; le lien avec le hors perimetre et le devis reste secondaire | Qualification native des demandes et creation de propositions supplementaires |
| Frame.io | Revue video et collaboration creative | Optimise surtout les workflows de production video | Concu pour PDF, maquettes, captures de site et pilotage du perimetre commercial |
| MarkUp.io | Commentaires visuels rapides et simples | Peu de mecanismes pour transformer un retour en accord commercial | Du commentaire a la proposition acceptee, avec une piste d'audit |
| ClickUp / Asana / Trello | Taches, planification et travail interne | L'experience client est trop lourde et le contexte visuel est limite | Un espace client focalise sur une decision par livrable |
| CRM / devis / facturation | Devis, contrats, factures et suivi commercial | Le contexte du retour se perd avant le devis | Le devis complementaire part du commentaire visuel exact qui l'a motive |
| E-mail et messageries | Universels et immediats | Decisions dispersees, aucune traçabilite fiable, pas de garde-fou commercial | Un historique unique, structure et exportable |

La concurrence valide l'existence du besoin de revue et d'approbation. ScopeGuard ne cherche pas a gagner par un plus grand catalogue de fonctionnalites. Il gagne par une question plus proche de la marge : **cette demande etait-elle incluse, et le client a-t-il accepte de payer le supplement avant execution ?**

## Fonctionnalites du MVP

Le MVP doit permettre de tester ce positionnement avec un flux complet, sans construire un outil de production generaliste.

### Projets et livrables

- Espaces de travail par agence.
- Projets associes a un client.
- Import de PDF et d'images.
- Ajout d'une capture de page web depuis une URL.
- Versions de livrables avec statut clair : brouillon, en revue, modifications demandees, approuve.

### Revue client

- Liens partageables et proteges.
- Commentaires positionnes sur un point precis du document.
- Fils de discussion et resolution de commentaires.
- Boutons explicites `Demander des modifications` et `Approuver la version`.
- Relances par e-mail pour les validations en attente.

### Controle du perimetre

- Qualification de chaque demande : `incluse`, `modification mineure`, `hors perimetre`, `a clarifier`.
- Justification interne facultative pour l'equipe.
- Conversion d'un commentaire en proposition complementaire.
- Proposition comprenant description, prix, impact planning et date d'expiration.
- Acceptation ou refus explicite par le client.

### Tracabilite

- Journal horodate des commentaires, classifications, reponses et approbations.
- Version approuvee verrouillee et identifiable.
- Export partageable du recapitulatif de validation.
- Historique disponible avant emission d'une facture ou en cas de litige.

## Ce qui est volontairement hors MVP

Les elements suivants sont utiles mais ne doivent pas retarder la validation du besoin principal :

- Annotation et lecture avancee de videos.
- Coedition en temps reel.
- Edition de documents dans le produit.
- Connecteurs vers de nombreux outils de gestion de projet.
- Generation automatique de contrats complexes.
- Intelligence artificielle de classification des demandes.
- Gestion comptable complete.

Une integration Stripe, puis des connecteurs vers les outils deja utilises par les agences, seront abordes une fois que le parcours commentaire -> devis complementaire -> acceptation sera valide.

## Modele economique

ScopeGuard est un produit B2B par abonnement. Sa valeur est liee au chiffre d'affaires protege et au temps administratif evite, et non au volume brut de fichiers importes.

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
- Montant de chiffre d'affaires supplementaire accepte via ScopeGuard.
- Temps moyen consacre aux relances de validation.
- Taux de projets disposant d'une preuve de validation complete.

## Vision

A terme, ScopeGuard doit devenir la source de verite des decisions client sur les projets au forfait : le lieu ou une demande est contextualisee, arbitree, chiffree, acceptee et rattachee a une livraison.

Le produit ne remplace pas un outil de gestion de projet, un CRM ou une solution comptable. Il les relie au moment le plus fragile de la relation agence-client : celui ou une remarque apparemment simple peut se transformer en travail gratuit.

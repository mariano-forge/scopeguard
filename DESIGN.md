# Design system de Kora

La référence de toute interface de Kora, pour l'équipe comme pour les agents IA. Les valeurs vivent dans `src/theme/tokens.css` (source unique) et `src/theme/shadcn.css` (leur traduction pour Tailwind et shadcn) ; ce document dit comment s'en servir. Une interface qui ne le respecte pas n'est pas terminée.

Inspiration : Linear et Figma. Des surfaces claires, des bordures fines, une hiérarchie portée par la typographie et l'espace, peu de couleur et toujours avec un sens. Moderne et sobre, jamais décoratif.

## Principes

1. **Les composants d'abord** : shadcn (`src/components/ui`) sur les jetons de Kora. On réutilise ou on étend un composant ; on n'écrit pas une nouvelle classe CSS pour ce qu'un composant fait déjà. Un ancien écran retouché passe à shadcn, et le CSS remplacé est supprimé.
2. **Les jetons seulement** : aucune couleur, taille ou ombre codée en dur. Les utilitaires Tailwind (`bg-mist`, `text-graphite`, `bg-status-scope-bg`…) sont les jetons.
3. **La couleur a un sens** : le bleu est l'action, les paires de statut disent un état. Le reste est neutre (encre, gris, papier).
4. **Le contraste AAA** : chaque paire texte / fond de `tokens.css` est mesurée. Un texte ne prend qu'une de ces paires ; jamais une couleur mélangée (`color-mix`) ou une couleur « fill » comme texte. Seule exception acceptée : le bouton principal, blanc sur `--action-ui` (AA, 4,51:1).
5. **Simple** : une idée par bloc, peu de texte, rien d'inutile. En cas de doute, enlever.

## Couleurs

| Rôle | Jetons |
| --- | --- |
| Texte | `--ink` (principal), `--graphite` (secondaire) |
| Surfaces | `--paper` (cartes, page), `--canvas` (fond de l'application), `--mist` (zones en retrait, état sélectionné, survol), `--surface-announce` (fond d'une bannière, `bg-announce`) |
| Bordures | `--border` (cartes, séparateurs), `--border-input` (champs, survol d'une carte) |
| Action | `--cta-fill` / `--cta-text` (bouton principal), `--action-ui` (liens), `--action-text` (texte de lien) |
| Focus | `--focus` (le graphite) : champ en cours de saisie et focus clavier, jamais le bleu |
| Statuts | paires `--status-*-bg` / `--status-*-text`, toujours avec un libellé ou une icône |
| Qualifications | Inclus : `resolved` ; Hors scope : `scope` ; À clarifier : `medium` (badges `decision-*`). Repères du canevas : `--mark-*`, jamais en texte |
| Favori | `--favorite-fill` (l'étoile seulement) |
| Danger | `--danger` (suppression, erreur) |

À ne pas faire :

- **Pas de bloc noir** (fond `--ink` sur un composant), pas de dégradé, pas de fond de couleur vive.
- **Pas de contour bleu**, nulle part : ni pour distinguer une carte, une option ou un élément choisi (il prend `--mist` et une bordure `--ink` ou `--border-input`), ni sur un champ en cours de saisie (bordure `--focus`, sans halo), ni pour le focus clavier (`--focus`). Seule exception : le code couleur de la comparaison de versions (« après »).
- Pas de pastille « Recommandé », « Populaire »… : l'ordre et le bouton principal suffisent.
- Une couleur de statut ne sert pas de décor : le violet dit « Hors scope », pas « IA ».

## Rédaction

- **Guider, pas expliquer** : chaque texte dit à l'utilisateur quoi faire, à l'impératif, en une phrase courte (« Ajoutez ce que le devis exclut. »). Pas de description de la fonctionnalité, pas d'exemple entre parenthèses, pas de justification.
- Un texte par endroit : une ligne d'état dit l'état (« Brouillon », « À définir »), jamais la consigne ; la consigne va là où se fait le geste (sous un titre de section, dans l'infobulle d'un bouton désactivé).
- Les actions se nomment par leur verbe (« Remplacer », « Retirer »), pas par une icône à deviner.

## Typographie

- Inter pour l'interface (`--font-ui`, `font-sans`), Manrope pour les titres (`--font-display`, `font-heading`), IBM Plex Mono pour le technique.
- Échelle : `--t-h2` 28/34 (titre de page), `--t-h3` 20/26 (titre de section, `text-xl`), `--t-body` 16/24, `--t-ui` 14/20 (`text-sm`, le texte courant de l'interface), `--t-caption` 12/16 (`text-xs`, métadonnées).
- Graisses : 400 et 500 pour le texte, 600 pour les titres et libellés. D'anciens écrans ont du 700 : n'en ajoute pas.
- Français : « guillemets », apostrophe ’, espace insécable avant `:` `?` `!` `;` et dans `450 €`.

## Espace, rayons, élévation

- Grille de 4 px : `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-6` 24, `--s-8` 32. Entre les blocs d'une page : 32 (`.browser`).
- Rayons : champ 6 (`rounded-md`), bouton 8 (`rounded-lg`), carte et panneau 12 (`rounded-xl`), pastille ronde.
- **Ombre (`--shadow`) : menus flottants et fenêtres seulement.** Une carte posée dans la page n'a pas d'ombre, ni au survol (`shadow-none` sur `Card`) : sa bordure passe à `--border-input`.

## Composants et motifs

**En-tête de page** : titre (`page-title`), à droite les actions, toutes à 36 px (`Button size="lg"`, réglages `size="icon-lg"`). Un seul bouton principal bleu par page.

**Boutons** : principal (`default`, bleu) pour l'action de la page ; `outline` pour le reste ; `ghost` pour les icônes ; `destructive` pour ce qui supprime, retire ou révoque, et seulement une fois confirmé. Un bouton désactivé dit pourquoi (`Hint`).

**Onglets d'un projet** : soulignés à l'encre, sans fond.

**Tableaux** : `Table` de shadcn, en-têtes triables, recherche et filtres au-dessus, pagination en dessous.

**États vides** : `Empty` de shadcn : une icône neutre, un titre, une phrase qui guide, une action.

**Filtres et barre d'outils** : en une ligne au-dessus de ce qu'ils filtrent ; un filtre actif prend `--mist`, pas de bleu.

**Bannières** (annonce d'une fonctionnalité, recommandation) :

- Une `Card` compacte sur un fond clair plein, `--surface-announce` (`bg-announce`, le bleu le plus clair, sans bordure, `rounded-xl`, sans ombre) : sa hauteur est celle du texte. Texte en `--ink` et `--graphite` (AAA sur ce fond, 17,5:1 et 8:1).
- À gauche : un sur-titre en `text-xs` avec une icône, un titre `text-xl` Manrope, une phrase, un bouton `outline` sur fond blanc (le bouton bleu reste celui de la page).
- À droite, s'il y a la place : une **illustration** qui raconte ce que fait la fonctionnalité telle qu'elle est, en blanc sur le fond de la bannière (bordée, le blanc étant proche du fond) : par exemple la demande d'un client, puis ce que fait l'IA, étape par étape (« Analyse de la demande », « Vérification du périmètre initial »), jusqu'à sa suggestion. Pas de zone grise séparée, pas de faux boutons, pas de schéma à plusieurs pièces.
- Pas de liste d'avantages, pas d'image décorative, pas de fond noir ou coloré, pas de promesse que le produit ne tient pas. Elle disparaît quand elle n'a plus d'objet.

**Barres de défilement** : fines et gris clair partout (`scrollbar-width: thin`, `--border`), pour ne jamais attirer l'œil.

**Bulle d'un commentaire** : 360 px de large (400 px en qualification, le plus large qui tienne à côté de son repère sur un canevas entre les deux panneaux), jusqu'à 85 % de la hauteur du canevas avant que son contenu défile ; ses messages prennent la hauteur de leur contenu.

**Graphes** : le composant Chart de shadcn, couleurs des repères de Kora, palette vérifiée par le validateur `dataviz`, une valeur en texte sur chaque barre.

## Mouvement

Durées `--d-fast` 150, `--d-base` 200, `--d-panel` 250 ; `--ease-out` pour ce qui entre, `--ease-spring` pour ce qui se pose. Rien ne bouge sans raison ; `prefers-reduced-motion` respecté.

## Accessibilité

Un libellé pour chaque champ et chaque bouton icône, des rôles justes, tout au clavier, focus visible (contour `--focus`, graphite). La couleur ne dit jamais rien seule.

## Avant de livrer une interface

- Captures à 1143 px et 760 px de large (`tests/e2e`, spécification temporaire supprimée ensuite), regardées avant de conclure.
- Relire ce document : jetons, paires AAA, pas d'ombre sur une carte, pas de contour bleu, pas de bloc noir.

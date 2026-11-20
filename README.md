# 🎬 Ma Cinémathèque

Webapp simple de gestion d'une collection de films — **zéro dépendance**, fonctionne hors ligne.

## Lancer

Ouvrir directement `index.html` dans un navigateur, ou servir le dossier :

```bash
cd movie-collection
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Fonctionnalités

- Ajouter / modifier / supprimer des films (titre, année, réalisateur, acteurs, genre, statut, note 0–10, durée, affiche, notes)
- **Récupération d'infos TMDB** : bouton 🔎 TMDB dans la fenêtre d'ajout/modification — recherche par titre ( année si saisie), sélection du film parmi les résultats, remplissage automatique : titre, année, réalisateur, acteurs, genres, durée, note, affiche, synopsis. Nécessite une **clé API gratuite** créée sur [themoviedb.org](https://www.themoviedb.org/settings/api) (saisie une fois dans la fenêtre, mémorisée dans le navigateur). Allociné et IMDB ne proposent pas d'API appelable depuis un navigateur (CORS), TMDB est donc le fournisseur utilisé.
- **Import XML** au format [Filmotech](https://www.filmotech.fr) (`<Filmotech_Films><Film>…`), avec détection des doublons ; l'affiche est récupérée dans la section `[XBMC-POSTERS]` des `Commentaires` et le statut d'après `FilmVu`
- Marquer un film comme « vu » ou « à voir »
- Recherche par titre, réalisateur ou genre
- Filtres par genre et statut, tri (titre, année, note, date d'ajout)
- Vue grille (affiches) ou vue liste
- **Fiche détaillée** : clic sur le titre ou l'affiche d'une carte → fenêtre avec grande affiche, réalisateur, année, durée, note, acteurs et synopsis, plus actions rapides (vu /_modifier / supprimer)
- **Pagination** : 50 films par page (Précédent / Suivant), compatible avec recherche et filtres
- **Sélection multiple** : cases à cocher sur chaque carte + « Sélectionner la page », puis bouton **Mettre à jour TMDB (N)** pour mettre à jour en masse les films cochés (barre de progression, arrêt possible, ~150 ms entre chaque requête)
- Statistiques : nombre de films, films vus, note moyenne
- Persistance via `localStorage` (données conservées entre sessions)

## Stack

- HTML5 / CSS3 / JavaScript vanilla (aucune dépendance, aucun build)
- Données stockées localement dans le navigateur (`localStorage`)

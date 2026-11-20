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

- Ajouter / modifier / supprimer des films (titre, année, réalisateur, genre, statut, note 0–10, durée, affiche, notes)
- Marquer un film comme « vu » ou « à voir »
- Recherche par titre, réalisateur ou genre
- Filtres par genre et statut, tri (titre, année, note, date d'ajout)
- Vue grille (affiches) ou vue liste
- Statistiques : nombre de films, films vus, note moyenne
- Persistance via `localStorage` (données conservées entre sessions)

## Stack

- HTML5 / CSS3 / JavaScript vanilla (aucune dépendance, aucun build)
- Données stockées localement dans le navigateur (`localStorage`)

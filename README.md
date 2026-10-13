# N5 Révisions

Web app de révision du vocabulaire JLPT N5 en répétition espacée, calée sur Genki I. Voir le PRD dans le projet.

- Aucune dépendance ni étape de build : des fichiers statiques à servir tels quels (GitHub Pages).
- Données : `data/vocab.json`, généré depuis `contenu-n5/n5_contenu.json`.
- Progression : `localStorage` du téléphone, export/import en JSON depuis l'écran Sauvegarde.
- Hors ligne : `sw.js` met tout en cache. Incrémenter `VERSION` dans `sw.js` à chaque mise en ligne.

Test local : `python3 -m http.server` dans ce dossier, puis ouvrir http://localhost:8000.

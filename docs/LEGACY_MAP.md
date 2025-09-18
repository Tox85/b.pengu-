# LEGACY MAP

## Résumé
- Fichiers en quarantaine: 0
- Tests legacy: 0
- Critères de suppression: voir §3

## 1) Liste des fichiers en quarantaine

| Path | Raison | Remplacé par | Dernier import détecté |
|------|--------|--------------|----------------------|
| Aucun fichier legacy détecté | - | - | - |

**Note :** Le projet semble déjà nettoyé de son code legacy. Aucun fichier trouvé sous `src/__legacy__/` ou `tests/legacy/`.

## 2) Import Guards
- Test de garde `tests/meta/imports.guard.test.ts` empêche l'import des chemins legacy.
- ESLint `no-restricted-imports` interdit `src/__legacy__/*` et `tests/legacy/*`.

## 3) Critères de suppression (à partir de la date du jour)
- 30 jours sans import, ni exécution test.
- Aucun ticket de migration ouvert lié au fichier.
- Remplacement validé par E2E.
- Feu vert du dev owner.

## 4) Plan de migration (si applicable)

**État actuel :** Aucun fichier legacy détecté. Le projet est déjà dans un état propre.

**Recommandations :**
- Maintenir les garde-fous existants pour prévenir l'introduction de code legacy
- Surveiller les nouveaux imports et s'assurer qu'ils respectent l'architecture actuelle
- Documenter toute nouvelle fonctionnalité dans l'architecture modulaire existante

## 5) Monitoring continu

Pour maintenir un codebase propre :

1. **Tests de garde :** Exécuter régulièrement `npm run pretest:guard`
2. **Analyse de dépendances :** Surveiller les imports non utilisés avec `ts-prune`
3. **Code review :** Vérifier que les nouveaux fichiers respectent l'architecture modulaire
4. **Documentation :** Maintenir à jour cette carte legacy lors de changements architecturaux

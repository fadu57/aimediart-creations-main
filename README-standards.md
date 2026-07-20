# Project standards & safeguards

Ce dossier contient les **standards d'ingénierie et garde-fous du projet**,
indépendants de tout agent ou outil.

- `docs/engineering-standards.md` — méthode (spec-driven), Definition of Done,
  invariants SaaS, sécurité, revue à deux étages. Lisible et applicable par
  n'importe qui, avec ou sans agent IA.
- `.claude/rules/frontend.md` — contraintes d'identité visuelle et
  d'accessibilité (contrainte produit).
- `.claude/settings.json` + `.claude/hooks/` — garde-fous d'exécution pour
  Claude Code (blocage `rm -rf`, `push --force`, `DROP`/`TRUNCATE`, lecture de
  secrets). Ne s'appliquent qu'à Claude Code ; l'équivalent agnostique doit
  aussi vivre en CI.

## Vous reprenez ce projet avec votre propre agent ?

Lisez `docs/engineering-standards.md` et donnez-le à votre agent comme
instruction de projet (par ex. importez-le dans votre propre fichier de
contexte). Les garde-fous Claude Code de `.claude/` sont fournis tels quels ;
si vous utilisez un autre agent, portez les mêmes règles dans votre outillage,
et idéalement en intégration continue pour qu'elles s'appliquent à tous.

La méthodologie de pilotage d'agents du mainteneur d'origine (flotte de
sous-agents, rôles, réglages d'effort) n'est **volontairement pas** dans ce
repo : elle lui est propre. Configurez la vôtre.

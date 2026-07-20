# Engineering standards

<!-- Versioned, agent-agnostic. This file describes how the product is built and
     what protects the code — not any one person's way of driving an agent.
     Any contributor (with Claude, Cursor, Codex, or no agent at all) reads this
     and applies it. Personal agent orchestration lives outside the repo. -->

Ce document définit les règles d'ingénierie du projet : elles s'appliquent à
toute personne et tout agent qui contribue, indépendamment de l'outillage.
Quiconque reprend le projet configure son propre agent, mais respecte ces
standards. Il se lit très bien sans agent.

## Méthode : spec-driven development

- **La spec est la source de vérité versionnée.** Le code en est la sortie.
  Toute divergence entre spec et code est un bug — de la spec ou du code — et
  se corrige à la source, jamais au symptôme.
- Artefacts dans le repo : `docs/spec/constitution.md` (règles non
  négociables), `docs/spec/spec.md` (exigences en notation EARS : « QUAND
  [événement], le système DOIT [comportement mesurable] »), `docs/adr/`
  (décisions d'architecture), `docs/process/` (workflow d'équipe).
- **Traçabilité.** Chaque exigence EARS pointe vers la tâche qui l'implémente
  et vers le test qui la prouve. L'ID d'exigence apparaît dans les commits et
  descriptions de PR.
- Une ambiguïté non levée se compile en bug : clarifier avant d'écrire.

## Environnements & Git

- Environnements : `dev` (dev + staging) et `prod`. Tout changement est validé
  en `dev` avant `prod`. Personne ne touche `prod` (déploiement, migration,
  données) sans validation humaine explicite et tracée.
- Branches : `feature/<sujet>`, `fix/<sujet>`, `chore/<sujet>` ; jamais
  directement sur `main`.
- Commits conventionnels (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
  `chore:`), à l'impératif, une intention par commit.
- Jamais de secret, de `.env` ou d'artefact de build committé.

## Actions à validation humaine obligatoire

Ces actions ne sont jamais exécutées sans accord humain explicite (et sont
bloquées côté Claude Code par un hook — voir `.claude/hooks/`, mais la règle
vaut quel que soit l'agent) :

`rm -rf` · `git push --force` · suppression de branche distante ·
`DROP`/`TRUNCATE` · déploiement `prod` · rotation/suppression de secret ·
changements IAM/permissions · migrations de données · toute modification de la
facturation ou des droits d'accès.

## Definition of Done

Une tâche n'est « done » que si TOUT est vrai :

1. le code compile et tourne en `dev` ;
2. les tests pertinents existent, passent, et tracent vers leur exigence EARS ;
3. lint et vérifications de types au vert ;
4. aucun secret ni donnée sensible introduit ;
5. tout défaut, hack, contournement ou dette est explicitement signalé à
   l'humain — jamais laissé silencieux.

Un pipeline vert ne prouve pas la correction. Honnêteté technique : une approche
risquée, fragile ou incomplète est signalée telle quelle.

## Revue : qui écrit ne juge pas

Revue à deux étages sur chaque changement :

- **Étage 1 — automatique**, un relecteur (agent ou outil) *distinct de
  l'auteur*, en lecture seule, traite la surface : vulnérabilités, contrôles
  manquants, style, couverture. Consultatif d'abord, bloquant une fois calibré.
- **Étage 2 — humain** : intention, design, risque de production.

Même exigence de revue pour un commit produit par un agent que pour un commit
humain, sans exception. L'auteur d'un changement ne valide jamais sa propre
revue.

## Architecture & code

- Simplicité d'abord (YAGNI, KISS) ; stack éprouvée et « ennuyeuse ». Pas
  d'abstraction avant un besoin réel ; factoriser à la deuxième occurrence.
- Séparation des responsabilités (API / domaine / persistance). Nommage
  explicite. Les commentaires expliquent le *pourquoi*, jamais le *quoi*.
- Gestion d'erreur explicite : pas de `catch` silencieux ; échouer tôt avec un
  message actionnable.
- Tests dans le même lot que le code. Pas de test au vert = pas « done ».

## Invariants SaaS — sécurité critique, revue humaine obligatoire

- **Isolation multi-tenant** des données par client (le mode d'échec critique
  d'un SaaS ; toute PR qui y touche passe en revue humaine).
- AuthN/AuthZ et rôles ; pas d'endpoint sans contrôle d'accès ; se prémunir
  contre l'escalade de privilèges et l'IDOR.
- Facturation et abonnements ; migrations réversibles autant que possible,
  testées en `dev` d'abord.
- Secure by default : valider/assainir **toute** entrée externe ; requêtes
  **paramétrées** uniquement ; configuration sensible en variables
  d'environnement ; moindre privilège ; aucun secret dans les logs.
- Conformité RGPD sur les données visiteurs (traitement, journalisation,
  chiffrement en transit et au repos).

## ADR

Chaque décision structurante est consignée en note courte (contexte, options
envisagées, décision, conséquences) dans `docs/adr/`. Les post-mortems
d'incident mettent à jour `docs/spec/constitution.md`.

## Dépendances

Justifier chaque ajout ; préférer la bibliothèque standard et les dépendances
maintenues ; audit de vulnérabilités régulier (deps + licences).

## Frontend

Les contraintes d'identité visuelle, d'accessibilité et de qualité front sont
dans `.claude/rules/frontend.md` (versionné) — ce sont des contraintes produit,
applicables par tout contributeur.

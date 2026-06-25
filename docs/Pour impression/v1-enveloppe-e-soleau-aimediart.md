# .DOSSIER DE SYNTHÈSE TECHNIQUE ET FONCTIONNELLE

## Enveloppe e-Soleau — Plateforme AIMEDIArt

---


| Référence                                   | Détail                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Dénomination du service**                 | AIMEDIArt (domaine : AIMEDIArt.com)                                                              |
| **Nature juridique du dépôt**               | Description technique destinée à l'établissement d'une preuve de date (enveloppe e-Soleau, INPI) |
| **Signe distinctif joint**                  | `aimediart-logo-block.jpeg`                                                                      |
| **Support logiciel de référence**           | Dépôt source de l'application AIMEDIArt                                                          |
| **Date de constitution du présent dossier** | 18 juin 2026                                                                                     |
| **Rédaction**                               | Dossier technique — ton descriptif de dépôt de propriété intellectuelle                          |


---

## AVERTISSEMENT MÉTHODOLOGIQUE

Le présent document constitue une **description détaillée de l'état de l'art tel qu'incarné par la plateforme AIMEDIArt** au moment de sa rédaction. Il vise à permettre à un examinateur, à un conseil en propriété intellectuelle ou à un tiers non spécialiste du développement logiciel de comprendre la **richesse fonctionnelle**, la **chaîne de traitement des données** et le **caractère innovant** du système.

Ce dossier **ne constitue pas** une demande de brevet, une déclaration de création au sens du Code de la propriété intellectuelle, ni un avis juridique. Il accompagne une démarche de preuve d'antériorité.

Les références aux fichiers source (chemins, fonctions, tables) sont fournies à titre probatoire : elles permettent de relier chaque affirmation à un élément vérifiable du dépôt logiciel.

---

## SOMMAIRE

1. [Présentation générale et finalité du système](#1-présentation-générale-et-finalité-du-système)
2. [Identité visuelle et analyse sémiologique du signe](#2-identité-visuelle-et-analyse-sémiologique-du-signe)
3. [Architecture technique du SaaS](#3-architecture-technique-du-saas)
4. [Modules d'intelligence artificielle](#4-modules-dintelligence-artificielle)
5. [Médiation par l'émotion et analyse comportementale](#5-médiation-par-lémotion-et-analyse-comportementale)
6. [Statistiques, rapports et aide à la décision curatoriale](#6-statistiques-rapports-et-aide-à-la-décision-curatoriale)
7. [Parcours visiteur et médiation interactive](#7-parcours-visiteur-et-médiation-interactive)
8. [Procédés différenciants et résolution des problèmes sectoriels](#8-procédés-différenciants-et-résolution-des-problèmes-sectoriels)
9. [Inventaire probatoire des éléments logiciels](#9-inventaire-probatoire-des-éléments-logiciels)
10. [Déclaration de paternité](#10-déclaration-de-paternité)

---

## 1. Présentation générale et finalité du système

### 1.1. Contexte sectoriel

La médiation culturelle traditionnelle repose sur un ensemble d'outils éprouvés mais fragmentés : cartels muraux, dossiers pédagogiques, audioguides enregistrés en studio, conférences de médiateurs humains, livrets de salle et, plus récemment, codes QR redirigeant vers des pages web statiques. Chacun de ces dispositifs répond à une partie du besoin — informer, émouvoir, mesurer la fréquentation — mais rarement à l'ensemble du parcours : **produire**, **personnaliser**, **diffuser**, **écouter** et **comprendre** la réception d'une œuvre par des publics hétérogènes.

AIMEDIArt naît de la conviction que la médiation contemporaine doit intégrer trois dimensions jusqu'ici disjointes :

- la **production de contenus** (textes et voix) à l'échelle d'une exposition entière ;
- la **personnalisation** de l'expérience de lecture selon le profil du visiteur ;
- la **mesure qualitative** de la réception, au plus près du moment de contemplation.

La plateforme se présente comme un **logiciel en mode SaaS** (Software as a Service), accessible par abonnement aux organisations culturelles (galeries, musées, institutions, agences, commissaires indépendants), et par accès web gratuit aux visiteurs finaux via le scan d'un code QR apposé sur l'œuvre ou sur un cartel imprimé.

### 1.2. Finalité fonctionnelle

AIMEDIArt permet à un organisateur d'exposition de :

1. **Cataloguer** ses œuvres, artistes et expositions dans un espace sécurisé multi-utilisateurs ;
2. **Analyser** photographiquement une œuvre et en extraire un matériau source structuré ;
3. **Générer automatiquement** huit registres de discours de médiation (personas) en cinq langues ;
4. **Produire des audioguides** multivoix (féminine et masculine) pour chaque combinaison langue × persona ;
5. **Imprimer des cartels** intégrant un code QR « scan-friendly » ;
6. **Accueillir les visiteurs** sur une interface mobile dédiée, sans installation préalable ;
7. **Recueillir** leur émotion, leur notation par cœurs et leurs commentaires au sortir de chaque œuvre ;
8. **Visualiser et exporter** des statistiques agrégées pour ajuster la scénographie et les contenus.

Pour le visiteur final, AIMEDIArt transforme le scan d'un code QR en un **parcours de médiation personnalisé** : choix d'un ton de lecture, écoute optionnelle, expression du ressenti — le tout dans la continuité d'une déambulation muséale, sans rupture vers un formulaire marketing ou une application à installer.

### 1.3. Positionnement par rapport à l'état de l'art


| Dimension                 | Pratique traditionnelle                | AIMEDIArt                                            |
| ------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Production des textes     | Rédaction manuelle, une version unique | Génération IA de huit personas × cinq langues        |
| Audio                     | Studio d'enregistrement, voix unique   | Synthèse vocale automatisée, voix F/M par persona    |
| Personnalisation visiteur | Audioguide linéaire ou page web fixe   | Carousel de personas sélectionnable en temps réel    |
| Mesure d'audience         | Compteur de passages, enquête différée | Feedback émotionnel immédiat, obligatoire, structuré |
| Boucle d'amélioration     | Anecdotes, retours informels           | Statistiques corrélées œuvre × émotion × persona     |
| Déploiement               | Multiples outils non intégrés          | Chaîne unifiée image → texte → audio → QR → stats    |


---

## 2. Identité visuelle et analyse sémiologique du signe

### 2.1. Description formelle du signe joint

Le fichier `**aimediart-logo-block.jpeg`**, annexé au présent dépôt e-Soleau, représente le signe distinctif de la plateforme. Il se compose de trois éléments graphiques disposés horizontalement sur fond blanc :

1. **Un pictogramme** : un cœur stylisé en contour blanc, inscrit dans un carré à angles fortement arrondis (forme de « squircle »), rempli d'un rouge vif uniforme ;
2. **Un logotype** : la mention « AIMEDIArt.com », en caractères sans empattement, graisse élevée, chromie rouge identique au pictogramme — les lettres « AIMEDIA » en capitales, « rt.com » en minuscules ;
3. **Une baseline** : la mention « Art-mediation with AI », en italique, taille inférieure, même chromie rouge.

La couleur distinctive est un **rouge corail vif**, codée dans l'interface applicative sous les références `BRAND_RED` (`#E63946`) et déclinaisons associées. Ce rouge est systématiquement employé pour les éléments d'action (boutons, liens, mots-clés de marque) et pour le pictogramme cœur.

### 2.2. Analyse sémiologique

#### 2.2.1. Le cœur : médiation par l'émotion

Le cœur est l'un des symboles universels les plus immédiatement reconnaissables de l'**affect**, de l'**engagement** et de l'**appréciation**. Dans le contexte des arts visuels, il renvoie directement au geste de "notation par cœurs" implémenté dans l'application : le visiteur exprime son degré d'attachement à une œuvre en attribuant une note symbolique, matérialisée par l'icône cœur et accompagnée d'une animation de confettis (`triggerHeartConfetti` dans `src/pages/VisitorView.tsx`).

Le choix du cœur en **contour blanc** sur fond rouge — plutôt qu'un cœur plein — suggère une **émotion contenue, réfléchie**, invitant à la contemplation plutôt qu'à l'effusion immédiate. Il évoque le geste du visiteur qui, devant l'œuvre, **prend le temps** de formuler son ressenti avant de l'exprimer. Ce pictogramme n'est donc pas un simple ornement marketing : il condense la philosophie produit de AIMEDIArt, selon laquelle la médiation culturelle authentique passe par la reconnaissance et la structuration des émotions du public.

#### 2.2.2. Le rouge : intensité et présence

Le rouge employé n'est pas un rouge institutionnel sombre (comme ceux des musées nationaux) ni un rouge d'alerte. C'est un rouge **énergique, chaleureux, contemporain**, qui positionne AIMEDIArt comme un acteur **vivant** de la médiation, en rupture avec l'image parfois froide ou intimidante des institutions culturelles. Ce rouge assure également une **forte visibilité** sur les cartels imprimés, les écrans mobiles des visiteurs et la vitrine web — un impératif pratique dans un environnement de salle d'exposition où l'attention est fragmentée.

#### 2.2.3. Le logotype « AIMEDIArt » : hybridation médiation / intelligence artificielle

La décomposition du logotype est significative :

- **AI** en capitales initiales : renvoie explicitement à l'**Artificial Intelligence** (intelligence artificielle), cœur technologique du produit ;
- **MEDIA** : renvoie à la médiation artistique ;
- **Art** en minuscules dans « AIMEDIArt » : ancrage dans le domaine **artistique**, volontairement intégré au mot composé plutôt que séparé, pour signifier que l'art n'est pas le contenu d'un média mais l'**objet même** de la médiation.
- Le logo peutr aussi se lire par association du verbe "AIMER" et par le mot "MEDIATION : AIMEDIA

Le suffixe « .com » ancre le service dans l'économie numérique et le modèle SaaS, distinct d'un outil éditorial ou d'une publication imprimée.

#### 2.2.4. La baseline « Art-mediation with AI »

Cette mention explicite la **proposition de valeur** en une seule phrase : la médiation artistique (« Art-mediation ») assistée par l'intelligence artificielle (« with AI »). L'usage de l'anglais pour la baseline, alors que le service est multilingue, positionne AIMEDIArt sur un marché international de la médiation culturelle numérique.

Le trait d'union dans « Art-mediation » unit deux concepts souvent séparés dans le discours institutionnel : l'**art** (objet de contemplation) et la **médiation** (acte de transmission). AIMEDIArt postule que les deux sont indissociables et que l'IA peut servir de **pont** entre eux sans les réduire l'un à l'autre.

#### 2.2.5. Cohérence signe / produit

Le signe distinctif n'est pas décoratif : il est **fonctionnellement cohérent** avec l'architecture du produit. Le cœur renvoie au feedback émotionnel ; le rouge à l'engagement visiteur ; « AI » aux modules de génération ; « Art-mediation » au cœur métier. Cette cohérence sémiotique renforce la **distinctivité** du signe et son aptitude à identifier le service dans le secteur de la médiation culturelle numérique.

**Fichiers d'implémentation du signe :** `public/brand/aimediart-logo-block.`*, `src/lib/pdfHeaderLogoBlock.ts`, `src/lib/aimediartBrandLogoSvg.ts`, intégration dans `src/components/PublicVitrineShell.tsx` et les cartels PDF (`src/lib/cartelPdfRenderer.ts`).

---

## 3. Architecture technique du SaaS

### 3.1. Intention architecturale

L'architecture d'AIMEDIArt a été conçue pour répondre à une contrainte double :

- d'une part, offrir une **expérience visiteur fluide** sur mobile, sans friction d'installation ; 
- d'autre part, fournir aux organisateurs un **backoffice complet** de gestion d'exposition, de production de contenus et d'analyse.

Ces deux mondes — visiteur anonyme et professionnel authentifié — coexistent dans une même application web, avec des parcours, des permissions et des interfaces distincts.

Le choix d'une architecture **web responsive** (plutôt que des applications natives iOS/Android) permet au visiteur d'accéder au service via n'importe quel navigateur mobile, immédiatement après le scan d'un QR code, sans passage par un store d'applications. 

Pour l'organisateur, le même accès web évite la maintenance de clients lourds et assure la mise à jour instantanée des fonctionnalités.

### 3.2. Description de l'architecture en couches

#### Couche présentation (client web)

L'interface utilisateur est développée en **React 18** avec **TypeScript**, assemblée par **Vite**, et organisée en routes distinctes :

- **Vitrine publique** (`/organisation`) : présentation commerciale du service, tarifs, pages légales ;
- **Parcours visiteur** (`/artwork/:id`, `/visitor`, `/scan`) : lecture d'œuvre, personas, feedback ;
- **Backoffice** (routes protégées) : catalogue, expositions, statistiques, paramètres, facturation.

L'état serveur est géré par **TanStack Query**, qui assure le cache, le rafraîchissement et la cohérence des données affichées. 

L'internationalisation est assurée par **i18next** en cinq langues d'interface : français, anglais, allemand, espagnol, italien.

**Point d'entrée :** `src/App.tsx`, `src/bootstrap.tsx`

#### Couche données et authentification (Supabase)

Le backend repose sur **Supabase**, plateforme open-source fournissant :

- un moteur **PostgreSQL** relationnel pour la persistance structurée ;
- un service **Auth** (authentification JWT) pour les utilisateurs professionnels et les visiteurs ;
- un **Storage** objet pour les fichiers (audioguides, photos, selfies) ;
- des **Edge Functions** (fonctions serverless Deno) pour les traitements sensibles et les appels aux API d'intelligence artificielle.

La sécurité des données repose sur le mécanisme **Row Level Security (RLS)** de PostgreSQL : chaque requête est filtrée selon l'identité de l'utilisateur et son rattachement à une agence (`agency_id`). Une **matrice de sécurité** (`matrice_securite`) définit finement les permissions par rôle et par ressource (menus, tables sensibles, prompts IA).

**Hiérarchie des rôles :**


| Rôle          | Identifiant | Stockage                         | Périmètre                 |
| ------------- | ----------- | -------------------------------- | ------------------------- |
| Admin général | 1           | JWT (`app_metadata.role_id`)     | SaaS global               |
| Super admin   | 2           | JWT                              | SaaS global               |
| Développeur   | 3           | JWT                              | SaaS global               |
| Admin agence  | 4           | `agency_users.role_id`           | Une agence                |
| Curator expo  | 5           | `agency_users.role_id`           | Expositions assignées     |
| Équipe expo   | 6           | `agency_users.role_id`           | Expositions assignées     |
| Visiteur      | 7           | Implicite (inscription publique) | Parcours œuvre uniquement |


**Fichiers pivots :** `src/hooks/useAuthUser.ts`, `src/lib/authUser.ts`, `src/lib/userScope.ts`, `supabase/matrice_securite.sql`

#### Couche traitement (Edge Functions)

Les opérations nécessitant des clés API secrètes, une puissance de calcul significative ou un contournement contrôlé des règles RLS sont exécutées côté serveur via des **Edge Functions** Supabase. On dénombre plus de soixante-dix fonctions, dont les principales pour la médiation culturelle :


| Fonction                      | Rôle                                           |
| ----------------------------- | ---------------------------------------------- |
| `generate-mediation`          | Génération synchrone des textes multi-personas |
| `analyze-artwork-image`       | Analyse vision de la photographie d'œuvre      |
| `generate-audio`              | Synthèse vocale OpenAI, stockage bucket        |
| `google-tts`                  | Synthèse vocale à la volée pour le visiteur    |
| `ai-create-job` / `ai-worker` | File asynchrone de jobs IA                     |
| `check-ai-limits`             | Contrôle des quotas de consommation            |
| `register-visitor-instant`    | Inscription visiteur                           |
| `visitor-audio-session`       | Présence audio en salle                        |
| `connected-expo-quote`        | Devis exposition hors réseau                   |


Chaque appel à un fournisseur d'IA est précédé d'une vérification préventive (`checkAILimitBeforeCall` dans `supabase/functions/_shared/aiGuard.ts`) et suivi d'une journalisation dans `ai_usage_logs`.

#### Couche fournisseurs d'intelligence artificielle

AIMEDIArt orchestre plusieurs fournisseurs d'IA selon la tâche :


| Fournisseur                    | Usage                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| **Google Gemini**              | Analyse vision d'image, génération de médiation (personas à contraintes formelles) |
| **Groq**                       | Génération de médiation (mode standard), jobs asynchrones                          |
| **OpenAI** (`gpt-4o-mini-tts`) | Audioguides pré-générés, persistés                                                 |
| **Google Cloud TTS**           | Lecture audio à la volée côté visiteur                                             |


Le modèle actif est configurable globalement via `app_settings.selected_ai_model`, permettant à l'administrateur de basculer entre fournisseurs sans modification du code.

### 3.3. Flux de données global

Le flux de données typique d'une exposition équipée AIMEDIArt peut être schématisé ainsi :

```
ORGANISATEUR (backoffice)
    │
    ├── Upload photo œuvre ──────────────────► Storage Supabase
    ├── Analyse image (Gemini Vision) ───────► artwork_source_material
    ├── Génération médiation (LLM) ──────────► artwork_description_i18n (JSONB)
    ├── Génération audio (OpenAI TTS) ───────► audio_files + bucket audio-guides
    ├── Impression cartel PDF + QR ────────────► document imprimable
    │
VISITEUR (mobile web)
    │
    ├── Scan QR ─────────────────────────────► /artwork/:id
    ├── Sélection persona (carousel) ────────► lecture artwork_description_i18n
    ├── Écoute audio (optionnelle) ──────────► audio_files ou google-tts
    ├── Feedback émotion + cœurs + commentaire ► INSERT visitor_feedback
    │
ORGANISATEUR (backoffice)
    │
    └── Consultation statistiques ────────────► agrégation visitor_feedback
```

Ce flux unique, intégré dans une seule plateforme, constitue l'un des apports architecturaux majeurs d'AIMEDIArt par rapport à l'assemblage d'outils disparates.

### 3.4. Modèle économique et multi-locataire

Le SaaS est structuré en **plans d'abonnement** (Étincelle, Atelier, Horizon, Rayonnement), définis dans le schéma de facturation (`supabase/migrations/migration_79_pricing_billing_schema.sql`). 

Chaque organisation cliente dispose de son propre espace isolé (`agency_id`), avec des quotas d'œuvres, de visiteurs et de fonctionnalités IA selon le plan souscrit.

Un **mode veille** (`standby`) permet aux organisations de suspendre temporairement leur abonnement actif tout en conservant leurs données, répondant au rythme saisonnier des expositions (`supabase/migrations/20260617120000_organisation_standby_request.sql`).

---

## 4. Modules d'intelligence artificielle

### 4.1. Intention générale

Les modules d'intelligence artificielle d'AIMEDIArt ne visent pas à remplacer le médiateur humain, mais à **augmenter sa capacité de production** et à **démultiplier les registres de discours** disponibles pour un même contenu curatorical. L'IA intervient à trois moments clés : 

- l'analyse de l'image de l'œuvre, 
- la génération des textes de médiation, 
- la synthèse vocale de ces textes.

Chaque intervention est **tracée, limitée et réversible** : le curator (Commissaire d'exposition) conserve le contrôle éditorial sur le matériau source et peut modifier, compléter ou supprimer tout texte généré avant publication.

### 4.2. Analyse visuelle de l'œuvre

#### Intention

Avant de générer des textes de médiation, le système doit disposer d'une **description structurée** de l'œuvre. Plutôt que de demander au curator de rédiger manuellement cette description, AIMEDIArt propose une analyse automatique de la photographie de l'œuvre par un modèle de vision (Google Gemini).

#### Flux de données

1. Le curator téléverse une photographie de l'œuvre dans le backoffice ;
2. Le client appelle `analyzeArtworkImage()` (`src/services/imageAnalysisService.ts`) ;
3. L'Edge Function `analyze-artwork-image` envoie l'image à Gemini avec un prompt configurable (`app_settings.analysis_prompt`) ;
4. Le modèle retourne une description structurée (sujet, technique, composition, palette, contexte) ;
5. Cette description est stockée dans `artworks.artwork_source_material` et présentée au curator pour validation ou édition.

#### Bénéfice utilisateur

Le curator dispose en quelques secondes d'un **premier jet analytique** qu'il peut enrichir de son expertise. Pour une exposition de cinquante œuvres, ce gain de temps est considérable par rapport à la rédaction manuelle de fiches descriptives.

### 4.3. Génération de médiation multi-personas

#### Intention

Un même contenu curatorical doit pouvoir être **reformulé** pour des publics aux attentes et aux niveaux de lecture différents : un enfant de dix ans, un expert en histoire de l'art, un visiteur occasionnel, un public senior, etc. AIMEDIArt encode cette diversité sous la forme de **huit personas** (styles de médiation) canoniques, définis dans `src/lib/mediationStyleCodes.ts` :


| Code         | Persona    | Public visé                    |
| ------------ | ---------- | ------------------------------ |
| `simple`     | Simple     | Vulgarisation accessible       |
| `poetique`   | Poétique   | Registre littéraire, évocateur |
| `expert`     | Expert     | Discours curatoral, références |
| `senior`     | Senior     | Adaptation public âgé          |
| `pote`       | Pote       | Ton conversationnel            |
| `conteur`    | Conteur    | Narration, mise en récit       |
| `hip-hopeur` | Hip-hopeur | Culture contemporaine, urbaine |
| `enfant`     | Enfant     | Jeune public                   |


Chaque persona est configurable par l'administrateur via la table `prompt_style` (consignes système, règles stylistiques, budget de tokens, icône, libellés multilingues).

#### Flux de données

1. Le curator déclenche la génération depuis le backoffice (catalogue ou fiche œuvre) ;
2. Le client appelle `generateMediation()` (`src/services/mediationService.ts`) ou `generatePersonasBatchWithRetry()` (`src/lib/mediationBatchGenerate.ts`) ;
3. L'Edge Function `generate-mediation` reçoit le matériau source, la langue cible et la liste des personas à générer ;
4. Le modèle LLM (Gemini ou Groq, selon configuration) produit un JSON structuré : `{ analyse_globale, styles: { [personaId]: texte } }` ;
5. Les textes sont normalisés et stockés dans `artworks.artwork_description_i18n`, structure JSONB hiérarchisée par langue puis par persona ;
6. Une entrée est créée dans `ai_usage_logs` (tokens consommés, modèle, coût estimé).

La stratégie de génération par lots avec repli (`generatePersonasBatchWithRetry`) assure la résilience : en cas d'échec partiel, le système retente au niveau du lot, puis au niveau de chaque persona individuellement.

#### Bénéfice utilisateur

Le curator obtient **huit versions distinctes** d'un même discours de médiation, prêtes à être proposées au visiteur, sans rédiger chaque version manuellement. Pour une exposition multilingue (cinq langues), cela représente jusqu'à **quarante textes** par œuvre, produits en quelques minutes.

### 4.4. Synthèse vocale et audioguides

#### Intention

La médiation culturelle ne se limite pas au texte écrit : l'**écoute** est un mode de réception fondamental, notamment pour les publics en situation de déplacement, de fatigue visuelle, ou de handicap. AIMEDIArt automatise la production d'audioguides à partir des textes de médiation générés.

#### Flux de données

1. Le curator déclenche la génération audio depuis le backoffice ;
2. Le service `audioService.ts` (~1 190 lignes) orchestre une **file de génération concurrente** ;
3. Pour chaque combinaison (œuvre × langue × persona × genre vocal F/M), l'Edge Function `generate-audio` :
  - extrait le texte depuis `artwork_description_i18n` ;
  - applique le « vibe » du persona depuis `prompt_style` ;
  - appelle OpenAI `gpt-4o-mini-tts` ;
  - stocke le fichier audio dans le bucket `audio-guides` ;
  - enregistre les métadonnées dans `audio_files` (clé composite : `text_id`, `text_type`, `lang`, `prompt_style_id`, `gender`) ;
4. Le visiteur, sur mobile, peut écouter le fichier pré-généré (`AudioPlayer`) ou demander une lecture à la volée (`google-tts`).

La file gère la concurrence (5 workers par défaut, maximum 8), les relances automatiques après échec (30 secondes), et l'annulation par l'utilisateur.

#### Bénéfice utilisateur

Une exposition de trente œuvres, huit personas, cinq langues et deux voix (féminine et masculine) représente théoriquement **2 400 fichiers audio**. AIMEDIArt automatise cette production, rendant économiquement viable une médiation vocale riche que seuls les grands musées peuvent aujourd'hui s'offrir via des studios d'enregistrement.

### 4.5. Gouvernance et maîtrise des coûts IA

Chaque appel à un fournisseur d'IA est soumis à un **garde-fou préventif** (`checkAILimitBeforeCall`) qui consulte la vue `ai_usage_vs_limits` avant d'autoriser l'exécution. Les consommations sont journalisées de manière unifiée (`ai_usage_logs`, `ai_usage_events`), et une interface d'administration (`SettingsSuiviTokens.tsx`) permet le suivi en temps réel.

Cette gouvernance intégrée est rare dans les outils de médiation culturelle, habituellement dépourvus de toute visibilité sur les coûts des traitements IA.

---

## 5. Médiation par l'émotion et analyse comportementale

*Cette section constitue l'un des apports les plus singuliers d'AIMEDIArt. Elle décrit un procédé inédit de collecte, structuration et exploitation des données émotionnelles dans le contexte de la médiation culturelle numérique.*

### 5.1. Philosophie du recueil de données émotionnelles

#### Le problème de la médiation traditionnelle

Dans la médiation culturelle classique, la relation entre l'institution et son public est largement **asymétrique** : l'institution produit et diffuse un discours ; le public le reçoit, en silence. Les outils de mesure existants — compteurs de fréquentation, questionnaires de satisfaction en fin de visite, livres d'or — capturent des données **tardives**, **agrégées** et **déconnectées** du moment de contemplation. Ils ne permettent pas de savoir *ce que le visiteur a ressenti devant telle œuvre*, *à quel moment*, *dans quel registre de lecture*.

Les enquêtes de satisfaction posent des questions génériques (« Avez-vous apprécié votre visite ? ») longtemps après l'expérience émotionnelle, lorsque la mémoire affective s'est déjà transformée. Les compteurs de passages ne distinguent pas un visiteur captivé d'un visiteur indifférent passant devant l'œuvre.

#### La proposition AIMEDIArt

AIMEDIArt postule qu'une **émotion captée à chaud**, au moment même où le visiteur quitte l'œuvre, est une donnée d'une richesse incomparable pour la médiation culturelle. Le système ne demande pas au visiteur de « noter le service » ou de « remplir un formulaire » : il l'invite à **exprimer ce qu'il a ressenti**, dans le registre naturel de l'émotion et de l'appréciation, comme il le ferait en murmurant à un compagnon de visite.

Cette philosophie se traduit par trois principes :

1. **Immédiateté** : le feedback est recueilli au sortir de l'œuvre, avant toute navigation vers l'œuvre suivante ;
2. **Non-intrusivité** : le visiteur n'a pas besoin de créer un compte ; une identité légère (pseudo, avatar) suffit ;
3. **Structuration** : l'émotion n'est pas un commentaire libre non catégorisable, mais une sélection dans un catalogue référencé, complété par une notation par cœurs et un commentaire optionnel.

Le visiteur devient ainsi un **acteur de sa propre médiation** : en exprimant son ressenti, il contribue à la compréhension de la réception de l'œuvre, sans que cette contribution ne ressemble à une démarche marketing ou à une enquête institutionnelle.

### 5.2. Mécanisme technique de collecte

#### Étape 1 : Parcours de médiation

Le visiteur accède à l'œuvre via le scan d'un code QR (`/artwork/:id`). Il est accueilli par un **carousel de personas** (composant Swiper, `src/lib/mediationSwiperLoop.ts`) lui permettant de choisir le registre de lecture qui lui convient : poétique, expert, enfant, etc. Il lit le texte de médiation correspondant, peut l'écouter en audio, et prend le temps de la contemplation.

Le persona sélectionné est mémorisé : localement (`visitorDefaultPersona.ts`) et, si le visiteur est identifié, côté serveur via la RPC `set_visitor_persona_defaut` (table `visitors.persona_defaut`). Cette mémorisation assure la **continuité d'expérience** lors des visites ultérieures.

#### Étape 2 : Écran de feedback obligatoire

Lorsque le visiteur souhaite passer à l'œuvre suivante, le système vérifie qu'il a soumis un feedback (`assertFeedbackBeforeLeavingArtwork()` dans `src/pages/VisitorView.tsx`). Si ce n'est pas le cas, la navigation est bloquée et l'écran de feedback est présenté.

Cet écran propose trois niveaux d'expression :

1. **Sélection d'une émotion** : le visiteur choisit parmi le catalogue `emotions`, affiché avec icône et libellé localisé (`getEmotionLabel()` — résolution multilingue depuis `name_emotion`, `Emotion_M`, `name_emotion_en`, etc.) ;
2. **Notation par cœurs** : le visiteur attribue une note symbolique (échelle configurable), matérialisée par des icônes cœur et accompagnée d'une animation de confettis (`triggerHeartConfetti()`) ;
3. **Commentaire libre** (optionnel) : un champ texte permet d'ajouter une verbalisation personnelle.

#### Étape 3 : Enregistrement structuré

À la validation, le client construit un payload (un service) et l'insère dans la table `visitor_feedback` :

```
{
  agency_id:    UUID de l'agence organisatrice,
  artwork_id:   UUID de l'œuvre contemplée,
  visitor_id:   UUID du visiteur (anonyme ou authentifié),
  emotion_id:   UUID de l'émotion sélectionnée,
  heart_rating: notation numérique par cœurs,
  expo_id:      UUID de l'exposition,
  visit_id:     UUID de la session de visite (si active),
  comment_text: commentaire libre (optionnel),
  submitted_at: horodatage automatique
}
```

Cette structure, implémentée dans `src/pages/VisitorView.tsx` (lignes ~1065–1084), assure que **chaque feedback** (retour d'information) **est rattaché** à une œuvre précise, un visiteur identifiable, une émotion catégorisée, une exposition et, le cas échéant, une session de visite (`visitor_expo_visits`).

La liaison `visit_id` (ajoutée par migration `20260612120000_visitor_expo_visits_schema.sql`) permet de reconstituer le **parcours complet** d'un visiteur au sein d'une exposition : quelles œuvres il a vues, dans quel ordre, avec quelles émotions.

#### Étape 4 : Vérification de persistance

Après insertion, le client vérifie que la ligne a bien été persistée en base (requête de contrôle immédiate, lignes ~1094–1114 de `VisitorView.tsx`). Cette double vérification garantit l'intégrité des données dans un contexte où le visiteur peut être sur un réseau mobile instable.

### 5.3. Structure de données et richesse qualitative

#### Table `emotions`

Le catalogue d'émotions est une table de référence multilingue :


| Colonne                    | Rôle                       |
| -------------------------- | -------------------------- |
| `id`                       | Identifiant unique         |
| `name_emotion`             | Libellé français canonique |
| `Emotion_M` / `Emotion_F`  | Formes genrées françaises  |
| `name_emotion_en/de/es/it` | Traductions                |
| `icone_emotion`            | Icône affichée au visiteur |


Ce catalogue est **éditable** par l'administrateur et peut être adapté au vocabulaire émotionnel propre à une exposition ou une institution.

#### Table `visitor_feedback`

Chaque ligne constitue un **témoignage émotionnel structuré**, horodaté, géolocalisé dans le graphe organisationnel (agence → exposition → œuvre → visiteur). La juxtaposition de `emotion_id` (catégorie qualitative) et `heart_rating` (intensité quantitative) offre une **double granularité** rarement disponible dans les outils de mesure culturelle.

#### Table `visitor_expo_visits`

Les sessions de visite (`visitor_expo_visits`) enregistrent l'entrée et la sortie du visiteur dans une exposition (`entered_at`, `ended_at`, `status`, `entry_source`). Couplées aux feedbacks via `visit_id`, elles permettent de calculer la **durée de visite**, le **nombre d'œuvres vues** et le **parcours séquentiel**.

### 5.4. Valeur ajoutée pour l'institution : de l'émotion à la statistique

#### Agrégation émotionnelle

La page Statistiques (`src/pages/Statistics.tsx`, ~2 550 lignes) interroge `visitor_feedback` pour produire :

- la **répartition des émotions** par exposition, par œuvre, par période (`feedbackCountsByEmotionId`) ;
- le **nombre de visiteurs uniques** ayant exprimé un feedback (`uniqueVisitorsTotal`) ;
- la **moyenne des cœurs** (`averageHearts`) ;
- le **classement des œuvres** par nombre de visites ou par note moyenne ;
- des **séries temporelles** (horaires, hebdomadaires) de fréquentation émotionnelle.

Ces agrégats sont filtrés par périmètre organisationnel (`useDataScope()` : agence, exposition, artiste) et par plage de dates d'exposition.

#### Corrélation persona / émotion (potentiel analytique)

Bien que la table `visitor_feedback` n'enregistre pas directement le persona utilisé au moment du feedback, le système dispose de tous les éléments pour établir cette corrélation :

- `visitors.persona_defaut` : persona préféré du visiteur ;
- `visitor_expo_visits` : session de visite ;
- `visitor_feedback.visit_id` : lien feedback ↔ session ;
- les logs d'interaction et la chronologie des pages visitées.

Cette architecture permet, par analyse croisée, de répondre à des questions du type : 

- *« Les visiteurs qui choisissent le persona "Enfant" expriment-ils davantage l'émotion "Émerveillement" ? »* ou 
- *« Le persona "Expert" génère-t-il des notes de cœurs plus élevées sur les œuvres abstraites ? »*

#### Rapports exportables

Les statistiques sont exportables en PDF (`statisticsBrowserPdf.ts`, `StatisticsReportView.tsx`), incluant une **lettre au curator** synthétisant les résultats de l'exposition. L'institution dispose ainsi d'un **document de bilan** fondé sur des données émotionnelles réelles, et non sur des estimations de fréquentation.

Un rapport identique centré sur toutes les oeuvres exposées par un artiste peut aussi être édité (en cours ou en fin d'exposition) : si l'organisateur a saisi l'adresse e-mail de l'artiste, ce rapport peut directement lui être adressé.

### 5.5. Boucle de rétroaction (feedback loop)

Le système AIMEDIArt implémente une **boucle de rétroaction** entre la réception du public et la production de contenus :

```
┌─────────────────────────────────────────────────────────────┐
│                    BOUCLE DE RÉTROACTION AIMEDIArt           │
│                                                             │
│  1. PRODUCTION                                              │
│     Matériau source → IA → 8 personas × 5 langues → audio  │
│                          │                                  │
│  2. DIFFUSION                                             │
│     QR → visiteur → choix persona → lecture + écoute       │
│                          │                                  │
│  3. COLLECTE                                              │
│     Émotion + cœurs + commentaire → visitor_feedback       │
│                          │                                  │
│  4. ANALYSE                                               │
│     Agrégation → statistiques → rapport curator              │
│                          │                                  │
│  5. ITÉRATION                                             │
│     Ajustement prompts / personas / textes → retour à 1     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

À l'étape 5, le curator peut :

- **régénérer** les textes d'une œuvre spécifique si les commentaires libres (`comment_text`) révèlent des incompréhensions ;
- **comparer** les performances émotionnelles entre personas pour une même œuvre et **prioriser** le persona le plus efficace ;
- **ajuster la scénographie** en identifiant les œuvres « froides » (peu de feedback, émotions neutres) par rapport aux œuvres « chaudes ».

Cette boucle transforme AIMEDIArt d'un outil de **production** en un outil d'**amélioration continue** de la médiation — une capacité absente des audioguides traditionnels et des pages web statiques.

### 5.6. Différenciation par rapport aux parcours visiteurs traditionnels


| Critère               | Parcours traditionnel                 | AIMEDIArt                                                   |
| --------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Moment de collecte    | Fin de visite (enquête) ou jamais     | Immédiat, par œuvre                                         |
| Type de donnée        | Satisfaction globale (échelle Likert) | Émotion catégorisée + intensité + commentaire               |
| Lien avec l'œuvre     | Aucun (donnée agrégée)                | Chaque feedback rattaché à une œuvre, une expo, une session |
| Obligation de compte  | Souvent requis                        | Identité légère, anonymat possible                          |
| Exploitation          | Rapport statistique générique         | Corrélation œuvre × émotion × persona, export curator       |
| Boucle d'amélioration | Manuelle, anecdote                    | Itérative, data-driven                                      |


---

## 6. Statistiques, rapports et aide à la décision curatoriale

### 6.1. Intention

Les statistiques d'AIMEDIArt ne sont pas un module accessoire : elles constituent le **retour d'information** qui justifie l'investissement de l'organisateur dans la médiation numérique. Sans visibilité sur la réception du public, la médiation reste un acte de foi ; avec des données structurées, elle devient un **acte mesurable et améliorable**.

### 6.2. Sources de données


| Source                | Données exploitées                                                 |
| --------------------- | ------------------------------------------------------------------ |
| `visitor_feedback`    | Émotions, cœurs, commentaires, horodatage, œuvre, visiteur         |
| `visitor_expo_visits` | Sessions de visite, durée, source d'entrée                         |
| `artworks`            | Statut actif, rattachement artiste/exposition                      |
| `daily_stats`         | Agrégats quotidiens (visites, moyenne cœurs) par agence/œuvre/expo |


L'hypothèse de comptage retenue (documentée dans `migration_79_pricing_billing_schema.sql`) est : **une ligne `visitor_feedback` = une visite comptabilisée**. Cette hypothèse est cohérente avec le mécanisme de feedback obligatoire : chaque visiteur ayant consulté une œuvre y laisse nécessairement une trace.

### 6.3. Indicateurs produits

La page `Statistics.tsx` calcule et affiche :

- **Volume** : nombre total de feedbacks, visiteurs uniques, œuvres actives ;
- **Qualité émotionnelle** : répartition par émotion, moyenne des cœurs ;
- **Performance par œuvre** : classement par visites et par note moyenne ;
- **Temporalité** : séries horaires et hebdomadaires (graphiques Recharts `BarChart`) ;
- **Filtrage** : par agence, exposition, artiste, plage de dates.

Le tableau de bord (`useDashboardProfile.ts`) fournit des KPIs synthétiques (Key Performance Indicator = Indicateur Clé de Performance) : nombre d'expositions, d'œuvres, de visiteurs du mois.

### 6.4. Export et communication

Les rapports sont exportables en PDF navigateur (`statisticsBrowserPdf.ts`) avec mise en page adaptée à l'impression. La vue `StatisticsReportView.tsx` inclut un e-mail **au commissaire** personnalisable, transformant les données brutes en un document de synthèse communicable aux financeurs, partenaires et équipes.

---

## 7. Parcours visiteur et médiation interactive

### 7.1. Intention

Le parcours visiteur est le **point de contact** entre la technologie AIMEDIArt et le public. Il doit être immédiat (scan QR → lecture), personnalisé (choix du persona), accessible (multilingue, audio) et engageant (feedback émotionnel). Chaque friction supprimée — pas d'application à installer, pas de compte obligatoire, pas de formulaire marketing — est un gain pour l'expérience muséale.

### 7.2. Étapes du parcours


| Étape           | Composant                                     | Description                                                                |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Entrée       | `ArtworkEntryGate.tsx`                        | Vérification identité visiteur ; redirection vers onboarding si nécessaire |
| 2. Accueil expo | `VisitorWelcome.tsx`                          | Choix pseudo, avatar, langue ; inscription légère ou OAuth                 |
| 3. Scan œuvre   | `WorkScanner.tsx`, `qrNativeCameraScanner.ts` | Lecture QR via caméra native ou `html5-qrcode`                             |
| 4. Page œuvre   | `VisitorView.tsx`                             | Carousel personas, texte markdown, lecteur audio                           |
| 5. Feedback     | `VisitorView.tsx`                             | Émotion + cœurs + commentaire (obligatoire)                                |
| 6. Navigation   | `visitorExpoFetch.ts`                         | Œuvre suivante (séquence linéaire ou par artiste)                          |


### 7.3. Identité visiteur anonyme

AIMEDIArt permet une médiation riche **sans compte utilisateur**. Le visiteur est identifié par :

- un **UUID client** persistant (`localStorage`, `visitorIdentity.ts`) ;
- un **pseudo poétique** et un **avatar** choisis parmi un catalogue multilingue (`visitorAvatarPool.ts`).

Cette identité légère suffit pour personnaliser l'expérience (persona mémorisé, historique de visites) tout en respectant la vie privée.

### 7.4. Cartels imprimables et pont physique-numérique

Le module cartel (`cartelPdfRenderer.ts`) produit des documents PDF imprimables intégrant :

- le visuel de l'œuvre ;
- un extrait de médiation ;
- un **code QR** à haute correction d'erreur (niveau H, 1024 pixels) ;
- le logo bloc AIMEDIArt ;
- des consignes de navigation adaptées au mode de visite de l'exposition.

Ce pont physique-numérique est essentiel : la médiation numérique ne remplace pas le cartel mural, elle l'**augmente** en lui donnant une porte d'entrée vers l'expérience interactive.

---

## 8. Procédés différenciants et résolution des problèmes sectoriels

### 8.1. Procédé 1 — Médiation génératrice multi-personas

**Problème sectoriel :** Un médiateur humain produit un discours unique par œuvre, reflétant sa propre sensibilité et son expertise. Adapter ce discours à huit publics différents nécessiterait huit rédactions manuelles par œuvre — un travail prohibitif pour une exposition de taille moyenne.

**Solution AIMEDIArt :** À partir d'un matériau source unique, le système génère automatiquement huit registres de discours distincts, stockés de manière structurée et activables par le visiteur en temps réel. Le curator conserve le contrôle éditorial sur le matériau source et peut modifier chaque persona individuellement.

**Innovation :** La médiation n'est plus un texte figé mais une **palette de voix** que le visiteur explore.

### 8.2. Procédé 2 — Chaîne IA bout-en-bout

**Problème sectoriel :** Produire une exposition médiable nécessite habituellement : un photographe, un rédacteur, un traducteur, un studio d'enregistrement, un graphiste pour les QR codes, et un outil de statistiques — six métiers, six outils, six délais.

**Solution AIMEDIArt :** Une chaîne automatisée image → analyse → texte multi-personas → audio multi-voix → cartel QR → collecte feedback → statistiques, intégrée dans une seule plateforme.

**Innovation :** Réduction du temps de production d'une exposition médiable de plusieurs semaines à quelques heures.

### 8.3. Procédé 3 — Feedback émotionnel structuré et obligatoire

**Problème sectoriel :** Les institutions culturelles manquent de données qualitatives sur la réception de leurs œuvres. Les enquêtes de satisfaction capturent une opinion globale, déconnectée de l'expérience œuvre par œuvre.

**Solution AIMEDIArt :** Chaque visiteur exprime une émotion catégorisée et une notation par cœurs avant de pouvoir quitter l'œuvre. Les données sont structurées, horodatées et rattachées au graphe organisationnel.

**Innovation :** Transformation du visiteur silencieux en contributeur de médiation, sans effort perçu comme une enquête.

### 8.4. Procédé 4 — Persona mémorisé cross-exposition

**Problème sectoriel :** Un visiteur régulier (abonné de musée, classe scolaire) doit re-sélectionner ses préférences à chaque visite, sur chaque appareil.

**Solution AIMEDIArt :** Le persona de lecture préféré est mémorisé côté serveur (`visitors.persona_defaut`, RPC `set_visitor_persona_defaut` / `get_visitor_persona_defaut`) et restauré automatiquement.

**Innovation :** Continuité d'expérience personnalisée pour les publics fidèles.

### 8.5. Procédé 5 — Garde-fou audio en exposition intérieure

**Problème sectoriel :** Les audioguides en salle posent des problèmes de nuisance sonore et de gestion de groupe, conduisant certaines institutions à les interdire.

**Solution AIMEDIArt :** Détection du contexte intérieur, consentement casque, heartbeat (détection) de présence audio, bannissement administrateur provisoire en temps réel, pause automatique du TTS.

**Innovation :** Audioguide compatible avec les contraintes réelles des salles d'exposition.

### 8.6. Procédé 6 — Exposition connectée hors réseau

**Problème sectoriel :** De nombreux sites patrimoniaux (châteaux, grottes, caves, sites ruraux) ne disposent pas de connectivité fiable pour une médiation en ligne.

**Solution AIMEDIArt :** Offre commerciale dédiée (`connected-expo-quote`, section connectivité de la vitrine) avec contenu pré-généré et stocké localement.

**Innovation :** Médiation numérique déployable hors connexion permanente.

### 8.7. Procédé 7 — Gouvernance IA intégrée

**Problème sectoriel :** Les institutions culturelles n'ont ni l'expertise ni les outils pour maîtriser les coûts et les risques des traitements IA.

**Solution AIMEDIArt :** Garde-fou préventif, journalisation unifiée, estimation de coûts, sélection de modèle globale, matrice de sécurité RBAC pour les prompts.

**Innovation :** IA gouvernée, adaptée au contexte institutionnel.

---

## 9. Inventaire probatoire des éléments logiciels


| Domaine                  | Fichiers et tables de référence                                                 |
| ------------------------ | ------------------------------------------------------------------------------- |
| Architecture & routes    | `src/App.tsx`, `src/bootstrap.tsx`                                              |
| Authentification & rôles | `src/hooks/useAuthUser.ts`, `src/lib/authUser.ts`, `public.agency_users`        |
| Médiation IA             | `supabase/functions/generate-mediation/`, `src/services/mediationService.ts`    |
| Analyse image            | `supabase/functions/analyze-artwork-image/`, `artworks.artwork_source_material` |
| Personas                 | `src/lib/mediationStyleCodes.ts`, `public.prompt_style`                         |
| Audio / TTS              | `src/services/audioService.ts`, `public.audio_files`                            |
| Jobs IA async            | `supabase/functions/ai-create-job/`, `public.ai_jobs`                           |
| Feedback émotionnel      | `src/pages/VisitorView.tsx`, `public.visitor_feedback`, `public.emotions`       |
| Sessions visite          | `public.visitor_expo_visits`, `src/lib/visitorExpoVisit.ts`                     |
| Persona visiteur         | `src/lib/visitorDefaultPersona.ts`, `public.visitors.persona_defaut`            |
| Statistiques             | `src/pages/Statistics.tsx`, `src/lib/statisticsBrowserPdf.ts`                   |
| Cartels PDF              | `src/lib/cartelPdfRenderer.ts`, `src/lib/qrCodeScanFriendly.ts`                 |
| Tarification             | `supabase/migrations/migration_79_pricing_billing_schema.sql`                   |
| Mode veille              | `supabase/migrations/20260617120000_organisation_standby_request.sql`           |
| Garde-fou IA             | `supabase/functions/_shared/aiGuard.ts`, `public.ai_usage_logs`                 |
| Signe distinctif         | `aimediart-logo-block.jpeg`, `src/lib/pdfHeaderLogoBlock.ts`                    |
| Vitrine publique         | `src/pages/PublicHome.tsx`                                                      |


---

## 10. Déclaration de paternité

Le présent dossier décrit l'état technique et fonctionnel de la plateforme **AIMEDIArt** telle qu'implémentée dans le dépôt logiciel associé à cette enveloppe e-Soleau.

L'ensemble des procédés, structures de données, chaînes de traitement par intelligence artificielle, interfaces utilisateur, workflows de médiation interactive, mécanismes de collecte émotionnelle et éléments graphiques décrits ci-dessus résultent du travail de conception, de développement et d'expérimentation de l'éditeur de la plateforme AIMEDIArt.

Le signe distinctif `aimediart-logo-block.jpeg` joint au présent dépôt constitue l'expression graphique de l'identité du service et est utilisé de manière cohérente sur l'ensemble des supports numériques et imprimables produits par la plateforme.

---

*Fin du dossier de synthèse — AIMEDIArt, juin 2026.*
*Document établi à partir de l'analyse du code source applicatif et du signe distinctif annexé.*
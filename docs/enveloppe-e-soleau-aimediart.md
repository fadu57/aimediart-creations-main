---

# Page de Garde

---

# DOSSIER DE SYNTHÈSE TECHNIQUE ET FONCTIONNELLE

### Projet d'application SaaS : AIMEDIArt

**Déposant :** DUPONT Fabien

**Date :** 20 juin 2026

**Objet :** Enveloppe e-Soleau (INPI) — Preuve d'antériorité

---

# DOSSIER DE SYNTHÈSE TECHNIQUE ET FONCTIONNELLE

## Enveloppe e-Soleau — Plateforme AIMEDIArt

---


| Référence                                   | Détail                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Dénomination du service**                 | AIMEDIArt (domaine : AIMEDIArt.com)                                                              |
| **Nature juridique du dépôt**               | Description technique destinée à l'établissement d'une preuve de date (enveloppe e-Soleau, INPI) |
| **Signe distinctif joint**                  | aimediart-logo-block.jpeg                                                                        |
| **Support logiciel de référence**           | Dépôt source de l'application AIMEDIArt                                                          |
| **Date de constitution du présent dossier** | 18 juin 2026                                                                                     |
| **Rédaction**                               | Dossier de synthèse — dépôt de propriété intellectuelle                                          |


---

## AVERTISSEMENT MÉTHODOLOGIQUE

Le présent document constitue une **description détaillée de l'état de l'art tel qu'incarné par la plateforme AIMEDIArt** au moment de sa rédaction. Il s'adresse en priorité à un examinateur, à un conseil en propriété intellectuelle ou à tout tiers non spécialiste du développement logiciel, en mettant l'accent sur la **richesse fonctionnelle**, la **chaîne de traitement des données** et le **caractère innovant** du système.

Ce dossier **ne constitue pas** une demande de brevet, une déclaration de création au sens du Code de la propriété intellectuelle, ni un avis juridique. Il accompagne une démarche de preuve d'antériorité.

Les éléments techniques permettant de vérifier chaque affirmation (modules logiciels, structures de données, migrations) sont regroupés en **notes de bas de page** et en **annexe probatoire**, afin de préserver la lisibilité du corps du texte tout en conservant la valeur probante du dépôt.

---

## SOMMAIRE

1. [Présentation générale et finalité du système](#1-présentation-générale-et-finalité-du-système)
2. [Identité visuelle et analyse sémiologique du signe](#2-identité-visuelle-et-analyse-sémiologique-du-signe)
3. [Architecture fonctionnelle de la plateforme](#3-architecture-fonctionnelle-de-la-plateforme)
4. [Modules d'intelligence artificielle](#4-modules-dintelligence-artificielle)
5. [Médiation par l'émotion et analyse comportementale](#5-médiation-par-lémotion-et-analyse-comportementale)
6. [Statistiques, rapports et aide à la décision curatoriale](#6-statistiques-rapports-et-aide-à-la-décision-curatoriale)
7. [Parcours visiteur et médiation interactive](#7-parcours-visiteur-et-médiation-interactive)
8. [Procédés différenciants et résolution des problèmes sectoriels](#8-procédés-différenciants-et-résolution-des-problèmes-sectoriels)
9. [Déclaration de paternité](#9-déclaration-de-paternité)
10. [Annexe probatoire](#annexe-a--références-techniques-et-inventaire-des-éléments-logiciels)

---

## 1. Présentation générale et finalité du système

### 1.1. Contexte sectoriel

La médiation culturelle traditionnelle repose sur un ensemble d'outils éprouvés mais fragmentés : cartels muraux, dossiers pédagogiques, audioguides enregistrés en studio, interventions de médiateurs humains, livrets de salle et, plus récemment, codes QR redirigeant vers des pages web statiques. Chacun de ces dispositifs répond à une partie du besoin — informer, émouvoir, mesurer la fréquentation — mais rarement à l'ensemble du parcours : **produire**, **personnaliser**, **diffuser**, **écouter** et **comprendre** la réception d'une œuvre par des publics hétérogènes.

AIMEDIArt naît de la conviction que la médiation contemporaine doit intégrer trois dimensions jusqu'ici disjointes :

- la **production de contenus** (textes et voix) à l'échelle d'une exposition entière ;
- la **personnalisation** de l'expérience de lecture selon le profil du visiteur ;
- la **mesure qualitative** de la réception, au plus près du moment de contemplation.

La plateforme se présente comme un **logiciel en mode SaaS** (service accessible en ligne par abonnement), destiné aux organisations culturelles — galeries, musées, institutions, agences, commissaires indépendants — et ouvert gratuitement aux visiteurs finaux via le scan d'un code QR apposé sur l'œuvre ou sur un cartel imprimé.

### 1.2. Finalité fonctionnelle

AIMEDIArt permet à un organisateur d'exposition de :

1. **Cataloguer** ses œuvres, artistes et expositions dans un espace sécurisé, partagé entre plusieurs collaborateurs ;
2. **Analyser** photographiquement une œuvre et en extraire un matériau source structuré ;
3. **Générer automatiquement** huit registres de discours de médiation (personas) en cinq langues ;
4. **Produire des audioguides** multivoix (féminine et masculine) pour chaque combinaison langue × persona ;
5. **Imprimer des cartels** intégrant un code QR optimisé pour la lecture en salle ;
6. **Accueillir les visiteurs** sur une interface mobile dédiée, sans installation préalable ;
7. **Recueillir** leur émotion, leur notation par cœurs et leurs commentaires au sortir de chaque œuvre ;
8. **Visualiser et exporter** des statistiques agrégées pour ajuster la scénographie et les contenus ;
9. **Cartographier l'origine géographique** des visiteurs et des organisateurs ayant interagi avec l'exposition.

Pour le visiteur final, AIMEDIArt transforme le scan d'un code QR en un **parcours de médiation personnalisé** : choix d'un ton de lecture, écoute optionnelle, expression du ressenti — le tout dans la continuité d'une déambulation muséale, sans rupture vers un formulaire marketing ou une application à installer.

### 1.3. Positionnement par rapport à l'état de l'art


| Dimension                      | Pratique traditionnelle                | AIMEDIArt                                                               |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| Production des textes          | Rédaction manuelle, une version unique | Génération assistée par IA de huit personas × cinq langues              |
| Audio                          | Studio d'enregistrement, voix unique   | Synthèse vocale automatisée, voix féminine et masculine par persona     |
| Personnalisation visiteur      | Audioguide linéaire ou page web fixe   | Choix du registre de lecture en temps réel                              |
| Mesure d'audience              | Compteur de passages, enquête différée | **Feedback émotionnel immédiat, structuré et obligatoire**              |
| Origine géographique du public | Inconnue ou estimée globalement        | **Cartographie des visiteurs et organisateurs** (adresse, CP/ville, IP) |
| Boucle d'amélioration          | Anecdotes, retours informels           | **Statistiques corrélées œuvre × émotion × persona**                    |
| Déploiement                    | Multiples outils non intégrés          | **Chaîne unifiée** image → texte → audio → QR → statistiques            |


---

## 2. Identité visuelle et analyse sémiologique du signe

### 2.1. Description formelle du signe joint

Le fichier **aimediart-logo-block.jpeg**, annexé au présent dépôt e-Soleau, constitue le signe distinctif de la plateforme. Il se compose de trois éléments graphiques disposés horizontalement sur fond blanc :

1. **Un pictogramme** : un cœur stylisé en contour blanc, inscrit dans un carré aux angles fortement arrondis, rempli d'un rouge vif uniforme ;
2. **Un logotype** : la mention « AIMEDIArt.com », en caractères sans empattement, graisse élevée, chromie rouge identique au pictogramme — les lettres « AIMEDIA » en capitales, « rt.com » en minuscules ;
3. **Une baseline** : la mention « Art-mediation with AI », en italique, taille inférieure, même chromie rouge.

La couleur distinctive est un **rouge corail vif** (référence chromatique principale : #E63946). Ce rouge est employé de manière systématique sur l'ensemble des supports numériques et imprimables produits par la plateforme : boutons d'action, liens, cartels, interface visiteur et pictogramme cœur.

### 2.2. Analyse sémiologique

#### Le cœur : médiation par l'émotion

Le cœur est l'un des symboles universels les plus immédiatement reconnaissables de l'**affect**, de l'**engagement** et de l'**appréciation**. Dans le contexte des arts visuels, il renvoie directement au geste central de la plateforme : le visiteur exprime son degré d'attachement à une œuvre en lui attribuant une note symbolique, matérialisée par l'icône cœur et accompagnée d'une animation visuelle de célébration.

Le choix du cœur en **contour blanc** sur fond rouge — plutôt qu'un cœur plein — suggère une **émotion contenue et réfléchie**, invitant à la contemplation plutôt qu'à l'effusion immédiate. Il évoque le geste du visiteur qui, devant l'œuvre, **prend le temps** de formuler son ressenti avant de l'exprimer. Ce pictogramme n'est donc pas un simple ornement commercial : il condense la philosophie d'AIMEDIArt, selon laquelle la médiation culturelle authentique passe par la reconnaissance et la structuration des émotions du public.

#### Le rouge : intensité et présence

Le rouge employé n'est ni un rouge institutionnel sombre, ni un rouge d'alerte. C'est un rouge **énergique, chaleureux et contemporain**, qui positionne AIMEDIArt comme un acteur **vivant** de la médiation, en rupture avec l'image parfois froide ou intimidante des institutions culturelles. Ce rouge assure également une **forte visibilité** sur les cartels imprimés, les écrans mobiles des visiteurs et la vitrine commerciale — un impératif pratique dans un environnement de salle d'exposition où l'attention est fragmentée.

#### Le logotype « AIMEDIArt » : hybridation médiation et intelligence artificielle

La décomposition du logotype est significative sur le plan sémiotique :

- **AI** en capitales initiales : renvoie explicitement à l'**intelligence artificielle**, socle technologique du produit ;
- **MEDIA** : renvoie aux **médias** de diffusion (texte, audio, QR, écran) ;
- **Art** en minuscules dans « AIMEDIArt » : ancrage dans le domaine **artistique**, volontairement intégré au mot composé pour signifier que l'art n'est pas le contenu d'un média mais l'**objet même** de la médiation.

Le logotype peut également se lire par association phonétique et sémantique : le verbe **« aimer »** et le mot **« médiation »** se superposent dans la graphie « AIMEDIA », suggérant une médiation fondée sur l'affect et l'engagement personnel du visiteur.

Le suffixe « .com » ancre le service dans l'économie numérique et le modèle d'abonnement en ligne, distinct d'un outil éditorial ou d'une publication imprimée.

#### La baseline « Art-mediation with AI »

Cette mention explicite la **proposition de valeur** en une seule phrase : la médiation artistique assistée par l'intelligence artificielle. L'usage de l'anglais pour la baseline, alors que le service est multilingue, positionne AIMEDIArt sur un marché international de la médiation culturelle numérique.

Le trait d'union dans « Art-mediation » unit deux concepts souvent séparés dans le discours institutionnel : l'**art** (objet de contemplation) et la **médiation** (acte de transmission). AIMEDIArt postule que les deux sont indissociables et que l'intelligence artificielle peut servir de **pont** entre eux sans les réduire l'un à l'autre.

#### Cohérence signe / produit

Le signe distinctif n'est pas décoratif : il est **fonctionnellement cohérent** avec l'architecture du produit. Le cœur renvoie au recueil émotionnel ; le rouge à l'engagement visiteur ; « AI » aux modules de génération ; « Art-mediation » au cœur métier. Cette cohérence sémiotique renforce la **distinctivité** du signe et son aptitude à identifier le service dans le secteur de la médiation culturelle numérique.[^1]

---

## 3. Architecture fonctionnelle de la plateforme

### 3.1. Intention architecturale

L'architecture d'AIMEDIArt répond à une contrainte double : d'une part, offrir une **expérience visiteur fluide** sur mobile, sans friction d'installation ; d'autre part, fournir aux organisateurs un **espace de gestion complet** couvrant la production de contenus, l'administration des expositions et l'analyse des retours du public.

Ces deux univers — visiteur anonyme et professionnel authentifié — coexistent dans une même application web, avec des parcours, des droits d'accès et des interfaces distincts. Le choix d'une application web accessible depuis n'importe quel navigateur mobile permet au visiteur d'accéder au service immédiatement après le scan d'un code QR, sans passage par un magasin d'applications. Pour l'organisateur, ce même accès web évite la maintenance de logiciels lourds et assure la mise à jour instantanée des fonctionnalités.

### 3.2. Les trois couches fonctionnelles

#### Couche d'interface (ce que voient les utilisateurs)

L'interface est organisée en trois espaces distincts :

- **La vitrine publique** : présentation commerciale du service, offres tarifaires, pages légales ;
- **Le parcours visiteur** : lecture d'œuvre, choix du persona, écoute audio, expression du ressenti ;
- **L'espace professionnel** : catalogue des œuvres, gestion des expositions, statistiques, paramètres et facturation.

L'interface est disponible en **cinq langues** : français, anglais, allemand, espagnol et italien.[^2]

#### Couche de données et de sécurité

Toutes les informations de la plateforme — œuvres, textes de médiation, fichiers audio, retours des visiteurs — sont stockées dans une base de données relationnelle sécurisée, hébergée sur une infrastructure cloud. L'accès aux données est strictement contrôlé : chaque utilisateur ne peut consulter et modifier que les informations relevant de son organisation.

La plateforme distingue **sept profils d'utilisateur**, du visiteur anonyme à l'administrateur global du service, chacun disposant de droits adaptés à son rôle : gestion d'une agence, curation d'une exposition, consultation des statistiques, ou simple parcours visiteur.[^3]

Les fichiers multimédias (photographies d'œuvres, audioguides, avatars) sont stockés dans un espace de fichiers dédié, distinct de la base de données textuelle.

#### Couche de traitement intelligent

Les opérations nécessitant des ressources de calcul importantes, des clés d'accès secrètes ou des appels à des services d'intelligence artificielle externes sont exécutées côté serveur, à l'abri du terminal du visiteur. Cette couche comprend notamment :

- l'analyse photographique des œuvres ;
- la génération des textes de médiation ;
- la synthèse vocale des audioguides ;
- l'inscription des visiteurs ;
- le contrôle des quotas de consommation des services d'IA ;
- la gestion des expositions en environnement à connectivité limitée.

Chaque appel à un service d'intelligence artificielle est précédé d'une **vérification préventive des quotas** et suivi d'une **journalisation** permettant le suivi des consommations et des coûts.[^4]

### 3.3. Flux de données global

Le parcours typique d'une exposition équipée AIMEDIArt peut être décrit en trois phases :

**Phase 1 — Préparation par l'organisateur**

L'organisateur téléverse la photographie d'une œuvre. Le système en extrait automatiquement une description structurée, puis génère les textes de médiation dans huit registres de discours et cinq langues. Il produit ensuite les fichiers audio correspondants et génère un cartel imprimable comportant un code QR. L'ensemble de ces contenus est stocké et associé à l'œuvre dans la base de données de l'organisation.

**Phase 2 — Visite par le public**

Le visiteur scanne le code QR depuis son téléphone. Il accède immédiatement à la page de médiation de l'œuvre, choisit le registre de lecture qui lui convient, lit le texte et peut l'écouter en audio. Avant de passer à l'œuvre suivante, il exprime son émotion, attribue une note par cœurs et peut laisser un commentaire libre. Ces données sont enregistrées et rattachées à l'œuvre, à l'exposition et au visiteur.

**Phase 3 — Analyse par l'institution**

L'organisateur consulte les statistiques agrégées : répartition des émotions, moyenne des cœurs, classement des œuvres, évolution dans le temps. Il peut exporter un rapport PDF destiné au commissaire, aux financeurs ou à l'artiste.

Ce **flux unique et intégré** constitue l'un des apports architecturaux majeurs d'AIMEDIArt par rapport à l'assemblage d'outils disparates habituellement employés dans le secteur.

### 3.4. Modèle économique et multi-organisations

La plateforme est structurée en **plans d'abonnement** (Étincelle, Atelier, Horizon, Rayonnement), adaptés à la taille et aux besoins des organisations culturelles. Chaque organisation cliente dispose de son propre espace isolé, avec des quotas d'œuvres, de visiteurs et de fonctionnalités d'intelligence artificielle selon le plan souscrit.

Un **mode veille** permet aux organisations de suspendre temporairement leur abonnement actif tout en conservant l'intégralité de leurs données, répondant au rythme saisonnier des expositions temporaires.[^5]

---

## 4. Modules d'intelligence artificielle

### 4.1. Intention générale

Les modules d'intelligence artificielle d'AIMEDIArt ne visent pas à remplacer le médiateur humain, mais à **augmenter sa capacité de production** et à **démultiplier les registres de discours** disponibles pour un même contenu curatoral. L'intelligence artificielle intervient à trois moments clés : l'analyse de l'image de l'œuvre, la génération des textes de médiation, et la synthèse vocale de ces textes.

Chaque intervention est **tracée, limitée et réversible** : le commissaire conserve le contrôle éditorial sur le matériau source et peut modifier, compléter ou supprimer tout texte généré avant sa mise à disposition du public.

### 4.2. Analyse visuelle de l'œuvre

#### Pourquoi

Avant de générer des textes de médiation, le système doit disposer d'une **description structurée** de l'œuvre. Dans la pratique traditionnelle, cette description est rédigée manuellement par le commissaire ou le médiateur — un travail chronophage, particulièrement lourd pour les expositions de grande envergure.

#### Comment

L'organisateur téléverse une photographie de l'œuvre dans son espace de gestion. Le système envoie cette image à un modèle d'analyse visuelle qui en extrait une description structurée : sujet représenté, technique employée, composition, palette chromatique, contexte historique ou artistique. Cette description est présentée au commissaire pour validation ou enrichissement avant d'être utilisée comme matériau source pour la génération des textes.

#### Bénéfice pour l'institution

Le commissaire dispose en quelques secondes d'un **premier jet analytique** qu'il peut enrichir de son expertise curatorale. Pour une exposition de cinquante œuvres, ce gain de temps est considérable par rapport à la rédaction manuelle de fiches descriptives.[^6]

### 4.3. Génération de médiation multi-personas

#### Pourquoi

Un même contenu curatoral doit pouvoir être **reformulé** pour des publics aux attentes et aux niveaux de lecture différents : un enfant de dix ans, un expert en histoire de l'art, un visiteur occasionnel, un public senior. Dans la médiation traditionnelle, produire huit versions distinctes d'un même discours pour une seule œuvre est un travail prohibitif.

#### Comment

AIMEDIArt encode cette diversité sous la forme de **huit personas** (registres de discours) :


| Persona    | Public visé                    |
| ---------- | ------------------------------ |
| Simple     | Vulgarisation accessible       |
| Poétique   | Registre littéraire, évocateur |
| Expert     | Discours curatoral, références |
| Senior     | Adaptation au public âgé       |
| Pote       | Ton conversationnel            |
| Conteur    | Narration, mise en récit       |
| Hip-hopeur | Culture contemporaine, urbaine |
| Enfant     | Jeune public                   |


À partir du matériau source validé, le système génère automatiquement un texte de médiation pour chaque persona, dans chaque langue configurée. Les textes sont stockés de manière structurée et peuvent être modifiés individuellement par le commissaire avant publication. En cas d'échec partiel lors de la génération, le système relance automatiquement les personas manquants, garantissant la complétude du corpus.[^7]

#### Bénéfice pour l'institution

Le commissaire obtient **huit versions distinctes** d'un même discours de médiation, prêtes à être proposées au visiteur, sans rédiger chaque version manuellement. Pour une exposition multilingue en cinq langues, cela représente jusqu'à **quarante textes par œuvre**, produits en quelques minutes — un volume de production inaccessible par les méthodes traditionnelles.

### 4.4. Synthèse vocale et audioguides

#### Pourquoi

La médiation culturelle ne se limite pas au texte écrit : l'**écoute** est un mode de réception fondamental, notamment pour les publics en situation de déplacement, de fatigue visuelle ou de handicap. Les audioguides traditionnels, enregistrés en studio avec une voix unique, ne permettent ni la personnalisation ni la diversité des registres de discours.

#### Comment

À partir des textes de médiation générés, le système produit automatiquement des fichiers audio pour chaque combinaison œuvre × langue × persona × voix (féminine ou masculine). Ces fichiers sont stockés et mis à disposition du visiteur, qui peut les écouter directement depuis son téléphone. Le système gère également une file de production concurrente, avec relance automatique en cas d'échec et possibilité d'annulation par l'organisateur.[^8]

#### Bénéfice pour l'institution

Une exposition de trente œuvres, huit personas, cinq langues et deux voix représente théoriquement **2 400 fichiers audio**. AIMEDIArt automatise cette production, rendant économiquement viable une **médiation vocale riche et personnalisée** que seuls les grands musées peuvent aujourd'hui se offrir via des studios d'enregistrement professionnels.

### 4.5. Gouvernance et maîtrise des coûts

Chaque appel à un service d'intelligence artificielle est soumis à un **garde-fou préventif** : le système vérifie les quotas de consommation avant d'autoriser l'exécution. Les consommations sont journalisées de manière unifiée, et une interface d'administration permet le suivi en temps réel des coûts et des volumes traités.

Cette **gouvernance intégrée** est rare dans les outils de médiation culturelle, habituellement dépourvus de toute visibilité sur les coûts des traitements par intelligence artificielle — un enjeu majeur pour les institutions culturelles qui découvrent ces technologies.[^9]

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

1. **Immédiateté** : le retour est recueilli au sortir de l'œuvre, avant toute navigation vers l'œuvre suivante ;
2. **Non-intrusivité** : le visiteur n'a pas besoin de créer un compte ; une identité légère (pseudo, avatar) suffit ;
3. **Structuration** : l'émotion n'est pas un commentaire libre non catégorisable, mais une sélection dans un catalogue référencé, complété par une notation par cœurs et un commentaire optionnel.

Le visiteur devient ainsi un **acteur de sa propre médiation** : en exprimant son ressenti, il contribue à la compréhension de la réception de l'œuvre, sans que cette contribution ne ressemble à une démarche marketing ou à une enquête institutionnelle.

### 5.2. Mécanisme fonctionnel de collecte

#### Étape 1 : Parcours de médiation

Le visiteur accède à l'œuvre via le scan d'un code QR. Il est accueilli par un **dispositif de choix du registre de lecture** lui permettant de sélectionner le ton de médiation qui lui convient : poétique, expert, enfant, etc. Il lit le texte correspondant, peut l'écouter en audio, et prend le temps de la contemplation.

Le registre de lecture choisi est **mémorisé** pour les visites ultérieures : le visiteur retrouve automatiquement son persona préféré lors de sa prochaine visite, y compris depuis un autre appareil s'il s'est identifié de manière légère.[^10]

#### Étape 2 : Écran de retour obligatoire

Lorsque le visiteur souhaite passer à l'œuvre suivante, le système vérifie qu'il a exprimé son ressenti. Si ce n'est pas le cas, la navigation est suspendue et l'écran de retour est présenté.

Cet écran propose trois niveaux d'expression :

1. **Sélection d'une émotion** : le visiteur choisit parmi un catalogue d'émotions référencées, affiché avec icône et libellé dans sa langue ;
2. **Notation par cœurs** : le visiteur attribue une note symbolique, matérialisée par des icônes cœur et accompagnée d'une animation visuelle de célébration ;
3. **Commentaire libre** (optionnel) : un champ texte permet d'ajouter une verbalisation personnelle.

#### Étape 3 : Enregistrement structuré

À la validation, le système enregistre un témoignage structuré associant :

- l'organisation et l'exposition concernées ;
- l'œuvre contemplée ;
- l'identifiant du visiteur ;
- l'émotion sélectionnée ;
- la notation par cœurs ;
- le commentaire libre, le cas échéant ;
- l'horodatage précis de la saisie ;
- la session de visite en cours, le cas échéant.

Chaque retour est ainsi **rattaché de manière indissociable** à une œuvre précise, un visiteur identifiable, une émotion catégorisée et une exposition. La liaison avec la session de visite permet de reconstituer le **parcours complet** d'un visiteur au sein d'une exposition : quelles œuvres il a vues, dans quel ordre, avec quelles émotions.[^11]

#### Étape 4 : Vérification de persistance

Après enregistrement, le système vérifie que les données ont bien été conservées. Cette double vérification garantit l'intégrité des informations dans un contexte où le visiteur peut être sur un réseau mobile instable — situation fréquente en salle d'exposition.

### 5.3. Richesse qualitative des données collectées

#### Le catalogue d'émotions

Les émotions proposées au visiteur sont définies dans un **catalogue de référence multilingue**, éditable par l'administrateur de la plateforme. Chaque émotion dispose d'un libellé dans les cinq langues supportées, de formes genrées en français, et d'une icône distinctive. Ce catalogue peut être adapté au vocabulaire émotionnel propre à une exposition ou une institution.

#### Le témoignage émotionnel structuré

Chaque retour constitue un **témoignage émotionnel structuré**, horodaté et situé dans le graphe organisationnel (organisation → exposition → œuvre → visiteur). La juxtaposition de l'émotion catégorisée (dimension qualitative) et de la notation par cœurs (dimension quantitative) offre une **double granularité** rarement disponible dans les outils de mesure culturelle.

#### Les sessions de visite

Le système enregistre l'entrée et la sortie du visiteur dans une exposition. Couplées aux retours émotionnels, ces sessions permettent de calculer la **durée de visite**, le **nombre d'œuvres consultées** et le **parcours séquentiel** suivi par chaque visiteur.

### 5.4. Valeur ajoutée pour l'institution : de l'émotion à la statistique

#### Agrégation émotionnelle

L'espace de statistiques de la plateforme transforme les témoignages individuels en **indicateurs agrégés** exploitables par l'institution :

- la **répartition des émotions** par exposition, par œuvre, par période ;
- le **nombre de visiteurs uniques** ayant exprimé un retour ;
- la **moyenne des cœurs** attribués ;
- le **classement des œuvres** par nombre de consultations ou par note moyenne ;
- des **séries temporelles** (horaires, hebdomadaires) de fréquentation émotionnelle.

Ces indicateurs sont filtrables par organisation, exposition, artiste et plage de dates, permettant une analyse fine adaptée au périmètre de responsabilité de chaque utilisateur professionnel.[^12]

#### Corrélation persona / émotion

Le système dispose de tous les éléments nécessaires pour établir des **corrélations entre le registre de lecture choisi et la réaction émotionnelle** du visiteur. En croisant le persona préféré mémorisé, la session de visite et les retours émotionnels, l'institution peut répondre à des questions du type :

- *Les visiteurs qui choisissent le registre « Enfant » expriment-ils davantage l'émotion « Émerveillement » ?*
- *Le registre « Expert » génère-t-il des notes de cœurs plus élevées sur les œuvres abstraites ?*

Cette capacité d'analyse croisée constitue un **outil d'aide à la décision curatorale** sans équivalent dans les dispositifs de médiation traditionnels.

#### Rapports exportables

Les statistiques sont exportables en document PDF, incluant une **lettre de synthèse au commissaire** personnalisable. L'institution dispose ainsi d'un **document de bilan** fondé sur des données émotionnelles réelles, communicable aux financeurs, partenaires et équipes — et non sur des estimations de fréquentation.

Un rapport centré sur l'ensemble des œuvres d'un artiste peut également être produit en cours ou en fin d'exposition. Si l'organisateur a renseigné l'adresse électronique de l'artiste, ce rapport peut lui être adressé directement, créant un **lien de valorisation** entre l'institution, l'artiste et la réception du public.

### 5.5. Boucle de rétroaction

AIMEDIArt implémente une **boucle de rétroaction** entre la réception du public et la production de contenus :

```
┌─────────────────────────────────────────────────────────────┐
│                 BOUCLE DE RÉTROACTION AIMEDIArt              │
│                                                             │
│  1. PRODUCTION                                              │
│     Matériau source → IA → 8 personas × 5 langues → audio │
│                          │                                  │
│  2. DIFFUSION                                             │
│     QR → visiteur → choix persona → lecture + écoute       │
│                          │                                  │
│  3. COLLECTE                                              │
│     Émotion + cœurs + commentaire → enregistrement          │
│                          │                                  │
│  4. ANALYSE                                               │
│     Agrégation → statistiques → cartographie géographique   │
│                  → rapport au commissaire                   │
│                          │                                  │
│  5. ITÉRATION                                             │
│     Ajustement des contenus → retour à l'étape 1            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

À l'étape d'itération, le commissaire peut :

- **régénérer** les textes d'une œuvre spécifique si les commentaires libres révèlent des incompréhensions ;
- **comparer** les performances émotionnelles entre personas pour une même œuvre et **prioriser** le registre le plus efficace ;
- **ajuster la scénographie** en identifiant les œuvres « froides » (peu de retours, émotions neutres) par rapport aux œuvres « chaudes ».

Cette boucle transforme AIMEDIArt d'un outil de **production** en un outil d'**amélioration continue** de la médiation — une capacité absente des audioguides traditionnels et des pages web statiques.

### 5.6. Différenciation par rapport aux parcours visiteurs traditionnels


| Critère               | Parcours traditionnel             | AIMEDIArt                                                     |
| --------------------- | --------------------------------- | ------------------------------------------------------------- |
| Moment de collecte    | Fin de visite (enquête) ou jamais | **Immédiat, par œuvre**                                       |
| Type de donnée        | Satisfaction globale              | **Émotion catégorisée + intensité + commentaire**             |
| Lien avec l'œuvre     | Aucun (donnée agrégée)            | **Chaque retour rattaché à une œuvre, une expo, une session** |
| Obligation de compte  | Souvent requis                    | Identité légère, anonymat possible                            |
| Exploitation          | Rapport statistique générique     | **Corrélation œuvre × émotion × persona**                     |
| Boucle d'amélioration | Manuelle, anecdotique             | **Itérative, fondée sur les données**                         |


---

## 6. Statistiques, rapports et aide à la décision curatoriale

### 6.1. Intention

Les statistiques d'AIMEDIArt ne sont pas un module accessoire : elles constituent le **retour d'information** qui justifie l'investissement de l'organisateur dans la médiation numérique. Sans visibilité sur la réception du public, la médiation reste un acte de foi ; avec des données structurées, elle devient un **acte mesurable et améliorable**.

### 6.2. Sources d'information

Le module statistique s'appuie sur **cinq familles de données** :


| Source                            | Informations exploitées                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| Retours émotionnels des visiteurs | Émotions, cœurs, commentaires, horodatage, œuvre, visiteur         |
| Sessions de visite                | Durée, source d'entrée, parcours                                   |
| Catalogue des œuvres              | Statut actif, rattachement artiste et exposition                   |
| Agrégats quotidiens               | Visites et moyenne des cœurs par organisation, œuvre et exposition |
| Profils et visiteurs (géographie) | Adresse postale, complément, ville, code postal, pays, adresse IP  |


Le principe de comptage retenu est le suivant : **chaque retour émotionnel enregistré correspond à une visite comptabilisée**. Ce principe est cohérent avec le mécanisme de retour obligatoire : chaque visiteur ayant consulté une œuvre y laisse nécessairement une trace mesurable.[^13]

### 6.3. Indicateurs produits

L'espace statistiques calcule et affiche :

- **Volume** : nombre total de retours, visiteurs uniques, œuvres actives ;
- **Qualité émotionnelle** : répartition par émotion, moyenne des cœurs ;
- **Performance par œuvre** : classement par visites et par note moyenne ;
- **Temporalité** : évolution horaire et hebdomadaire de la fréquentation émotionnelle ;
- **Filtrage** : par organisation, exposition, artiste, plage de dates ;
- **Géographie** : origine des participants sur carte interactive, avec distinction visiteurs / organisateurs.

Le tableau de bord principal fournit des **indicateurs synthétiques** : nombre d'expositions, d'œuvres et de visiteurs du mois en cours.[^14]

### 6.5. Origine géographique des visiteurs et des organisateurs

Au-delà des agrégats quantitatifs, AIMEDIArt propose une **vue cartographique de l'origine géographique** des personnes ayant interagi avec une exposition : visiteurs ayant laissé un retour émotionnel ou parcouru l'exposition, et organisateurs enregistrés dans la plateforme (profils authentifiés rattachés à l'organisation).

#### 6.5.1. Intention curatoriale

Cette fonctionnalité répond à un besoin rarement couvert par les outils de médiation culturelle : savoir **d'où vient le public**, non seulement combien il est venu. Pour une institution recevant des financements territoriaux, une exposition itinérante ou une galerie souhaitant mesurer son rayonnement au-delà du quartier immédiat, la cartographie des participants apporte une **dimension spatiale** aux statistiques de réception.

#### 6.5.2. Sources de localisation

Le système ne repose pas sur une géolocalisation GPS intrusive du téléphone du visiteur. Il **reconstitue une position** à partir de données déjà collectées dans le cadre du parcours ou de la fiche utilisateur, selon une cascade de sources :

1. **Adresse postale structurée** : adresse postale, complément, code postal, ville et pays — renseignés dans la fiche profil ou complétés lors de l'inscription ;
2. **Géocodage d'adresse** : pour la France, interrogation de l'API publique **Base Adresse Nationale** (data.gouv.fr) ; pour les autres pays, service de géocodage ouvert (Nominatim / OpenStreetMap) ;
3. **Repli sur l'adresse IP** : lorsque l'adresse postale est absente, utilisation de l'adresse IP enregistrée à l'inscription ou à la session, géolocalisée via un service IP→coordonnées ;
4. **Fusion profil / visiteur** : pour un visiteur authentifié, les données de la table `profiles` (source de vérité pour les organisateurs) sont prioritaires sur celles de la table `visitors`, afin d'éviter l'écrasement de la ville ou du code postal.

Les coordonnées calculées sont **mises en cache** localement et peuvent être recalculées à la demande par l'organisateur (« Recalculer la géolocalisation »).

#### 6.5.3. Présentation et interaction

La section statistiques **« Origine géographique des visiteurs et des organisateurs »** comprend :

- une **carte interactive** (fond OpenStreetMap, bibliothèque Leaflet) avec marqueurs positionnés sur les coordonnées calculées ;
- une **double codification visuelle** : marqueur bleu pour les visiteurs, marqueur rouge pour les organisateurs (profils enregistrés) ;
- des **cases à cocher** permettant d'afficher ou masquer chaque catégorie sur la carte, sans rechargement destructif de la vue ;
- un **tableau récapitulatif** listant chaque participant (avatar, pseudo, ville, source de géolocalisation) ;
- un **popup au clic** sur un marqueur affichant : prénom et nom, pseudo (le cas échéant), adresse postale (si connue), code postal et ville.

La carte s'adapte automatiquement à l'emprise des marqueurs visibles (zoom et centrage), avec stabilisation lors des changements de filtre pour éviter les ruptures d'affichage.

#### 6.5.4. Périmètre et sécurité

La liste des participants est calculée côté serveur par une **fonction RPC sécurisée** (`get_statistics_geography_visitors`), filtrée selon le périmètre de l'utilisateur connecté (organisation, exposition, plage de dates), conformément aux règles d'accès de la plateforme (RLS). Seuls les profils et visiteurs ayant une trace d'interaction dans le scope sélectionné — retour émotionnel, visite enregistrée ou profil organisateur de l'agence — sont inclus.

#### 6.5.5. Valeur ajoutée


| Dimension                  | Outil traditionnel                      | AIMEDIArt                                         |
| -------------------------- | --------------------------------------- | ------------------------------------------------- |
| Origine du public          | Estimation globale, enquête post-visite | **Carte des participants individuels**            |
| Organisateurs vs visiteurs | Non distingués                          | **Légende et filtres dédiés**                     |
| Source de position         | GPS ou absent                           | **Adresse postale + repli IP**, sans tracking GPS |
| Exploitation               | Tableur externe                         | **Intégré au module statistiques et exportable**  |


Cette cartographie complète la boucle de médiation mesurable : l'institution ne sait pas seulement *comment* le public a ressenti les œuvres, mais aussi **d'où il est venu** pour les voir.[^17]

### 6.4. Export et communication

Les rapports sont exportables en document PDF avec mise en page adaptée à l'impression. Ils incluent une lettre de synthèse personnalisable, transformant les données brutes en un **document de communication** utilisable auprès des financeurs, partenaires, équipes et artistes.

---

## 7. Parcours visiteur et médiation interactive

### 7.1. Intention

Le parcours visiteur est le **point de contact** entre la technologie AIMEDIArt et le public. Il doit être immédiat (scan QR → lecture), personnalisé (choix du persona), accessible (multilingue, audio) et engageant (retour émotionnel). Chaque friction supprimée — pas d'application à installer, pas de compte obligatoire, pas de formulaire marketing — est un gain pour l'expérience muséale.

### 7.2. Les six étapes du parcours


| Étape                 | Description                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. Entrée             | Vérification de l'identité du visiteur ; orientation vers l'accueil si nécessaire                    |
| 2. Accueil exposition | Choix d'un pseudo poétique, d'un avatar et d'une langue ; inscription légère ou connexion simplifiée |
| 3. Scan de l'œuvre    | Lecture du code QR via la caméra du téléphone                                                        |
| 4. Page de médiation  | Choix du registre de lecture, texte de médiation, lecteur audio                                      |
| 5. Retour émotionnel  | Expression de l'émotion, notation par cœurs, commentaire (obligatoire)                               |
| 6. Navigation         | Passage à l'œuvre suivante selon la séquence définie par l'organisateur                              |


### 7.3. Identité visiteur sans compte

AIMEDIArt permet une médiation riche **sans création de compte utilisateur**. Le visiteur est identifié par un identifiant anonyme persistant sur son appareil, complété d'un pseudo poétique et d'un avatar choisis parmi un catalogue multilingue. Cette identité légère suffit pour personnaliser l'expérience — persona mémorisé, historique de visites — tout en respectant la vie privée du visiteur.[^15]

### 7.4. Cartels imprimables et pont physique-numérique

Le module de production de cartels génère des documents PDF imprimables intégrant :

- le visuel de l'œuvre ;
- un extrait de médiation ;
- un **code QR** à haute correction d'erreur, optimisé pour la lecture en conditions de salle d'exposition ;
- le logo bloc AIMEDIArt ;
- des consignes de navigation adaptées au mode de visite de l'exposition.

Ce **pont physique-numérique** est essentiel : la médiation numérique ne remplace pas le cartel mural, elle l'**augmente** en lui donnant une porte d'entrée vers l'expérience interactive.[^16]

---

## 8. Procédés différenciants et résolution des problèmes sectoriels

### 8.1. Médiation génératrice multi-personas

**Problème sectoriel :** Un médiateur humain produit un discours unique par œuvre, reflétant sa propre sensibilité. Adapter ce discours à huit publics différents nécessiterait huit rédactions manuelles par œuvre — un travail prohibitif pour une exposition de taille moyenne.

**Solution AIMEDIArt :** À partir d'un matériau source unique, le système génère automatiquement huit registres de discours distincts, activables par le visiteur en temps réel. Le commissaire conserve le contrôle éditorial sur le matériau source et peut modifier chaque persona individuellement.

**Innovation :** La médiation n'est plus un texte figé mais une **palette de voix** que le visiteur explore selon ses préférences.

### 8.2. Chaîne d'intelligence artificielle bout-en-bout

**Problème sectoriel :** Produire une exposition médiable nécessite habituellement un photographe, un rédacteur, un traducteur, un studio d'enregistrement, un graphiste pour les codes QR et un outil de statistiques — six métiers, six outils, six délais.

**Solution AIMEDIArt :** Une chaîne automatisée image → analyse → texte multi-personas → audio multi-voix → cartel QR → collecte des retours → statistiques, intégrée dans une seule plateforme.

**Innovation :** **Réduction du temps de production** d'une exposition médiable de plusieurs semaines à quelques heures.

### 8.3. Retour émotionnel structuré et obligatoire

**Problème sectoriel :** Les institutions culturelles manquent de données qualitatives sur la réception de leurs œuvres. Les enquêtes de satisfaction capturent une opinion globale, déconnectée de l'expérience œuvre par œuvre.

**Solution AIMEDIArt :** Chaque visiteur exprime une émotion catégorisée et une notation par cœurs avant de pouvoir quitter l'œuvre. Les données sont structurées, horodatées et rattachées au graphe organisationnel.

**Innovation :** **Transformation du visiteur silencieux en contributeur de médiation**, sans effort perçu comme une enquête.

### 8.4. Persona mémorisé d'une visite à l'autre

**Problème sectoriel :** Un visiteur régulier (abonné de musée, classe scolaire) doit re-sélectionner ses préférences à chaque visite, sur chaque appareil.

**Solution AIMEDIArt :** Le registre de lecture préféré est mémorisé côté serveur et restauré automatiquement lors des visites ultérieures.

**Innovation :** **Continuité d'expérience personnalisée** pour les publics fidèles.

### 8.5. Garde-fou audio en exposition intérieure

**Problème sectoriel :** Les audioguides en salle posent des problèmes de nuisance sonore et de gestion de groupe, conduisant certaines institutions à les interdire.

**Solution AIMEDIArt :** Détection du contexte intérieur, consentement au port du casque, suivi de présence audio, suspension administrative en temps réel, pause automatique de la lecture vocale.

**Innovation :** **Audioguide compatible** avec les contraintes réelles des salles d'exposition.

### 8.6. Exposition connectée hors réseau

**Problème sectoriel :** De nombreux sites patrimoniaux (châteaux, grottes, caves, sites ruraux) ne disposent pas de connectivité fiable pour une médiation en ligne.

**Solution AIMEDIArt :** Offre commerciale dédiée avec contenu pré-généré et stocké localement, permettant une médiation numérique même en l'absence de réseau permanent.

**Innovation :** **Médiation numérique déployable** dans les environnements les plus contraints.

### 8.7. Gouvernance de l'intelligence artificielle intégrée

**Problème sectoriel :** Les institutions culturelles n'ont ni l'expertise ni les outils pour maîtriser les coûts et les risques des traitements par intelligence artificielle.

**Solution AIMEDIArt :** Garde-fou préventif, journalisation unifiée, estimation des coûts, sélection du modèle d'IA, matrice de sécurité par profil d'utilisateur.

**Innovation :** **Intelligence artificielle gouvernée**, adaptée au contexte et aux contraintes budgétaires des institutions culturelles.

### 8.8. Cartographie de l'origine géographique des participants

**Problème sectoriel :** Les outils de fréquentation culturelle comptabilisent les passages mais ignorent la **répartition géographique** du public. Les institutions ne savent pas si leur audience est locale, régionale, nationale ou internationale, ni distinguer les visiteurs occasionnels des acteurs institutionnels (équipe, commissaires, partenaires).

**Solution AIMEDIArt :** Module statistiques dédié combinant carte interactive, géocodage d'adresses postales (API BAN en France), repli IP, fusion profil/visiteur et filtres visiteurs/organisateurs. Popup détaillé par participant (identité, adresse, CP/ville).

**Innovation :** **Géolocalisation non intrusive** intégrée à la chaîne émotionnelle — sans application native ni GPS — permettant une lecture spatiale du rayonnement de l'exposition.

---

## 9. Déclaration de paternité

Le présent dossier décrit l'état technique et fonctionnel de la plateforme **AIMEDIArt** telle qu'implémentée dans le dépôt logiciel associé à cette enveloppe e-Soleau.

L'ensemble des procédés, structures de données, chaînes de traitement par intelligence artificielle, interfaces utilisateur, parcours de médiation interactive, mécanismes de collecte émotionnelle et éléments graphiques décrits ci-dessus résultent du travail de conception, de développement et d'expérimentation de l'éditeur de la plateforme AIMEDIArt.

Le signe distinctif **aimediart-logo-block.jpeg** joint au présent dépôt constitue l'expression graphique de l'identité du service et est utilisé de manière cohérente sur l'ensemble des supports numériques et imprimables produits par la plateforme.

---

*Fin du dossier de synthèse — AIMEDIArt, juin 2026.*

---

## NOTES DE BAS DE PAGE

[^1]: Implémentation du signe : ressources graphiques `public/brand/aimediart-logo-block.`*, modules `pdfHeaderLogoBlock`, `aimediartBrandLogoSvg`, intégration dans la vitrine publique et le générateur de cartels PDF (`cartelPdfRenderer`).

[^2]: Point d'entrée applicatif : `src/App.tsx`, `src/bootstrap.tsx`. Internationalisation : i18next, cinq bundles de langue.

[^3]: Gestion des rôles : `src/hooks/useAuthUser.ts`, `src/lib/authUser.ts`, `src/lib/userScope.ts`. Matrice de sécurité : `supabase/matrice_securite.sql`. Table de rattachement : `public.agency_users`.

[^4]: Garde-fou IA : `supabase/functions/_shared/aiGuard.ts` (fonction `checkAILimitBeforeCall`). Journalisation : tables `ai_usage_logs`, `ai_usage_events`. Principales fonctions serveur : `generate-mediation`, `analyze-artwork-image`, `generate-audio`, `google-tts`, `ai-create-job`, `ai-worker`, `check-ai-limits`, `register-visitor-instant`, `visitor-audio-session`, `connected-expo-quote`.

[^5]: Schéma de facturation : `supabase/migrations/migration_79_pricing_billing_schema.sql`. Mode veille : `supabase/migrations/20260617120000_organisation_standby_request.sql`.

[^6]: Service d'analyse image : `src/services/imageAnalysisService.ts` (fonction `analyzeArtworkImage`). Fonction serveur : `analyze-artwork-image`. Stockage : colonne `artwork_source_material` de la table `artworks`. Paramètre configurable : `app_settings.analysis_prompt`.

[^7]: Huit personas canoniques : `src/lib/mediationStyleCodes.ts`. Configuration : table `prompt_style`. Services de génération : `src/services/mediationService.ts` (`generateMediation`), `src/lib/mediationBatchGenerate.ts` (`generatePersonasBatchWithRetry`). Fonction serveur : `generate-mediation`. Stockage : colonne `artwork_description_i18n` (JSONB) de la table `artworks`.

[^8]: Orchestration audio : `src/services/audioService.ts` (~1 190 lignes). Fonction serveur : `generate-audio` (OpenAI `gpt-4o-mini-tts`). Stockage fichiers : bucket `audio-guides`. Métadonnées : table `audio_files`. Lecture visiteur : composant `AudioPlayer`, fonction serveur `google-tts`.

[^9]: Interface de suivi : `SettingsSuiviTokens.tsx`. Vue de contrôle des quotas : `ai_usage_vs_limits`. Paramètre de modèle : `app_settings.selected_ai_model`.

[^10]: Mémorisation du persona : `src/lib/visitorDefaultPersona.ts`. Procédures serveur : `set_visitor_persona_defaut`, `get_visitor_persona_defaut`. Colonne : `visitors.persona_defaut`.

[^11]: Collecte du retour émotionnel : `src/pages/VisitorView.tsx` (insertion dans `visitor_feedback`, vérification de persistance). Tables : `visitor_feedback`, `visitor_expo_visits`, `emotions`. Migration sessions : `20260612120000_visitor_expo_visits_schema.sql`.

[^12]: Module statistiques : `src/pages/Statistics.tsx` (~2 550 lignes). Filtrage par périmètre : `useDataScope()`. Indicateurs : `feedbackCountsByEmotionId`, `uniqueVisitorsTotal`, `averageHearts`.

[^13]: Hypothèse de comptage documentée dans `migration_79_pricing_billing_schema.sql` : une ligne `visitor_feedback` = une visite comptabilisée.

[^14]: Tableau de bord : `src/hooks/useDashboardProfile.ts`. Export PDF : `src/lib/statisticsBrowserPdf.ts`, `StatisticsReportView.tsx`.

[^15]: Identité visiteur : `src/lib/visitorIdentity.ts`, `src/lib/visitorAvatarPool.ts`. Catalogue d'avatars multilingue.

[^16]: Générateur de cartels : `src/lib/cartelPdfRenderer.ts`. Codes QR : `src/lib/qrCodeScanFriendly.ts` (correction d'erreur niveau H, 1024 pixels).

[^17]: Géographie statistiques : `src/pages/Statistics.tsx` (section `#statistics-geography`), `src/components/statistics/VisitorGeographySection.tsx`, `src/components/statistics/VisitorGeographyMap.tsx`, `src/lib/statisticsVisitorGeography.ts`. RPC : `get_statistics_geography_visitors` (`supabase/migrations/20260620130000_statistics_geography_visitors_rpc.sql`, `20260620150000_statistics_geography_adresse_postale.sql`). Colonnes profil : `profiles.adresse_postale`, `compl_adresse`, `country`, `city`, `zip_code`, `country_code`, `ip_address` (`20260620120000_profiles_ip_address.sql`, `20260620140000_profiles_postal_address.sql`). Géocodage : API BAN (`api-adresse.data.gouv.fr`), Nominatim, repli IP (geojs.io). Cache local : `statisticsVisitorGeography.ts` (persisted geography cache v4).

---

## ANNEXE A — RÉFÉRENCES TECHNIQUES ET INVENTAIRE DES ÉLÉMENTS LOGICIELS

*La présente annexe recense l'ensemble des éléments du dépôt logiciel permettant de vérifier les affirmations contenues dans le corps du dossier. Elle est destinée à l'examinateur souhaitant établir la correspondance entre la description fonctionnelle et l'implémentation concrète.*

### A.1. Architecture et navigation


| Domaine                   | Éléments de référence                                               |
| ------------------------- | ------------------------------------------------------------------- |
| Point d'entrée applicatif | `src/App.tsx`, `src/bootstrap.tsx`                                  |
| Vitrine publique          | `src/pages/PublicHome.tsx`, `src/components/PublicVitrineShell.tsx` |
| Navigation par ancres     | `src/lib/vitrineAnchorScroll.ts`                                    |


### A.2. Authentification et gestion des droits


| Domaine                        | Éléments de référence                                   |
| ------------------------------ | ------------------------------------------------------- |
| Résolution du rôle utilisateur | `src/hooks/useAuthUser.ts`, `src/lib/authUser.ts`       |
| Périmètre de données           | `src/lib/userScope.ts`, `src/lib/dashboardTeamScope.ts` |
| Rattachement organisation      | Table `public.agency_users`                             |
| Matrice de sécurité            | `supabase/matrice_securite.sql`                         |


### A.3. Intelligence artificielle


| Domaine                 | Éléments de référence                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Génération de médiation | `supabase/functions/generate-mediation/`, `src/services/mediationService.ts`                 |
| Analyse d'image         | `supabase/functions/analyze-artwork-image/`, `src/services/imageAnalysisService.ts`          |
| Personas (8 registres)  | `src/lib/mediationStyleCodes.ts`, table `public.prompt_style`                                |
| Génération par lots     | `src/lib/mediationBatchGenerate.ts`                                                          |
| Synthèse vocale         | `src/services/audioService.ts`, `supabase/functions/generate-audio/`                         |
| Lecture audio visiteur  | `supabase/functions/google-tts/`, composant `AudioPlayer`                                    |
| Jobs asynchrones        | `supabase/functions/ai-create-job/`, `supabase/functions/ai-worker/`, table `public.ai_jobs` |
| Garde-fou et quotas     | `supabase/functions/_shared/aiGuard.ts`, tables `ai_usage_logs`, `ai_usage_events`           |
| Suivi administrateur    | `SettingsSuiviTokens.tsx`                                                                    |


### A.4. Données des œuvres et médiation


| Domaine                          | Éléments de référence                               |
| -------------------------------- | --------------------------------------------------- |
| Matériau source (analyse image)  | Colonne `artworks.artwork_source_material`          |
| Textes de médiation multilingues | Colonne `artworks.artwork_description_i18n` (JSONB) |
| Fichiers audio                   | Table `public.audio_files`, bucket `audio-guides`   |
| Internationalisation des textes  | `src/lib/artworkDescriptionI18n.ts`                 |


### A.5. Médiation émotionnelle et comportementale


| Domaine               | Éléments de référence                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| Interface de collecte | `src/pages/VisitorView.tsx`                                                            |
| Catalogue d'émotions  | Table `public.emotions`                                                                |
| Retours des visiteurs | Table `public.visitor_feedback`                                                        |
| Sessions de visite    | Table `public.visitor_expo_visits`, `src/lib/visitorExpoVisit.ts`                      |
| Persona mémorisé      | Table `public.visitors` (colonne `persona_defaut`), `src/lib/visitorDefaultPersona.ts` |
| Migration sessions    | `supabase/migrations/20260612120000_visitor_expo_visits_schema.sql`                    |
| Migration persona     | `supabase/migrations/20260616120000_visitors_persona_defaut.sql`                       |


### A.6. Statistiques et rapports


| Domaine                              | Éléments de référence                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Module statistiques                  | `src/pages/Statistics.tsx`                                                                                                  |
| Export PDF                           | `src/lib/statisticsBrowserPdf.ts`, `StatisticsReportView.tsx`                                                               |
| Agrégats quotidiens                  | Table `public.daily_stats`                                                                                                  |
| Tableau de bord                      | `src/hooks/useDashboardProfile.ts`, `src/pages/Dashboard.tsx`                                                               |
| Géographie visiteurs / organisateurs | `src/components/statistics/VisitorGeographySection.tsx`, `VisitorGeographyMap.tsx`, `src/lib/statisticsVisitorGeography.ts` |
| RPC participants géographie          | `get_statistics_geography_visitors` — migrations `20260620130000`, `20260620150000`                                         |
| Adresse et IP profils                | Table `public.profiles` (`adresse_postale`, `compl_adresse`, `country`, `city`, `zip_code`, `country_code`, `ip_address`)   |
| Fiche utilisateur (adresse)          | `src/pages/Users.tsx`, `src/components/users/UserProfileAddressFields.tsx`                                                  |


### A.7. Parcours visiteur


| Domaine              | Éléments de référence                                                |
| -------------------- | -------------------------------------------------------------------- |
| Porte d'entrée œuvre | `src/components/ArtworkEntryGate.tsx`                                |
| Accueil exposition   | `src/components/visitor/VisitorWelcome.tsx`                          |
| Scanner QR           | `src/components/WorkScanner.tsx`, `src/lib/qrNativeCameraScanner.ts` |
| Carousel de personas | `src/lib/mediationSwiperLoop.ts`                                     |
| Identité anonyme     | `src/lib/visitorIdentity.ts`, `src/lib/visitorAvatarPool.ts`         |
| Inscription visiteur | `src/lib/registerAnonymousVisitorSession.ts`                         |


### A.8. Cartels et pont physique-numérique


| Domaine            | Éléments de référence           |
| ------------------ | ------------------------------- |
| Générateur PDF     | `src/lib/cartelPdfRenderer.ts`  |
| Codes QR optimisés | `src/lib/qrCodeScanFriendly.ts` |
| Logo sur cartels   | `src/lib/pdfHeaderLogoBlock.ts` |


### A.9. Modèle économique et administration


| Domaine                      | Éléments de référence                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Schéma de facturation        | `supabase/migrations/migration_79_pricing_billing_schema.sql`                                                    |
| Mode veille                  | `supabase/migrations/20260617120000_organisation_standby_request.sql`                                            |
| Devis exposition hors réseau | `supabase/functions/connected-expo-quote/`, `supabase/migrations/migration_78_connected_expo_quote_requests.sql` |


### A.10. Identité visuelle


| Domaine                | Éléments de référence                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| Signe distinctif joint | `aimediart-logo-block.jpeg`                                                 |
| Ressources graphiques  | `public/brand/aimediart-logo-block.`*                                       |
| Intégration numérique  | `src/lib/aimediartBrandLogoSvg.ts`, `src/components/PublicVitrineShell.tsx` |


---

*Annexe établie à partir de l'analyse du dépôt logiciel AIMEDIArt — juin 2026.*
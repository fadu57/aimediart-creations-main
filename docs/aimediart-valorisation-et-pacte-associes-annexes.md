# Annexes — Valorisation AIMEDIArt & pacte d’associés

| | |
|---|---|
| **Document parent** | `docs/aimediart-valorisation-et-pacte-associes.md` |
| **Date** | 25 juillet 2026 |
| **Statut** | **Brouillon de travail** — à faire valider par avocat / expert-comptable |
| **Avertissement** | Ces annexes ne constituent pas des actes signés. Les crochets `[…]` restent à compléter. |

**Personnes (rappel) :**

| Rôle | Identité |
|------|----------|
| **Associé A** (Apporteur / titulaire PI[^pi]) | DUPONT Fabien (à confirmer) |
| **Associés B et C** | (à nommer) |
| **Société** | `[Dénomination]`, `[SAS[^sas]/SARL[^sarl]]`, capital social **10 000 €** |

---

# Annexe 1 — Description technique d’AIMEDIArt

## A1.1 Objet

La présente annexe décrit l’actif logiciel **AIMEDIArt** (application web[^webapp] de médiation culturelle assistée par IA[^ia]) tel qu’existant à la date du document parent, pour les besoins :

- de l’évaluation par **coût de reconstitution** ;
- de la délimitation du **Droit de Licence** (Annexe 2).

## A1.2 Identification

| Élément | Description |
|---------|-------------|
| Nom commercial | AIMEDIArt / AIMEDIArt.com |
| Nature | Plateforme logicielle SaaS[^saas] B2B[^b2b] (institutions culturelles) + parcours visiteur |
| Maturité estimée | Environ **95 %** fonctionnel |
| Vie publique | Absente ou non significative à la date du document |
| Preuve d’antériorité | Dépôt **e-Soleau**[^esoleau] (juin 2026, le cas échéant — à joindre en copie) |
| Domaine(s) | `aimediart.com`, `www.aimediart.com` (et aliases éventuels — à lister) |
| Dépôt de code | Dépôt Git[^git] du projet (ex. dépôt GitHub `aimediart-creations-main` — URL et accès à préciser) |

## A1.3 Socle technique (stack[^stack])

| Couche | Technologies principales |
|--------|--------------------------|
| Interface (front[^front]) | React, TypeScript, Vite, composants d’interface (Radix / shadcn), Tailwind CSS |
| Données & auth[^auth] | Supabase[^supabase] (PostgreSQL, authentification, stockage fichiers, politiques RLS[^rls]) |
| Fonctions serveur | Supabase Edge Functions (Deno) — analyse d’image, génération de médiations, coûts IA, partage documents, etc. |
| IA / voix | Fournisseurs cloud (ex. Groq pour modèles texte ; OpenAI TTS[^tts] pour synthèse vocale) — usage mesuré (`ai_usage_logs`) |
| Hébergement front | Vercel (ou équivalent) |
| Internationalisation[^i18n] | Plusieurs langues (ex. fr, en, de, es, it) |
| Qualité | Tests (Vitest), lint, scripts de déploiement / sauvegarde |

*La liste exacte des dépendances figure dans le fichier `package.json` et les dossiers `supabase/` du dépôt.*

## A1.4 Modules fonctionnels couverts par l’actif

| Module | Contenu indicatif | Statut |
|--------|-------------------|--------|
| **Vitrine / marketing** | Site public organisation, pages légales, parcours d’engagement | Opérationnel |
| **Authentification & rôles** | Connexion, profils, rôles globaux et rôles agence/expo, matrice d’accès | Opérationnel |
| **Organisations (agences)** | Fiches, logos, rattachements utilisateurs | Opérationnel |
| **Expositions** | Création / édition, dates, lieux, logos, indoor, sponsors | Opérationnel |
| **Artistes & catalogue** | Fiches artistes, œuvres, groupes d’œuvres, QR, médias | Opérationnel |
| **Médiation IA** | Analyse d’image, génération multi-registres / multi-langues, files d’attente (`ai_jobs`) | Opérationnel |
| **Audio visiteur** | Synthèse vocale, consentements, présence audio indoor | Opérationnel |
| **Parcours visiteur** | Scan QR, œuvre, carnet / journal, feedback, stats émotion | Opérationnel |
| **Statistiques** | Tableaux de bord, cartographie visiteurs, exports | Opérationnel |
| **Tarification / plans** | Abonnements, options, dépassements (schéma pricing) | Opérationnel (paiement en ligne Stripe : prévu / partiel) |
| **Paramètres & GED[^ged]** | Configuration, documents internes, partage public sécurisé, corbeille | Opérationnel |
| **Accessibilité** | Travaux WCAG 2.2 (socle A/AA documenté) | En place (socle) |
| **Suivi coûts / erreurs** | Logs usage IA, erreurs visiteurs / organisateurs, monitoring | Opérationnel |

## A1.5 Actifs exclus de la description « produit » (sauf mention contraire)

- Contenus clients (textes d’œuvres, photos, données visiteurs) appartenant aux clients ou à des tiers ;
- Comptes cloud personnels non transférés (clés API au nom du porteur — à régulariser au profit de la Société) ;
- Marques / noms de domaine non listés ci-dessus ;
- Documents de financement / business plan (hors code).

## A1.6 Inventaire à joindre le jour de la signature (checklist)

- [ ] Export ou accès lecture au dépôt Git (commit / tag de référence : `[hash / tag]`)
- [ ] Liste des projets Supabase / Vercel et des comptes de facturation
- [ ] Copie du dépôt e-Soleau (si applicable)
- [ ] Liste des noms de domaine et registrars
- [ ] Inventaire des secrets / clés (sans les coller en clair dans le pacte)

---

# Annexe 2 — Acte d’apport du Droit de Licence & contrat de licence exclusif

> **Deux parties liées :** (A) formalisme d’apport au capital ; (B) conditions d’exploitation.  
> À fusionner ou scinder selon les usages du notaire / avocat (souvent : acte d’apport + contrat de licence en annexe de l’acte).

## A2.A — Acte d’apport (brouillon)

### Article A2.A.1 — Parties

Entre :

- **Associé A**, `[identité complète, adresse, nationalité]`, ci-après l’**Apporteur**,  
et  
- la **Société** `[dénomination]`, `[forme]`, au capital de **10 000 €**, siège `[adresse]`, en cours de constitution / immatriculation `[…]`, représentée par `[…]`,  

ci-après la **Société**.

### Article A2.A.2 — Objet de l’apport

L’Apporteur apporte à la Société, en pleine jouissance, un **droit de licence exclusif d’exploitation** portant sur la plateforme logicielle AIMEDIArt décrite en **Annexe 1** (le **Droit de Licence**).

**Cet apport ne constitue pas une cession de la propriété intellectuelle** sous-jacente (code source, dépôts, titres), qui demeure la **PI Réservée** de l’Apporteur, sous réserve des droits concédés ci-après.

### Article A2.A.3 — Évaluation pour le capital social

Pour les seuls besoins de la souscription au capital social, le Droit de Licence est évalué à :

**cinq mille euros (5 000 €).**

Les parties prennent acte que cette valeur est **volontairement inférieure** à la valorisation économique indicative d’AIMEDIArt (~**190 000 €**, Partie 1 du document parent / Annexe 5), et renvoient aux mécanismes du **pacte d’associés**.

### Article A2.A.4 — Contrepartie

En rémunération de cet apport, l’Apporteur reçoit des titres sociaux représentant **5 000 €** de capital (complétés par **100 €** d’apport en numéraire[^numeraire] au titre du même associé), soit une participation de **51 %** du capital de **10 000 €**, sous réserve des apports des Associés B et C.

### Article A2.A.5 — Jouissance — charges

L’apport est consenti **franc et quitte** de tout nantissement connu de l’Apporteur. L’Apporteur garantit disposer du pouvoir de concéder le Droit de Licence. Les garanties détaillées figurent à la section B.

### Article A2.A.6 — Commissaire aux apports

Les associés envisagent de se prévaloir, le cas échéant, d’une **dispense** de commissaire aux apports[^caa] (apport en nature ≤ 30 000 € et total des apports en nature ≤ moitié du capital). **À confirmer** selon la forme sociale et les textes applicables.

---

## A2.B — Contrat de licence exclusif (conditions)

### Article A2.B.1 — Définitions

Les définitions du pacte d’associés s’appliquent. En outre :

| Terme | Sens |
|-------|------|
| **Logiciel** | AIMEDIArt tel que décrit en Annexe 1, y compris mises à jour réalisées pendant la licence selon l’art. B.8 |
| **Territoire** | `[Monde entier / Union européenne / France]` |
| **Durée initiale** | `[Durée de la Société / 10 ans / indéterminée avec préavis]` |
| **Exclusivité** | Exclusive sur le Champ d’exploitation |
| **Champ d’exploitation** | Fourniture d’un service en ligne de médiation culturelle / muséale assistée par IA pour des professionnels (B2B) et parcours visiteurs associés |

### Article A2.B.2 — Concession

L’Apporteur concède à la Société, qui accepte, un droit **non cessible** (sauf Sortie conforme au pacte) **exclusif**, **personnel**, d’utiliser, reproduire, représenter, adapter (pour maintenance et évolution), et commercialiser le Logiciel sur le Territoire, dans le Champ d’exploitation.

### Article A2.B.3 — Droits inclus

- Hébergement et exploitation SaaS ;
- Création de comptes clients / visiteurs ;
- Production de contenus de médiation **pour le compte des clients** (les contenus clients restent hors PI Apporteur, sous réserve des CGU) ;
- Utilisation des signes AIMEDIArt nécessaires à l’exploitation (logo, nom), dans le respect de la charte ;
- Sous-licence **uniquement** aux utilisateurs finaux du service (licences d’utilisation finales).

### Article A2.B.4 — Droits exclus (PI Réservée)

Sauf acte séparé (voie L2 du pacte) :

- propriété du code source et des dépôts ;
- droit de concéder une licence concurrente à un tiers ;
- dépôt de brevets / marques nouveaux au seul nom de la Société sans accord (sauf marques déposées d’un commun accord).

### Article A2.B.5 — Exclusivité et non-concurrence

Pendant la Durée, l’Apporteur ne concède pas à un tiers, et n’exploite pas personnellement, un service substantiellement concurrent dans le Champ d’exploitation sur le Territoire, sauf accord écrit des Associés B et C.

### Article A2.B.6 — Redevances

**Option retenue :** `[R0 / R1 — biffer]`

- **R0 :** gratuité pendant `[X]` mois à compter de `[date]` ; puis **`[Y] %`** du CA HT[^caht] des revenus liés à AIMEDIArt, facturé `[trimestriellement]`, avec plancher `[…]` € / plafond `[…]` €.  
- **R1 :** aucune redevance tant que la licence n’est pas résiliée ou renégociée.

### Article A2.B.7 — Obligations de la Société

- Exploitation loyale, disponibilité raisonnable, sauvegardes ;
- Sécurité et conformité (RGPD[^rgpd] : la Société est responsable de traitement pour les données clients / visiteurs qu’elle collecte) ;
- Information sous 5 jours ouvrés de tout litige PI ou incident de sécurité majeur ;
- Interdiction de nantir / céder la licence hors cadre du pacte.

### Article A2.B.8 — Développements futurs (évolutions)

| Catégorie | Titularité par défaut (brouillon) |
|-----------|-----------------------------------|
| Corrections / maintenance du Logiciel | Droits d’exploitation à la Société via la licence ; **PI d’auteur** sur les contributions : `[cession à l’Apporteur / cotitularité / cession à la Société]` — **à trancher** |
| Nouveaux modules spécifiquement commandés et payés par la Société | `[cession à la Société / licence exclusive]` |
| Contributions de prestataires | La Société fait signer des contrats de cession de droits au bénéfice de `[Apporteur / Société]` |

**Recommandation de travail :** tant que seule une licence est apportée, les développements « cœur produit AIMEDIArt » restent rattachés à la **PI Réservée** (Apporteur), avec droit d’exploitation automatique étendu à la Société ; les développements purement clients (contenus, personnalisations one-shot) restent hors PI Apporteur.

### Article A2.B.9 — Logiciels libres (OSS[^oss])

La Société et l’Apporteur s’engagent à respecter les licences des composants open source utilisés. Un inventaire sommaire pourra être joint. Aucune obligation de « contaminer » l’ensemble du Logiciel sous licence copyleft n’est reconnue du seul fait de dépendances courantes, sous réserve d’audit.

### Article A2.B.10 — Garanties de l’Apporteur

L’Apporteur garantit :

- être titulaire des droits nécessaires pour concéder la licence ;
- n’avoir pas concédé d’exclusivité contradictoire à un tiers à la date de signature ;
- que le Logiciel ne contient pas, à sa connaissance, de code malveillant intentionnel.

**Plafond de garantie (brouillon) :** `[montant / limité aux apports / exclu le préjudice indirect]`.

### Article A2.B.11 — Résiliation / récupération

Renvoi aux **Articles 9** du pacte d’associés (renégociation, faute, préavis, liquidation, wind-down[^winddown], lock-up[^lockup]).

### Article A2.B.12 — Séquestre (escrow[^escrow])

Sur demande motivée (investisseur ou Associé A), mise sous séquestre du code auprès d’un tiers, conditions de libération limitées (faillite, manquement grave non réparé, etc.).

### Article A2.B.13 — Loi applicable

Droit français. Litiges : comme au pacte d’associés.

**Fait à `[ville]`, le `[date]`, en `[N]` exemplaires.**

| | Signature |
|--|-----------|
| Associé A (Apporteur) | |
| Société (représentant) | |
| Associés B et C (pour accord pacte / licence) | |

---

# Annexe 3 — Décisions à veto / majorité renforcée

## A3.1 Principes

Sauf disposition légale impérative contraire :

| Type | Règle proposée |
|------|----------------|
| **Décisions ordinaires** | Majorité des voix (Associé A à 51 % décide seul sauf liste ci-dessous) |
| **Majorité renforcée** | `[ex. : 66 % ou 75 %]` des droits de vote |
| **Unanimité** | 100 % des associés |
| **Veto Associé A** | Droit d’opposition même si une majorité existe, sur les matières listées en A3.3 |

## A3.2 Décisions à majorité renforcée (proposition)

1. Modification des statuts (hors mise à jour purement formelle)  
2. Augmentation ou réduction de capital  
3. Levée de Fonds (émission de titres, BSA[^bsa], AGA[^aga], obligations convertibles, etc.)  
4. Agrément d’un nouvel associé / cession de titres à un tiers  
5. Conclusion d’emprunts au-delà de `[montant]` €  
6. Embauche / rupture du dirigeant autre qu’Associé A  
7. Adoption du budget annuel si dépenses > `[montant]` € hors budget  
8. Distribution de dividendes  

## A3.3 Décisions avec **veto d’Associé A** (proposition)

Associé A peut s’opposer (veto[^veto]) aux décisions suivantes :

1. **Modification, résiliation, nantissement ou cession** du Droit de Licence  
2. **Cession, apport ou abandon** de tout ou partie de la PI Réservée (voie L2 / L3 du pacte)  
3. Toute obligation de **cession gratuite** de PI au profit d’un investisseur ou cessionnaire  
4. Changement de Contrôle au profit d’un **concurrent** d’AIMEDIArt / d’Associé A  
5. Engagement dans une **data-room[^dataroom] / SPA[^spa]** portant sur la PI au-delà de l’Annexe 2  
6. Modification de l’**objet social** écartant l’exploitation d’AIMEDIArt  
7. **Dissolution** anticipée volontaire  
8. Remplacement d’Associé A comme `[Président/Gérant]` **sans** cause réelle et sérieuse définie au pacte  

## A3.4 Décisions à **unanimité** (proposition)

1. Transformation de la forme sociale  
2. Transfert du siège hors France  
3. Suppression du veto Associé A ou modification de la présente Annexe 3  
4. Modification de la clause de rattrapage (Annexe 4) au détriment d’Associé A  

## A3.5 Information préalable

Toute décision des listes A3.2 à A3.4 fait l’objet d’une information écrite **au moins quinze (15) jours** avant (sauf urgence caractérisée documentée).

---

# Annexe 4 — Formules de rattrapage, bonus de sortie, indemnités

## A4.1 Paramètres de référence

| Paramètre | Symbole | Valeur par défaut (brouillon) |
|-----------|---------|-------------------------------|
| Valeur économique de référence | \( V_0 \) | **190 000 €** |
| Valeur d’apport du Droit de Licence | \( A \) | **5 000 €** |
| Écart initial | \( E_0 = V_0 - A \) | **185 000 €** |
| Quote-part Associés B+C | \( q \) | **49 %** = 0,49 |
| « Cadeau économique » indicatif | \( C_0 = E_0 \times q \) | **≈ 90 650 €** |

Les montants sont **indicatifs** et révisables d’un commun accord ou par expert indépendant nommé conjointement.

## A4.2 Clause 6.2.a — Complément au profit d’Associé A

**Événement déclencheur :** le premier de : Levée de Fonds > `[M]` € ; Changement de Contrôle ; `[date + 24 mois]`.

**Montant de rattrapage cible (formule de travail) :**

\[
R = \min\big( C_0 ;\ \alpha \times E_0 \big)
\]

avec \( \alpha = [0{,}25\ \text{à}\ 0{,}50] \) (à trancher — **proposition : 0,40** → \( R \approx 74\,000\ € \)).

**Modalités de paiement de \( R \) (au choix ou combinaison) :**

| Mode | Mécanisme |
|------|-----------|
| **Titres** | Émission / attribution gratuite ou BSA permettant à Associé A d’atteindre un % complémentaire équivalant à \( R \) / valorisation post-opération |
| **Cash** | Paiement par la Société ou par B+C selon accord |
| **Redevance** | Majoration temporaire des redevances licence jusqu’à concurrence de \( R \) |

Si une Levée de Fonds valorise déjà la PI via voie **L2** pour un montant ≥ \( R \), la clause 6.2.a est **réputée satisfaite**.

## A4.3 Clause 6.2.b — Plancher de contrôle

En cas de dilution, les parties s’efforcent que Associé A conserve au moins :

- **34 %** des droits de vote, **ou**  
- le **veto** de l’Annexe 3,

sauf renonciation écrite d’Associé A.

## A4.4 Clause 6.2.c — Bonus de Sortie

Soit \( P \) le prix total de cession des titres (equity value[^equity]) retenu dans l’opération de Sortie, et \( d \) le pourcentage du capital cédé (souvent 100 %).

**Bonus Associé A :**

\[
B = \beta \times E_0 \times d
\]

avec \( \beta = [0{,}25\ \text{à}\ 0{,}50] \) — **proposition : 0,30**  
→ si \( d = 1 \), \( B \approx 55\,500\ € \).

**Ordre de distribution (brouillon) :**

1. Frais d’opération  
2. Remboursement des comptes courants / dettes selon rang  
3. **Bonus \( B \)** à Associé A (si non déjà compensé par 6.2.a / L2)  
4. Répartition du solde selon % de capital (ou waterfall[^waterfall] investisseur si Levée antérieure)

**Plafond :** \( B \leq [10\ \%\ \text{de}\ P] \) (anti-abus).

## A4.5 Article 9 — Indemnités de résiliation / transition

### A4.5.1 Résiliation pour faute de la Société (art. 9.2)

- Préavis de transition (wind-down) : **90 jours** (sauf faute grave)  
- Indemnité éventuelle due par la Société à Associé A : frais raisonnables de migration / sécurisation, plafonnés à `[montant]` €  
- Pas de bonus 6.2.c si la faute est imputable à Associé A

### A4.5.2 Résiliation à l’initiative d’Associé A sans faute (art. 9.3)

Associé A propose soit :

1. **Rachat** par la Société de la poursuite d’exploitation (cession PI ou nouvelle licence) à un prix ≥ \( V_t \) (valeur économique actualisée, défaut = \( V_0 \) revalorisée de `[IPC / forfait X %/an]`), **ou**  
2. **Indemnité de transition** \( I \) due par Associé A à la Société :

\[
I = \min\big( [30\,000]\ € ;\ \gamma \times CA_{12} \big)
\]

où \( CA_{12} \) = chiffre d’affaires HT des 12 derniers mois liés à AIMEDIArt, et \( \gamma = [0{,}05\ \text{à}\ 0{,}15] \) — **proposition : 0,10**.

**Lock-up Sortie :** pas de résiliation 9.3 pendant **90 jours** après notification d’une Sortie engagée de bonne foi.

### A4.5.3 Liquidation (art. 9.4)

- Licence prend fin  
- Pas d’indemnité automatique, sauf créances déjà nées  
- Traitement des développements : selon Annexe 2 art. B.8

## A4.6 Actualisation de \( V_0 \)

Tous les `[24]` mois, ou avant Levée / Sortie, les Associés peuvent faire actualiser \( V_0 \) par expert commun. À défaut d’accord sous 30 jours, chaque partie nomme un expert ; s’ils divergent de plus de 20 %, un tiers expert tranche.

---

# Annexe 5 — Prise de connaissance de la valorisation (Partie 1)

## A5.1 Objet

Les soussignés déclarent avoir reçu, lu et compris la **Partie 1 — Valorisation « réelle » de AIMEDIArt** du document :

**« AIMEDIArt — Valorisation indicative & pacte d’associés (brouillon) »**  
en date du **25 juillet 2026** (et ses notes de glossaire), dont les conclusions principales sont rappelées ci-dessous.

## A5.2 Rappel des conclusions

| Point | Contenu |
|-------|---------|
| Méthode | Coût de reconstitution uniquement (pas de plan d’affaires, pas de multiples de MRR[^mrr]/ARR[^arr]) |
| Contexte | Produit ~95 % fonctionnel ; pas de vie publique significative |
| Valeur indicative retenue | **Environ 190 000 €** (fourchette centrale 180–200 k€) |
| Valeur d’apport au capital | Droit de licence exclusif **5 000 €** |
| Écart | Environ **185 000 €** — sous-évaluation volontaire, encadrée par le pacte et l’Annexe 4 |

## A5.3 Déclarations

Chaque Associé déclare :

1. avoir été informé du caractère **indicatif** de la valorisation et de l’absence de rapport de commissaire aux apports (sous réserve de la dispense éventuelle) ;  
2. comprendre que l’apport à **5 000 €** ne reflète **pas** la valeur économique indicative ;  
3. accepter de signer le pacte d’associés et l’Annexe 2 en connaissance de cause ;  
4. ne pas avoir subi de pression déloyale pour accepter cette sous-évaluation.

## A5.4 Signatures

Fait à `[ville]`, le `[date]`, en `[N]` exemplaires originaux.

| Associé | Nom | Signature |
|---------|-----|-----------|
| **A** | DUPONT Fabien (à confirmer) | |
| **B** | | |
| **C** | | |

**Pour la Société** (si déjà constituée) :  

| Qualité | Nom | Signature |
|---------|-----|-----------|
| `[Président / Gérant]` | | |

---

# Notes — glossaire (annexes)

[^pi]: **PI** — propriété intellectuelle.
[^sas]: **SAS** — société par actions simplifiée.
[^sarl]: **SARL** — société à responsabilité limitée.
[^webapp]: **Application web** — logiciel accessible via navigateur.
[^ia]: **IA** — intelligence artificielle.
[^saas]: **SaaS** (*Software as a Service*) — logiciel en service en ligne par abonnement.
[^b2b]: **B2B** (*Business to Business*) — offre destinée aux professionnels / organisations, non au grand public final comme client payeur principal.
[^esoleau]: **e-Soleau** — preuve d’antériorité INPI (pas un titre de propriété type brevet).
[^git]: **Git** — gestion de versions du code ; dépôt = emplacement du code versionné.
[^stack]: **Stack** — socle / pile technique.
[^front]: **Front** — interface utilisateur.
[^auth]: **Auth** — authentification.
[^supabase]: **Supabase** — plateforme cloud (base PostgreSQL, auth, stockage, fonctions).
[^rls]: **RLS** (*Row Level Security*) — sécurité au niveau des lignes en base de données (chaque utilisateur ne voit que les données autorisées).
[^tts]: **TTS** — synthèse vocale (*Text-To-Speech*).
[^i18n]: **i18n** — internationalisation (multi-langues).
[^ged]: **GED** — gestion électronique de documents.
[^numeraire]: **Numéraire** — apport en argent.
[^caa]: **Commissaire aux apports** — expert évaluant les apports en nature.
[^caht]: **CA HT** — chiffre d’affaires hors taxes.
[^rgpd]: **RGPD** — règlement général sur la protection des données (UE).
[^oss]: **OSS** — logiciels libres / open source.
[^winddown]: **Wind-down** — période de transition / désengagement ordonné.
[^lockup]: **Lock-up** — période de gel de certaines opérations.
[^escrow]: **Escrow** — séquestre du code chez un tiers.
[^bsa]: **BSA** — bons de souscription d’actions.
[^aga]: **AGA** — attributions gratuites d’actions.
[^veto]: **Veto** — droit d’empêcher une décision.
[^dataroom]: **Data-room** — salle de données pour audit avant investissement / cession.
[^spa]: **SPA** — contrat de cession d’actions (*Share Purchase Agreement*).
[^equity]: **Equity value** — valeur des titres (capitaux propres) retenue pour une cession, avant dette nette selon les conventions de l’opération.
[^waterfall]: **Waterfall** — ordre de priorité de répartition du prix entre investisseurs et fondateurs.
[^mrr]: **MRR** — revenu récurrent mensuel.
[^arr]: **ARR** — revenu récurrent annuel.

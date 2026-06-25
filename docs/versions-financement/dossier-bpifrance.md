<div align="center">

![AIMEDIArt — signe distinctif](../../public/brand/aimediart-logo-block.png)

**Art-mediation with AI**[^baseline]

</div>

| | |
|---|---|
| **Projet** | AIMEDIArt — plateforme de médiation culturelle numérique |
| **Porteur** | DUPONT Fabien |
| **Dispositif** | **Bourse French Tech**[^french-tech] — Bpifrance[^bpifrance] |
| **Document** | Dossier de demande de financement — **version Bpifrance** |
| **Date** | juin 2026 |
| **Statut produit** | Plateforme opérationnelle[^live] · e-Soleau[^esoleau] INPI[^inpi] (juin 2026) |

---

# Dossier Bpifrance — Bourse French Tech

> **Ce que Bpifrance veut entendre — angle business :**
> *« Ce projet est une innovation à fort potentiel de marché. »*
>
> Scalabilité · SaaS[^saas] B2B[^b2b] · modèle économique solide · étude de marché · acquisition clients · verrou technologique · croissance.

*Corps détaillé commun : `docs/dossier-financement-aimediart.md` · cette version met en avant le potentiel de marché et la défendabilité technologique.*

---

## 1. Synthèse — Résumé opérationnel

### Accroche

Le marché de la médiation culturelle numérique est **fragmenté**, **peu outillé** et **sous-adressé** : des milliers de structures exposent chaque année sans solution intégrée, récurrente et mesurable. AIMEDIArt est un **SaaS B2B** opérationnel qui peut servir **des centaines, voire des milliers de structures** en France, en Europe et au-delà.

### Solution — Un SaaS B2B à fort potentiel de montée en charge

**AIMEDIArt** unifie dans une seule plateforme : production IA de médiation · audio multilingue · QR · statistiques émotionnelles · abonnements récurrents.

```
Marché total ~27 000 expositions/an → Marché adressable ~3 750 structures → Objectif A3 : 95 clients payants
```

**Produit déjà live**[^live] — risque technique réduit · **IP déposée**[^pi] (e-Soleau[^esoleau]) · **prévisionnel 36 mois** avec formules modifiables.

### Scalabilité — Passage à l'échelle

| Horizon | Cible | Levier |
|---------|-------|--------|
| **France** | ~3 750 structures adressables[^sam] | Abonnements 59–549 €/mois · essai gratuit Étincelle |
| **Europe** | 5 langues opérationnelles · extension UE[^ue] | Musées, biennales, galeries transfrontalières |
| **Monde** | Modèle réplicable (arts visuels universels) | Multilingue · cloud[^cloud] dimensionné par quotas |

**Architecture conçue pour la montée en charge**[^scale] :
- Hébergement infonuagique[^cloud] avec quotas par abonnement ;
- Abonnements en libre-service[^self-service] (sans intervention manuelle) ;
- Coûts variables maîtrisés (IA, TTS[^tts] à l'usage).

![Marché TAM / SAM / SOM](assets/bp/bp-tam-sam-som.png)

### Modèle économique — Solidité

| Source | Description |
|--------|-------------|
| **Abonnements SaaS**[^saas] | Étincelle (essai 30 j) → Atelier (59 €) → Horizon (149 €) → Rayonnement (549 €) |
| **Grands événements** | Zénith (15–17 k€ / projet) |
| **Options** | Dépassements quotas · langues · plan veille (19–49 €/mois) |

**Scénario de référence (A3) :** 95 clients payants · ~127 k€ CA[^ca] HT[^ht] · MRR[^mrr] ~14 k€ TTC[^ttc] · point mort fin A2.

*Source : `docs/business-plan-previsionnel-36m.xlsx` (formules modifiables)*

### Étude de marché — Clarté du positionnement

| Segment | Volume France | Source |
|---------|--------------|--------|
| **Marché total**[^tam] | ~27 000 expositions/an | Cartographie marché |
| **Marché adressable**[^sam] | ~3 750 structures | Musées, centres d'art, galeries, FRAC[^frac], festivals |
| **Part capturable**[^som] | 95 clients A3 (scénario base) | Prévisionnel 36 mois |

*Détail : `docs/cartographie-marche-france.md` · `docs/business-plan-aimediart.md` Annexe A*

### Stratégie d'acquisition clients — Entonnoir robuste

| Étape | Mécanisme | Cible |
|-------|-----------|-------|
| **Acquisition** | Essai gratuit Étincelle (30 j) · démos institutions · réseau NOP[^nop] / DCA[^dca] |
| **Conversion** | 50 % essai → payant (hypothèse prévisionnel) | Atelier 59 € |
| **Montée en gamme** | Upsell Horizon / Rayonnement selon volume œuvres | ARPU croissant |
| **Rétention** | Valeur mesurable (stats, émotion, rapports) · switching cost élevé | Attrition[^churn] maîtrisée |

![Entonnoir d'acquisition](assets/bp/bp-funnel-acquisition.png)

### Verrou technologique — Pourquoi est-ce difficile à copier ?

| Barrière | Détail |
|----------|--------|
| **1. Chaîne intégrée de bout en bout**[^end-to-end] | Photo → 8 registres curatoraux → audio → QR → émotion → carte — **aucun concurrent ne couvre l'intégralité** |
| **2. Propriété intellectuelle**[^pi] | e-Soleau[^esoleau] INPI[^inpi] (juin 2026) — preuve d'antériorité sur l'architecture |
| **3. Savoir-faire curatorale** | 8 registres de discours calibrés arts visuels — pas un simple chatbot générique |
| **4. Données et rétention** | Historique émotionnel par œuvre · rapports exportés · coût de migration élevé pour le client |
| **5. Infrastructure sécurisée** | RLS[^rls] Supabase · multi-tenant par agence · conformité RGPD[^rgpd] by design |
| **6. Avance opérationnelle** | Produit **live**[^live] · premiers clients · retours terrain intégrés |

### Potentiel de croissance

| Indicateur | A3 (base) | Levier de croissance |
|------------|-----------|----------------------|
| Clients payants | 95 | SAM[^sam] ~3 750 → marge × 40 |
| MRR[^mrr] | ~14 k€ TTC | Upsell + Zénith (grands événements) |
| Extension géo | 2 structures hors France M18 | 5 langues · UE puis international |
| LTV[^ltv] / churn[^churn] | Modèle validé prévisionnel | Rétention par données et workflows |

### Demande financière — Bpifrance

| Élément | Montant |
|---------|--------:|
| **Coût total du projet** (18 mois) | **150 000 €** |
| **Montant sollicité Bourse French Tech** | **25 000 €** |
| **Taux de financement demandé** | **17 %** du coût total |
| **Objet** | Accélération dev (Stripe[^stripe], facturation) · acquisition clients B2B |
| **Durée** | 18 mois (T0 = **juillet 2026**) |
| **Cofinancements** | Fonds propres · DRAC · Région · CNC |

### Phrase d'accroche (formulaire en ligne)

> *« AIMEDIArt est un **SaaS B2B innovant** adressant un **marché adressable de ~3 750 structures** culturelles, avec un produit **opérationnel**, une **IP déposée**, un **verrou technologique** sur la chaîne intégrée image–médiation–mesure, et un **potentiel de passage à l'échelle** national et international. »*

---

## 2. Équipe — Capacité d'exécution

| Personne | Profil | Apport business |
|----------|--------|-----------------|
| **Fabien Dupont** | ESSEC[^essec] · porteur · dev fondateur | Vision produit · plan d'affaires[^business-plan] · commercial B2B |
| **Jean-Yves CAMUS** | NOP Grand Est · commissaire | Réseau institutions · crédibilité sectorielle |
| **Robin Caudy** | ENI Brest[^eni] · product builder[^builder] | Industrialisation · montée en charge[^scale] opérationnelle |

**Renfort M7 :** 1 développeur sous-traité (4 500 € HT[^ht]/mois) — paiement Stripe, facturation auto, robustesse.

---

## 3. Indicateurs clés — 12 mois (KPI)

| KPI[^kpi] | Cible M12 | Cible M18 |
|-----------|-----------|-----------|
| Clients payants | 15 | 30 |
| MRR[^mrr] TTC | ~4 k€ | ~8 k€ |
| Attrition mensuelle[^churn] | < 5 % | < 4 % |
| Conversion essai → payant | 50 % | 50 % |
| Structures pilotes Grand Est | 5 | 8–12 |

*Méthodologie : `docs/business-plan-aimediart.md` Annexe A · `docs/assets/bp/annexe-a-methodologie-calcul.png`*

---

## 4. Usage des fonds Bpifrance

| Poste | Montant indicatif | Impact |
|-------|------------------:|--------|
| Consolidation paiement (Stripe[^stripe]) | ~15 000 € | 1er encaissement récurrent automatisé |
| Acquisition clients B2B[^b2b] | ~10 000 € | Démarchage · démos · contenus |
| Renfort dev (accélération) | ~5 000 € | Facturation · robustesse · tests charge |
| **Total demande** | **25 000 €** | |

---

## 5. Documents Bpifrance à joindre

- [ ] Plaquette investisseur[^pitch-deck] : `docs/pitch-investisseur-aimediart.md`
- [ ] Plan d'affaires[^business-plan] : `docs/business-plan-aimediart.md`
- [ ] Prévisionnel Excel : `docs/business-plan-previsionnel-36m.xlsx`
- [ ] Cartographie marché : `docs/cartographie-marche-france.md`
- [ ] Preuve e-Soleau[^esoleau]
- [ ] Lettre engagement porteur : `lettres-soutien/lettre-engagement-porteur-bpifrance.md`
- [ ] Visuels : TAM/SAM/SOM · entonnoir acquisition · méthodologie calcul

---

*Version Bpifrance — juin 2026 · Glossaire : `docs/dossier-financement-aimediart.md`.*

[^baseline]: Signature de marque — *Art-mediation with AI*.
[^french-tech]: Écosystème French Tech — start-up innovantes françaises.
[^bpifrance]: Banque publique d'investissement.
[^live]: Produit opérationnel en conditions réelles.
[^esoleau]: Dépôt INPI de preuve d'antériorité.
[^inpi]: Institut national de la propriété industrielle.
[^saas]: Logiciel en ligne (*Software as a Service*).
[^b2b]: Professionnel à professionnel (*Business to Business*).
[^sam]: Marché adressable (*Serviceable Addressable Market*) — ~3 750 structures.
[^ue]: Union européenne.
[^cloud]: Infrastructure infonuagique.
[^scale]: Montée en charge (*scalabilité*).
[^self-service]: Libre-service — souscription sans intervention manuelle.
[^tts]: Synthèse vocale (*Text-to-Speech*).
[^ca]: Chiffre d'affaires.
[^ht]: Hors taxes.
[^mrr]: Revenu récurrent mensuel (*Monthly Recurring Revenue*).
[^ttc]: Toutes taxes comprises.
[^tam]: Marché total (*Total Addressable Market*).
[^som]: Part de marché capturable (*Serviceable Obtainable Market*).
[^frac]: Fonds régionaux d'art contemporain.
[^nop]: Nouvel Observatoire de la Photographie (Grand Est).
[^dca]: Association des centres d'art contemporain.
[^churn]: Attrition — proportion de clients résilient.
[^end-to-end]: Chaîne intégrée de bout en bout.
[^pi]: Propriété intellectuelle.
[^rls]: Sécurité au niveau des lignes (*Row Level Security*).
[^rgpd]: Règlement général sur la protection des données.
[^stripe]: Plateforme de paiement en ligne.
[^essec]: ESSEC Business School.
[^business-plan]: Plan d'affaires.
[^eni]: École nationale d'ingénieurs (Brest).
[^builder]: Constructeur produit.
[^kpi]: Indicateur clé de performance.
[^ltv]: Valeur vie client (*Lifetime Value*).
[^pitch-deck]: Plaquette investisseur.

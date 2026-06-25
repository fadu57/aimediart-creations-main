# Dossiers de financement — versions ciblées

Quatre déclinaisons du document-cadre `docs/dossier-financement-aimediart.md`, chacune calibrée sur ce que le financeur veut entendre.

| Version | Fichier | Message-clé | Angle |
|---------|---------|-------------|-------|
| **DRAC SNI** | [dossier-drac-sni.md](./dossier-drac-sni.md) | *« Ce projet sert les artistes et le public. »* | Artistique · médiation · démocratisation · territoire |
| **Région Grand Est** | [dossier-region-grand-est.md](./dossier-region-grand-est.md) | *« Ce projet crée de la valeur et de l'emploi ici. »* | Économique · ICC · attractivité numérique · gouvernance |
| **CNC** | [dossier-cnc.md](./dossier-cnc.md) | *« Ce projet repousse les limites de l'image interactive. »* | Créatif · image · interactivité · expérience visuelle et auditive |
| **Bpifrance** | [dossier-bpifrance.md](./dossier-bpifrance.md) | *« Ce projet est une innovation à fort potentiel de marché. »* | Business · scalabilité · marché · verrou technologique |

## Montants sollicités (juillet 2026 — T0)

| Financeur | Montant | % projet | Fichier |
|-----------|--------:|---------:|---------|
| DRAC SNI | **25 000 €** | 17 % | `dossier-drac-sni.md` |
| Région Grand Est | **40 000 €** | 27 % | `dossier-region-grand-est.md` |
| CNC | **28 000 €** | 19 % | `dossier-cnc.md` |
| Bpifrance (French Tech) | **25 000 €** | 17 % | `dossier-bpifrance.md` |
| **Total demandes** | **118 000 €** | | |

*Besoin public net après apports et CA prévisionnel : ~55 k€. Les demandes cumulées intègrent une marge de sécurité ; priorité en cas d'octroi partiel : Région puis DRAC.*

## Lettres de soutien

| Document | Usage |
|----------|-------|
| [lettre-soutien-jean-yves-camus-nop.md](./lettres-soutien/lettre-soutien-jean-yves-camus-nop.md) | DRAC · Région · CNC |
| [lettre-soutien-institution-pilote-modele.md](./lettres-soutien/lettre-soutien-institution-pilote-modele.md) | Modèle musée / centre d'art pilote |
| [lettre-engagement-porteur-bpifrance.md](./lettres-soutien/lettre-engagement-porteur-bpifrance.md) | Bpifrance (complément porteur) |

```bash
pandoc docs/versions-financement/lettres-soutien/lettre-soutien-jean-yves-camus-nop.md -o docs/versions-financement/lettres-soutien/lettre-soutien-jean-yves-camus-nop.docx
```

## Export Word — dossiers

```bash
pandoc docs/versions-financement/dossier-drac-sni.md -o docs/versions-financement/dossier-drac-sni.docx --resource-path="docs;public/brand;."
pandoc docs/versions-financement/dossier-region-grand-est.md -o docs/versions-financement/dossier-region-grand-est.docx --resource-path="docs;public/brand;."
pandoc docs/versions-financement/dossier-cnc.md -o docs/versions-financement/dossier-cnc.docx --resource-path="docs;public/brand;."
pandoc docs/versions-financement/dossier-bpifrance.md -o docs/versions-financement/dossier-bpifrance.docx --resource-path="docs;public/brand;."
```

## Documents complémentaires (communs)

- Plan d'affaires : `docs/business-plan-aimediart.md`
- Prévisionnel : `docs/business-plan-previsionnel-36m.xlsx`
- Cartographie marché : `docs/cartographie-marche-france.md`
- Glossaire complet : fin de `docs/dossier-financement-aimediart.md`

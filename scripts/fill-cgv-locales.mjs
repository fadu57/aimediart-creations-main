/**
 * Génère fr/en/de/es/it/cgv.json à structure strictement identique.
 * Exécution : node scripts/fill-cgv-locales.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesRoot = join(__dirname, "..", "src", "i18n", "locales");

const fr = {
  meta: {
    title: "Conditions Générales de Vente (CGV)",
    version: "Version 1.0 — AIMEDIArt.com — applicables aux offres souscrites en ligne ou par devis, à la date d’acceptation par le Client.",
    languageNotice:
      "Les présentes CGV sont rédigées en français. Toute version traduite est fournie pour faciliter la lecture ; en cas d’écart d’interprétation, la version française fait foi, sous réserve des dispositions impératives applicables. Document type à valider par votre conseiller juridique avant engagement définitif.",
  },
  nav: {
    back_home: "← Retour à l’accueil vitrine",
    language_aria: "Choisir la langue d’affichage",
  },
  sections: {
    intro: {
      p1: "Les présentes Conditions Générales de Vente (ci-après « CGV ») régissent les ventes de services, d’abonnements et de prestations numériques proposés par l’Éditeur sous la marque AIMEDIArt (ci-après le « Service » ou les « Services »), accessibles depuis le site aimediart.com ou tout autre domaine ou application dédiée exploitée par l’Éditeur.",
      p2: "Toute commande ou souscription implique l’acceptation sans réserve des présentes CGV par le Client, reconnaissance de capacité juridique pour contracter, et renonciation à se prévaloir de ses propres conditions générales d’achat, sauf accord écrit contraire de l’Éditeur.",
      p3: "Le Client déclare disposer des autorisations nécessaires au sein de son organisation (musée, galerie, agence culturelle, association, collectivité, etc.) pour souscrire au nom et pour le compte de la structure identifiée lors de la commande.",
    },
    sellerIdentity: {
      title: "Article 1 — Identité de l’Éditeur",
      p1: "L’Éditeur du Service AIMEDIArt est la personne morale ou la personne physique identifiée dans les mentions légales publiées sur le site aimediart.com, dont le siège social ou le domicile professionnel y figure, joignable à l’adresse électronique contact@aimediart.com.",
      p2: "Toute information complémentaire (numéro d’immatriculation, TVA intracommunautaire, directeur de publication) est portée à la connaissance du Client sur lesdites mentions légales, qui font partie intégrante de la documentation contractuelle.",
    },
    definitions: {
      title: "Article 2 — Définitions",
      intro: "Aux fins des présentes CGV, les termes suivants auront la signification suivante :",
      list: {
        platform: "« Plateforme » : l’environnement logiciel, les interfaces web, les API et l’infrastructure technique permettant l’accès aux Services AIMEDIArt.",
        client: "« Client » : toute personne morale, ou personne physique agissant pour des besoins professionnels, qui souscrit une offre ou signe un devis de l’Éditeur.",
        user: "« Utilisateur » : toute personne habilitée par le Client à accéder à l’espace d’administration ou aux fonctionnalités du Service.",
        services: "« Services » : l’ensemble des fonctionnalités fournies par l’Éditeur, notamment médiation numérique, visualisation, gestion de contenus, analytiques d’usage liées à l’exposition, selon la formule souscrite.",
        clientContent: "« Contenus Client » : données, textes, images, fichiers, métadonnées et tout matériau fourni ou importé par le Client sur la Plateforme.",
        subscription: "« Abonnement » : formule d’accès aux Services facturée de manière périodique (mensuelle, annuelle ou autre période indiquée au catalogue).",
        order: "« Commande » : acte par lequel le Client achète une offre, confirme un devis ou renouvelle un Abonnement auprès de l’Éditeur.",
      },
    },
    documents: {
      title: "Article 3 — Documents contractuels",
      p1: "Les documents applicables, par ordre hiérarchique décroissant, sont : (1) le devis ou bon de commande signé le cas échéant ; (2) les présentes CGV ; (3) la fiche descriptive de l’offre ou du plan tarifaire accepté ; (4) la politique de confidentialité et, le cas échéant, un éventuel accord de traitement des données (DPA).",
      p2: "En cas de contradiction entre un devis personnalisé signé par les parties et les CGV, les stipulations du devis prévalent pour les seules dispositions expressément mentionnées comme particulières.",
    },
    clientsScope: {
      title: "Article 4 — Champ d’application et clients",
      p1: "Les Services sont destinés en priorité aux professionnels du secteur culturel et événementiel. Lorsque le Client est un consommateur au sens du Code de la consommation, les droits impératifs applicables au consommateur demeurent acquits nonobstant toute clause contraire réputée non écrite.",
      p2: "Le Client garantit l’exactitude des informations communiquées lors de la Commande (identité, facturation, moyens de paiement, contacts). Toute erreur engageant des frais de traitement ou de refacturation pourra être répercutée sur le Client après information.",
    },
    servicesDescription: {
      title: "Article 5 — Description des Services",
      p1: "Les caractéristiques essentielles des Services (périmètre fonctionnel, limites d’usage, volumes inclus, niveaux d’accompagnement) sont celles décrites sur le site au jour de la Commande ou sur le devis. L’Éditeur peut faire évoluer la Plateforme pour des motifs de maintenance, de sécurité ou d’amélioration, dans le respect d’une continuité raisonnable de service.",
      p2: "Certaines fonctionnalités peuvent reposer sur des services tiers (hébergement, messagerie, traitements d’IA). Le Client reconnaît que la disponibilité finale peut dépendre de ces interconnexions ; l’Éditeur s’efforce d’en limiter l’impact au mieux.",
      p3: "Le Service peut intégrer des modes de médiation ou de dialogue avec les visiteurs d’exposition (par exemple via QR code). Le Client reste seul responsable du contenu éditorial qu’il publie et du respect des droits des tiers.",
    },
    contractFormation: {
      title: "Article 6 — Formation du contrat",
      p1: "La Commande en ligne devient ferme après paiement accepté ou, pour les offres sur devis, après signature électronique, bon pour accord ou accord écrit du Client sur la proposition commerciale, selon le processus présenté par l’Éditeur.",
      p2: "L’Éditeur se réserve le droit de refuser une Commande en cas de suspicion de fraude, d’insuffisance d’informations, de conflit avec une offre promotionnelle non cumulable, ou d’impossibilité technique manifeste, et rembourse tout paiement encaissé à tort dans les meilleurs délais.",
      p3: "Une confirmation de Commande est adressée au Client par courrier électronique ou est rendue disponible dans l’espace Compte. Elle vaut preuve du contrat et des caractéristiques principales souscrites.",
    },
    prices: {
      title: "Article 7 — Prix",
      p1: "Les prix sont indiqués en euros hors taxes ou toutes taxes comprises selon les mentions affichées au moment de la Commande. Toute taxe applicable (TVA, taxe locale) est due par le Client conformément à la réglementation en vigueur.",
      p2: "Pour les formules indexées sur des usages (ex. nombre d’œuvres, de visiteurs, de scans), les seuils et barèmes applicables sont ceux du plan choisi. Un dépassement peut donner lieu à une facturation complémentaire, sur la base des tarifs publiés ou convenus par devis.",
      p3: "Les offres promotionnelles sont valables dans la limite des dates et stocks indiqués. Aucun escompte de réglement ne sera consenti sauf accord express.",
    },
    payment: {
      title: "Article 8 — Modalités de paiement",
      p1: "Le paiement s’effectue par les moyens proposés sur la Plateforme (carte bancaire, prélèvement, virement ou tout autre moyen explicitement autorisé). L’Éditeur peut déléguer l’encaissement à un prestataire de paiement réglementé conformément aux obligations légales.",
      p2: "En cas de défaut de paiement ou de contestation justifiée par l’Éditeur, celui-ci pourra suspendre l’accès aux Services après mise en demeure restée infructueuse dans un délai de huit (8) jours, sans préjudice des intérêts et indemnités contractuelles ou légales.",
    },
    accessDelivery: {
      title: "Article 9 — Fourniture et mise à disposition",
      p1: "Sous réserve du parfait paiement, l’Éditeur active l’accès aux Services dans les délais indiqués lors de la Commande ou, à défaut, dans un délai raisonnable compte tenu des vérifications d’identité ou de conformité éventuellement nécessaires.",
      p2: "Les identifiants d’accès sont strictement confidentiels. Toute utilisation du compte est présumée faite avec l’autorisation du Client, qui demeure responsable de la gestion des Utilisateurs.",
    },
    duration: {
      title: "Article 10 — Durée — Renouvellement",
      p1: "Les Abonnements sont conclus pour la période sélectionnée (mensuelle, annuelle, autre). Sauf mention contraire expresse sur l’offre, ils se renouvellent tacitement pour une période de même durée, sauf résiliation notifiée dans les conditions de l’article « Résiliation ».",
      p2: "Le Client peut opter pour une résiliation à l’échéance depuis son espace ou par courrier électronique reconnu par l’Éditeur, conformément aux modalités affichées sur la Plateforme.",
      p3: "Les prestations ponctuelles ou forfaitaires non récurrents prennent fin à l’achèvement de la prestation décrite sur le devis ou la Commande, sous réserve des garanties légales.",
    },
    rightOfWithdrawal: {
      title: "Article 11 — Droit de rétractation (le cas échéant)",
      p1: "Lorsque le Client est un consommateur et qu’il bénéficie d’un droit de rétractation applicable aux contrats conclus à distance, les informations légales sur ce droit (délai, modalités, formulaire-type) lui sont communiquées avant la Commande conformément aux articles L.221-5 et suivants du Code de la consommation.",
      p2: "Lorsque le Client demande expressément l’exécution immédiate d’un service numérique et renonce à son droit de rétractation conformément à la réglementation, l’exécution commence dès réception de cette demande et le droit de rétractation cesse pour la partie déjà exécutuee avec accord, dans les limites légales.",
    },
    clientObligations: {
      title: "Article 12 — Obligations du Client",
      intro: "Le Client s’engage notamment à :",
      list: {
        item1: "fournir des informations exactes, à jour et complètes pour l’exécution du contrat et la facturation ;",
        item2: "ne pas compromettre la sécurité de la Plateforme, ne pas tenter d’accès non autorisés et respecter les quotas d’usage ;",
        item3: "disposer des droits nécessaires sur les Contenus Client et garantir l’Éditeur contre tout recours tiers ;",
        item4: "respecter la réglementation applicable (notamment protection des données, droit d’auteur, droit des visiteurs lors de collectes) ;",
        item5: "informer ses Utilisateurs des règles de confidentialité internes pertinentes pour l’usage du Service.",
      },
    },
    providerObligations: {
      title: "Article 13 — Obligations de l’Éditeur",
      intro: "L’Éditeur s’engage à :",
      list: {
        item1: "délivrer les Services avec diligence et selon les règles de l’art, conformément à la description contractuelle ;",
        item2: "mettre en œuvre les mesures raisonnables de sécurité et de confidentialité pour la Plateforme sauf force majeure ou fait exclusif du Client ;",
        item3: "informer le Client de toute interruption programmée significative lorsque cela est possible ;",
        item4: "assister le Client dans les limites du support associé à l’offre souscrite ;",
        item5: "respecter le cadre du traitement des données personnelles décrit dans la politique de confidentialité et tout DPA conclu le cas échéant.",
      },
    },
    warranty: {
      title: "Article 14 — Garanties",
      p1: "Les Services sont fournis « en l’état » et « selon disponibilité », dans les limites des fonctionnalités publiées. L’Éditeur ne garantit pas l’absence totale d’anomalies mineures ni l’adéquation du Service à un besoin non exprimé contractuellement.",
      p2: "Les garanties légales applicables aux consommateurs, le cas échéant, demeurent pleinement applicables dans les conditions de droit commun, indépendamment des présentes CGV.",
    },
    liability: {
      title: "Article 15 — Responsabilité",
      p1: "Sauf faute lourde ou dol, la responsabilité de l’Éditeur pour tout dommage direct prouvé est limitée, toutes causes confondues sur une période de douze mois, au montant hors taxes effectivement payé par le Client au titre du Service concerné pendant les douze mois précédant le fait générateur.",
      p2: "En aucun cas l’Éditeur ne sera tenu des dommages indirects ou immatériels (perte de chiffre d’affaires, perte de données non imputable à une défaillance prouvée de l’Éditeur, atteinte à l’image) lorsque la limitation est autorisée par une disposition impérative.",
      p3: "Le Client demeure seul responsable de l’usage qu’il fait du Service, de ses Contenus Client et de la conformité de ses traitements vis-à-vis des visiteurs d’exposition.",
    },
    intellectualProperty: {
      title: "Article 16 — Propriété intellectuelle",
      p1: "La Plateforme, ses marques, bases de données, interfaces et documentations restent la propriété exclusive de l’Éditeur ou de ses concédants. Aucune cession de droits de propriété intellectuelle n’est consentie au Client au-delà d’un droit non exclusif d’utilisation pour la durée du contrat.",
      p2: "Le Client concède à l’Éditeur une licence d’hébergement, de reproduction technique et d’affichage strictement nécessaires à la fourniture des Services sur les Contenus Client, pour le monde entier et pour la durée du contrat.",
    },
    personalData: {
      title: "Article 17 — Données personnelles",
      p1: "Les traitements de données à caractère personnel réalisés dans le cadre des Services sont décrits dans la politique de confidentialité accessible depuis le site. Le Client et l’Éditeur peuvent définir leurs rôles respectifs (responsable / sous-traitant) dans un DPA lorsque le Client agit comme responsable de traitement pour les données des Utilisateurs ou des visiteurs.",
      p2: "Le Client informe les personnes concernées conformément aux obligations qui lui incombent et coopère avec l’Éditeur en cas de demande d’exercice de droits ou d’autorité compétente, dans le respect du secret professionnel et de la sécurité.",
    },
    serviceModification: {
      title: "Article 18 — Évolution du Service et des CGV",
      p1: "L’Éditeur peut adapter les présentes CGV pour tenir compte de l’évolution légale, technique ou économique. La version applicable est celle en vigueur à la date de la Commande ou du renouvellement tacite, sauf information contraire avant effet.",
      p2: "Pour les Clients en Abonnement, une modification substantielle peut être notifiée par courrier électronique ou bannière d’information ; si le Client refuse la modification, il peut résilier sans frais à l’échéance suivant la notification, dans le délai indiqué dans ladite notification.",
    },
    termination: {
      title: "Article 19 — Résiliation — Suspension",
      p1: "Chaque partie peut résilier le contrat en cas de manquement grave de l’autre partie non réparé dans un délai de trente (30) jours après mise en demeure raisonnée, sauf obligation de paiement impérieuse ou mesures conservatoires.",
      p2: "L’Éditeur peut suspendre immédiatement l’accès en cas d’atteinte manifeste à la sécurité, d’utilisation abusive, ou d’ordre administratif ou judiciaire.",
      p3: "La résiliation ou l’expiration du contrat n’affecte pas les obligations de paiement nées antérieurement ni les clauses destinées à survivre (confidentialité, propriété intellectuelle, limitation de responsabilité dans les limites légales, litiges).",
    },
    forceMajeure: {
      title: "Article 20 — Force majeure",
      p1: "Aucune partie ne pourra être tenue responsable d’un retard ou d’une inexécution dû à un événement de force majeure au sens de l’article 1218 du Code civil, dès lors qu’il est hors de son contrôle raisonnable et qu’il empêche l’exécution (catastrophe naturelle, incendie, panne généralisée d’Internet, cyber-attaque majeure, grève générale, décision administrative). L’obligation affectée est suspendue pendant la durée de l’événement.",
    },
    disputes: {
      title: "Article 21 — Réclamations — Médiation",
      p1: "Le Client adresse ses réclamations à contact@aimediart.com avec les pièces utiles. L’Éditeur accuse réception et tente de trouver une solution amiable dans un délai raisonnable.",
      p2: "Conformément aux dispositions du Code de la consommation applicables aux consommateurs, les informations relatives au médiateur de la consommation ou à tout dispositif de règlement extrajudiciaire des litiges sont communiquées sur le site lorsqu’elles sont obligatoires. Pour les professionnels, les parties peuvent convenir d’une procédure spécifique par avenant écrit.",
    },
    applicableLaw: {
      title: "Article 22 — Droit applicable — Attribution de juridiction",
      p1: "Les présentes CGV sont soumises au droit français. En l’absence de règle imperium contraire, tout litige relatif à leur interprétation ou à leur exécution relève de la compétence des tribunaux du ressort de la cour d’appel dans le ressort du siège social de l’Éditeur, sous réserve de voies de recours particulières pour les consommateurs ou de clauses impératives de compétence.",
    },
    finalRecommendations: {
      title: "Article 23 — Recommandations finales",
      p1: "Le Client conserve la responsabilité finale des choix éditoriaux et artistiques présentés au public via le Service, y compris lorsque des outils d’intelligence artificiale assistent la création de contenus : une relecture humaine reste recommandée pour les messages sensibles.",
      p2: "Le Client archive les factures et preuves de Commande conformément à ses obligations comptables et fiscales ; l’Éditeur met à disposition des historiques dans la limite des fonctionnalités du Service et des obligations légales de conservation.",
      p3: "Pour toute précision commerciale (volume d’œuvres, trafic, options spécifiques), le Client est invité à contacter l’Éditeur avant toute décision d’investissement budgétaire majeur liée à une exposition.",
    },
  },
};

const enSections = {
  intro: {
    p1: "These General Terms of Sale (\"GTS\") govern the sale of services, subscriptions, and digital offerings provided by the Publisher under the AIMEDIArt brand (the \"Service\" or \"Services\"), available from aimediart.com or any other dedicated domain or application operated by the Publisher.",
    p2: "Any order or subscription implies the Client’s unreserved acceptance of these GTS, legal capacity to contract, and waiver of the Client’s own purchase terms, unless expressly agreed otherwise in writing by the Publisher.",
    p3: "The Client states that it holds the necessary internal authorizations (museum, gallery, cultural agency, association, local authority, etc.) to subscribe on behalf of the organization identified during the order process.",
  },
  sellerIdentity: {
    title: "Article 1 — Publisher identity",
    p1: "The Publisher of the AIMEDIArt Service is the legal entity or sole trader identified in the legal notices published on aimediart.com, reachable at contact@aimediart.com.",
    p2: "Further information (registration number, VAT ID, publication director) is provided in those legal notices, which form part of the contractual documentation.",
  },
  definitions: {
    title: "Article 2 — Definitions",
    intro: "For the purposes of these GTS, the following terms shall have the meanings below:",
    list: {
      platform: "“Platform”: the software environment, web interfaces, APIs, and technical infrastructure enabling access to AIMEDIArt Services.",
      client: "“Client”: any legal person, or natural person acting for professional purposes, subscribing to an offer or signing a Publisher quote.",
      user: "“User”: any person authorized by the Client to access the administration area or Service features.",
      services: "“Services”: all features supplied by the Publisher, including digital mediation, visualization, content management, and usage analytics related to exhibitions, according to the subscribed plan.",
      clientContent: "“Client Content”: data, text, images, files, metadata, and any material provided or imported by the Client on the Platform.",
      subscription: "“Subscription”: periodic access to Services (monthly, annual, or other as listed).",
      order: "“Order”: the act by which the Client purchases an offer, confirms a quote, or renews a Subscription with the Publisher.",
    },
  },
  documents: {
    title: "Article 3 — Contract documents",
    p1: "Applicable documents, in decreasing order of precedence, are: (1) a signed quote or purchase order if any; (2) these GTS; (3) the accepted offer or pricing sheet; (4) the privacy policy and, where applicable, a data processing agreement (DPA).",
    p2: "If a customized signed quote conflicts with these GTS, the quote prevails only for provisions expressly stated as specific.",
  },
  clientsScope: {
    title: "Article 4 — Scope and clients",
    p1: "Services are primarily intended for cultural and event professionals. Where the Client is a consumer under applicable law, mandatory consumer rights remain unaffected.",
    p2: "The Client warrants the accuracy of information provided for ordering and billing. Additional processing or re-billing costs caused by errors may be charged back after notice.",
  },
  servicesDescription: {
    title: "Article 5 — Service description",
    p1: "Key Service features (scope, usage limits, included volumes, support level) are those described on the website at order time or in the quote. The Publisher may evolve the Platform for maintenance, security, or improvement while aiming for reasonable continuity.",
    p2: "Some features may rely on third-party services (hosting, messaging, AI processing). Final availability may depend on those interconnections; the Publisher seeks to limit impact.",
    p3: "The Service may include visitor-facing mediation (e.g. via QR code). The Client remains solely responsible for editorial content and third-party rights.",
  },
  contractFormation: {
    title: "Article 6 — Contract formation",
    p1: "An online Order becomes firm after successful payment or, for quote-based offers, after electronic signature, written acceptance, or agreed validation per the Publisher’s process.",
    p2: "The Publisher may refuse an Order in case of suspected fraud, missing information, non-combinable promotion conflict, or clear technical impossibility, and refunds any wrongly collected payment promptly.",
    p3: "Order confirmation is emailed or made available in the account area and evidences the contract and main subscribed features.",
  },
  prices: {
    title: "Article 7 — Prices",
    p1: "Prices are shown in euros excluding or including tax as stated at order time. Applicable taxes are due as required by law.",
    p2: "For usage-based plans (works, visitors, scans), thresholds and rates are those of the chosen plan. Overage may be billed per published rates or agreed quote.",
    p3: "Promotions apply within stated dates and capacity. No cash discount unless expressly agreed.",
  },
  payment: {
    title: "Article 8 — Payment",
    p1: "Payment uses methods offered on the Platform (card, direct debit, transfer, or other authorized means). The Publisher may use a regulated payment service provider.",
    p2: "In case of non-payment, the Publisher may suspend access after formal notice remains unsuccessful for eight (8) days, without prejudice to statutory interest or damages where applicable.",
  },
  accessDelivery: {
    title: "Article 9 — Provision and access",
    p1: "Subject to payment, the Publisher enables access within stated timelines or, if none, within a reasonable period considering verification needs.",
    p2: "Credentials are confidential. Account use is presumed authorized by the Client, who manages Users.",
  },
  duration: {
    title: "Article 10 — Duration — Renewal",
    p1: "Subscriptions run for the selected term. Unless otherwise stated, they tacitly renew for the same term unless terminated under the “Termination” article.",
    p2: "The Client may terminate at renewal from the account area or by email per Platform instructions.",
    p3: "One-off services end upon completion described in the quote or Order, subject to legal warranties.",
  },
  rightOfWithdrawal: {
    title: "Article 11 — Right of withdrawal (if applicable)",
    p1: "Where the Client is a consumer with a statutory withdrawal right for distance contracts, legal information (time limit, procedure, form) is provided before ordering.",
    p2: "Where the Client expressly requests immediate performance of a digital service and validly waivers withdrawal per law, performance may begin accordingly and withdrawal may cease for the executed portion within legal limits.",
  },
  clientObligations: {
    title: "Article 12 — Client obligations",
    intro: "The Client shall in particular:",
    list: {
      item1: "provide accurate, up-to-date information for performance and billing;",
      item2: "not compromise Platform security or exceed quotas;",
      item3: "hold necessary rights to Client Content and indemnify the Publisher against third-party claims;",
      item4: "comply with applicable law (data protection, copyright, visitor rules where relevant);",
      item5: "inform Users of relevant internal confidentiality rules.",
    },
  },
  providerObligations: {
    title: "Article 13 — Publisher obligations",
    intro: "The Publisher shall:",
    list: {
      item1: "deliver Services diligently per the contractual description;",
      item2: "apply reasonable security measures unless force majeure or Client-exclusive fault;",
      item3: "notify planned significant downtime when feasible;",
      item4: "support the Client within the limits of the subscribed plan;",
      item5: "process personal data per the privacy policy and any DPA.",
    },
  },
  warranty: {
    title: "Article 14 — Warranties",
    p1: "Services are provided “as is” and “as available” within published features. The Publisher does not warrant zero minor defects or fitness for an unexpressed need.",
    p2: "Mandatory consumer warranties remain fully applicable where relevant.",
  },
  liability: {
    title: "Article 15 — Liability",
    p1: "Except gross negligence or wilful misconduct, the Publisher’s aggregate liability for proven direct damage in any twelve-month period is limited to fees excluding tax actually paid for the relevant Service in the preceding twelve months.",
    p2: "Indirect damages (lost revenue, non-Publisher data loss, reputational harm) are excluded where permitted by mandatory law.",
    p3: "The Client remains responsible for its use, Client Content, and compliance regarding exhibition visitors.",
  },
  intellectualProperty: {
    title: "Article 16 — Intellectual property",
    p1: "The Platform, marks, databases, interfaces, and documentation remain the Publisher’s or licensors’ exclusive property. No IP assignment beyond a non-exclusive usage license for the contract term.",
    p2: "The Client grants the Publisher a hosting, technical reproduction, and display license strictly necessary to provide Services for the contract term worldwide.",
  },
  personalData: {
    title: "Article 17 — Personal data",
    p1: "Processing is described in the site privacy policy. Roles (controller/processor) may be set out in a DPA where the Client processes User or visitor data.",
    p2: "The Client informs data subjects as required and cooperates on rights requests and authority inquiries within legal limits.",
  },
  serviceModification: {
    title: "Article 18 — Changes to Service and GTS",
    p1: "The Publisher may update these GTS for legal, technical, or commercial reasons. The version in force at order or tacit renewal applies unless notified otherwise.",
    p2: "For subscriptions, material changes may be notified by email or banner; the Client may terminate without penalty at the next renewal within the stated period.",
  },
  termination: {
    title: "Article 19 — Termination — Suspension",
    p1: "Either party may terminate for material breach uncured within thirty (30) days after reasonable notice, subject to urgent payment obligations.",
    p2: "The Publisher may suspend immediately for manifest security risk, abuse, or legal order.",
    p3: "Termination does not affect accrued payment obligations or surviving clauses (confidentiality, IP, liability limits where legal, disputes).",
  },
  forceMajeure: {
    title: "Article 20 — Force majeure",
    p1: "Neither party is liable for delay or failure due to force majeure under applicable civil law when beyond reasonable control (natural disaster, major outage, severe cyberattack, general strike, administrative act). Affected obligations are suspended for the event duration.",
  },
  disputes: {
    title: "Article 21 — Claims — Mediation",
    p1: "Claims go to contact@aimediart.com with supporting documents. The Publisher acknowledges receipt and seeks an amicable solution within a reasonable time.",
    p2: "Consumer mediation information required by law is provided on the site where applicable. B2B parties may agree otherwise in writing.",
  },
  applicableLaw: {
    title: "Article 22 — Governing law — Jurisdiction",
    p1: "These GTS are governed by French law. Unless mandatory rules provide otherwise, disputes fall under courts of the Publisher’s registered office appellate jurisdiction, subject to consumer protections.",
  },
  finalRecommendations: {
    title: "Article 23 — Final recommendations",
    p1: "The Client remains ultimately responsible for editorial choices, including AI-assisted outputs—human review is recommended for sensitive messaging.",
    p2: "The Client should archive invoices per accounting rules; the Publisher provides history features within Service limits and legal retention duties.",
    p3: "For budget-sensitive exhibition decisions, contact the Publisher before major commitments.",
  },
};

const enFull = {
  meta: {
    title: "General Terms of Sale (GTS)",
    version: "Version 1.0 — AIMEDIArt.com — applicable to offers subscribed online or by quote, as of acceptance by the Client.",
    languageNotice:
      "This is the English translation for convenience. If there is any inconsistency, the French version prevails for interpretation unless mandatory local consumer law requires otherwise. Have your legal counsel review before final production use.",
  },
  nav: {
    back_home: "← Back to public homepage",
    language_aria: "Choose display language",
  },
  sections: enSections,
};

function withNotice(base, langLabel) {
  const copy = JSON.parse(JSON.stringify(base));
  copy.meta.languageNotice = `${langLabel} — Provisional text identical to English pending professional translation. French version prevails where applicable.`;
  return copy;
}

for (const [lang, data] of Object.entries({ fr, en: enFull })) {
  writeFileSync(join(localesRoot, lang, "cgv.json"), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
writeFileSync(join(localesRoot, "de", "cgv.json"), `${JSON.stringify(withNotice(enFull, "DE"), null, 2)}\n`, "utf8");
writeFileSync(join(localesRoot, "es", "cgv.json"), `${JSON.stringify(withNotice(enFull, "ES"), null, 2)}\n`, "utf8");
writeFileSync(join(localesRoot, "it", "cgv.json"), `${JSON.stringify(withNotice(enFull, "IT"), null, 2)}\n`, "utf8");

console.log("cgv.json written for fr, en, de, es, it");

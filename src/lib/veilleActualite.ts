/**
 * Veille actualité AIMEDIArt — IA & médiation d’exposition.
 * Fusion : mail du 22/07/2026 ~17h + complément utilisateur.
 * Tri : date ISO décroissante (plus récent en premier).
 */

export type VeilleActualiteItem = {
  id: string;
  /** YYYY-MM-DD approximatif pour le tri */
  date: string;
  dateLabel: string;
  category: string;
  title: string;
  summary: string;
  sourceLabel: string;
  sourceUrl: string;
};

export const VEILLE_ACTUALITE_ITEMS: VeilleActualiteItem[] = [
  {
    id: "heritage-science-2026-07",
    date: "2026-07-14",
    dateLabel: "14 juillet 2026",
    category: "Immersion et valorisation du patrimoine",
    title: "Restauration numérique de façades historiques (shape grammar + Stable Diffusion)",
    summary:
      "Publication dans npj Heritage Science : cadre fusionnant grammaire de forme, LoRA/ControlNet et reconstruction 3D pour une restauration plus documentée.",
    sourceLabel: "Nature — npj Heritage Science",
    sourceUrl: "https://www.nature.com/articles/s40494-026-02794-z",
  },
  {
    id: "borealis-2026-07",
    date: "2026-07-13",
    dateLabel: "Juillet 2026",
    category: "Avatars et dialogues interactifs",
    title: "Musée Boréalis : expérience « Votre parcours, votre histoire »",
    summary:
      "Intégration de personnages propulsés par l’IA qui guident les visiteurs via des anecdotes. L’IA adapte son niveau de langage (vulgarisation pour les enfants, par exemple) pour rendre la visite plus inclusive.",
    sourceLabel: "L’Hebdo Journal",
    sourceUrl: "https://www.lhebdojournal.com/culture/lia-debarque-au-musee-borealis/",
  },
  {
    id: "marine-pev-2026-07",
    date: "2026-07-08",
    dateLabel: "8 juillet – 30 août 2026",
    category: "Immersion et valorisation du patrimoine",
    title: "Musée national de la Marine : immersion Paul-Émile Victor assistée par IA",
    summary:
      "À Paris-Trocadéro, dispositif immersif 360° avec paysages et dessins assistés par IA, en collaboration avec les ayants droit. Séances de 10 minutes, billetterie dédiée.",
    sourceLabel: "Musée de la Marine",
    sourceUrl:
      "https://www.musee-marine.fr/nos-musees/paris/expositions-et-evenements/les-expositions/explorer-le-groenland-avec-paul-emile-victor-une-experience-immersive.html",
  },
  {
    id: "acmi-reverb-2026-05",
    date: "2026-05-22",
    dateLabel: "22 mai 2026",
    category: "Accessibilité et inclusion",
    title: "ACMI (Melbourne) : labels numériques, sous-titres sync et traductions IA",
    summary:
      "Pour Reverb, ACMI Labs décrit un pipeline Whisper + traduction cloud avec relecture humaine, QR vers captions synchronisées et labels multilingues (chinois simplifié, hindi, punjabi).",
    sourceLabel: "ACMI Labs",
    sourceUrl:
      "https://medium.com/acmi-labs/digital-labels-synced-captions-and-ai-translations-3e980ca62854",
  },
  {
    id: "rennes-ia-2026-05",
    date: "2026-05-20",
    dateLabel: "Mai 2026",
    category: "Pédagogie et recherche",
    title: "Université de Rennes & Musée des Transmissions : exposition « Qu’est-ce qu’IA ? »",
    summary:
      "Un projet de médiation scientifique visant à démystifier l’IA. L’exposition combine des pôles historiques et des ateliers interactifs pour expliquer concrètement le fonctionnement du machine learning et des réseaux de neurones. Version numérique pour scolaires, itinérance en Bretagne jusqu’en 2027.",
    sourceLabel: "Université de Rennes",
    sourceUrl:
      "https://intelligence-artificielle.univ-rennes.fr/actualites/top-depart-pour-quest-ce-quia",
  },
  {
    id: "urania-muse-2026-03",
    date: "2026-03-17",
    dateLabel: "17 mars 2026",
    category: "Avatars et dialogues interactifs",
    title: "UranIA : assistant IA sur WhatsApp au MUSE de Trente",
    summary:
      "Le Museo delle Scienze de Trente a ouvert UranIA, un guide conversationnel sans application via WhatsApp. Les réponses s’appuient sur une knowledge base validée ; hors périmètre, renvoi vers les médiateurs humains. Multilingue (IT/DE/EN).",
    sourceLabel: "muse.it — UranIA",
    sourceUrl: "https://www.muse.it/en/events/urania-explore-engage-discover-2026/",
  },
  {
    id: "leeds-alienor-2026-03",
    date: "2026-03-09",
    dateLabel: "Mars 2026",
    category: "Avatars et dialogues interactifs",
    title: "Château de Leeds : dialogue avec la reine Aliénor de Castille",
    summary:
      "L’installation « Une audience avec une reine » permet aux visiteurs de converser avec un avatar IA historique. Le système détecte la présence du visiteur et répond en vidéo à ses questions, basé sur des recherches historiques minutieuses.",
    sourceLabel: "Club Innovation & Culture",
    sourceUrl:
      "https://www.club-innovation-culture.fr/avatar-interactif-intelligence-artificielle-dialogue-visiteurs-nouvelle-exposition-chateau-leeds/",
  },
  {
    id: "atrium-destination-ia-2026-02",
    date: "2026-02-12",
    dateLabel: "Février 2026",
    category: "Immersion et valorisation du patrimoine",
    title: "L’Atrium de Rouen : exposition « Destination IA »",
    summary:
      "Une exposition pédagogique qui utilise l’IA pour recomposer numériquement la Tapisserie de Bayeux dans un espace de projection à 360°, tout en sensibilisant le public aux enjeux éthiques et écologiques de la technologie.",
    sourceLabel: "Tendance Ouest",
    sourceUrl:
      "https://www.tendanceouest.com/actualite-436430-photos-rouen-destination-ia-une-vaste-exposition-sur-l-intelligence-artificielle-normande-a-decouvrir-a-l-atrium",
  },
  {
    id: "bormes-cartes-2026-02",
    date: "2026-02-07",
    dateLabel: "Février 2026",
    category: "Immersion et valorisation du patrimoine",
    title: "Musée d’Histoire et d’Art de Bormes-les-Mimosas : cartes postales animées",
    summary:
      "Dans le cadre de l’exposition « Bormes, Couleurs d’un siècle », l’IA est utilisée pour animer des cartes postales anciennes, redonnant vie à des images figées du passé pour enrichir le récit mémoriel.",
    sourceLabel: "Nice Matin",
    sourceUrl:
      "https://www.nicematin.com/culture/neo-impressionnisme-temoignages-intelligence-artificielle-cette-exposition-anniversaire-celebre-100-ans-de-creation-a-bormes-les-mimosas-10668323",
  },
  {
    id: "visit-brussels-ia-2026",
    date: "2026-01-15",
    dateLabel: "Préparation 2026",
    category: "Accessibilité et inclusion",
    title: "Traduction assistée par IA pour les musées bruxellois (visit.brussels / FEDER)",
    summary:
      "Projet régional BYOD : traduction texte/audio vers les 24 langues de l’UE (+ langues locales), sans app ; sélection fournisseur en 2026, premiers déploiements début 2027.",
    sourceLabel: "visit.brussels",
    sourceUrl:
      "https://www.visit.brussels/en/professionals/partners/projet-feder-/traduction-assistee-par-ia-dans-les-musees-bruxellois-",
  },
  {
    id: "montsoreau-chatgpt-2025-04",
    date: "2025-04-25",
    dateLabel: "Avril 2025",
    category: "L’IA comme commissaire et conceptrice",
    title: "Château de Montsoreau : ChatGPT commissaire d’exposition",
    summary:
      "Pour la première fois en France, une IA (ChatGPT) a assuré la totalité du commissariat d’une exposition sur le collectif Art & Language. Elle a géré l’élaboration conceptuelle, la structuration thématique et l’interprétation critique, questionnant ainsi l’autorité traditionnelle du commissaire d’exposition.",
    sourceLabel: "Château de Montsoreau",
    sourceUrl:
      "https://www.chateau-montsoreau.com/wordpress/portfolio-item/exposition-art-language-entretien-avec-un-humoriste-obeissant-25-04-01-07-2025/",
  },
  {
    id: "flv-twelvy-2025-02",
    date: "2025-02-07",
    dateLabel: "Février 2025",
    category: "Avatars et dialogues interactifs",
    title: "Fondation Louis Vuitton : guide virtuel Twelvy",
    summary:
      "Utilisation d’un chatbot IA pour offrir des parcours personnalisés (ex. parcours famille) et répondre instantanément aux questions sur les œuvres et l’architecture durant la visite.",
    sourceLabel: "Club Innovation & Culture",
    sourceUrl:
      "https://www.club-innovation-culture.fr/dossier-france-utilisation-intelligence-artificielle-musees-lieux-patrimoine/",
  },
].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

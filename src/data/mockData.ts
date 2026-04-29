export interface Artist {
  id: string;
  name: string;
  firstName: string;
  pseudo?: string;
  bio: string;
  photo: string;
  email: string;
  artType: string;
}

export interface Artwork {
  artwork_id: string;
  artwork_title: string;
  artwork_description: string;
  artwork_photo_url: string;
  artwork_qr_code_url?: string;
  artwork_qrcode_image?: string;
  artwork_total_visites: number;
  artwork_moyenne_coeurs: number;
  artwork_artist_id: string;
  artwork_expo_id: string;
  status: "active" | "inactive";
}

export interface Expo {
  id: string;
  expo_name: string;
  lieuExpo: string;
  logoExpo?: string;
  agency_id: string;
}

export interface Emotion {
  id: string;
  name: string;
  icon: string;
  percentage: number;
  color: string;
}

export interface PromptStyle {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const artists: Artist[] = [
  {
    id: "a1",
    name: "Camus",
    firstName: "Jean-Yves",
    bio: "Artiste contemporain explorant les frontières entre abstraction géométrique et émotion pure. Son travail questionne la perception visuelle à travers des compositions audacieuses.",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face",
    email: "jy.camus@art.fr",
    artType: "Art abstrait",
  },
  {
    id: "a2",
    name: "Guiot",
    firstName: "Damien",
    bio: "Photographe et plasticien dont l'œuvre célèbre la beauté sauvage de la nature. Ses installations immersives transportent le spectateur au cœur des forêts.",
    photo: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face",
    email: "d.guiot@art.fr",
    artType: "Photographie",
  },
  {
    id: "a3",
    name: "Moreau",
    firstName: "Claire",
    bio: "Sculptrice et vidéaste, Claire Moreau crée des œuvres qui interrogent le silence et la mémoire collective. Son art minimaliste invite à la contemplation.",
    photo: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face",
    email: "c.moreau@art.fr",
    artType: "Sculpture",
  },
  {
    id: "a4",
    name: "Dubois",
    firstName: "Marc",
    bio: "Peintre paysagiste revisitant les codes de l'impressionnisme avec une palette contemporaine. Ses toiles capturent la lumière éphémère des rivières et des crépuscules.",
    photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face",
    email: "m.dubois@art.fr",
    artType: "Peinture",
  },
];

export const artworks: Artwork[] = [
  {
    artwork_id: "w1",
    artwork_title: "L'Éclat du Crépuscule",
    artwork_description: "Cette œuvre capture la lumière dorée d'un coucher de soleil. Les couleurs chaudes créent une atmosphère paisible et contemplative.",
    artwork_photo_url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=400&fit=crop",
    artwork_total_visites: 17,
    artwork_moyenne_coeurs: 4.0,
    artwork_artist_id: "a4",
    artwork_expo_id: "e1",
    status: "active",
  },
  {
    artwork_id: "w2",
    artwork_title: "Fragments d'Infini",
    artwork_description: "Cette œuvre est abstraite. Elle montre des formes bleues. Les formes semblent flotter dans l'espace.",
    artwork_photo_url: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&h=400&fit=crop",
    artwork_total_visites: 75,
    artwork_moyenne_coeurs: 3.8,
    artwork_artist_id: "a1",
    artwork_expo_id: "e1",
    status: "active",
  },
  {
    artwork_id: "w3",
    artwork_title: "La Mémoire des Pierres",
    artwork_description: "Des pierres anciennes racontent une histoire. Chaque pierre porte la marque du temps. L'artiste nous invite à écouter leur silence.",
    artwork_photo_url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&h=400&fit=crop",
    artwork_total_visites: 52,
    artwork_moyenne_coeurs: 3.5,
    artwork_artist_id: "a3",
    artwork_expo_id: "e1",
    status: "active",
  },
  {
    artwork_id: "w4",
    artwork_title: "Voix du Silence",
    artwork_description: "Une installation qui joue avec la lumière et l'ombre. Le silence devient visible. Les formes apparaissent et disparaissent doucement.",
    artwork_photo_url: "https://images.unsplash.com/photo-1482245294234-b3f2f8d5f1a4?w=600&h=400&fit=crop",
    artwork_total_visites: 43,
    artwork_moyenne_coeurs: 4.2,
    artwork_artist_id: "a3",
    artwork_expo_id: "e2",
    status: "active",
  },
  {
    artwork_id: "w5",
    artwork_title: "Entre Deux Rives",
    artwork_description: "Un paysage entre terre et eau. La rivière sépare deux mondes. L'artiste nous montre la beauté de ce passage.",
    artwork_photo_url: "https://images.unsplash.com/photo-1440342359743-84fcb8c21c7c?w=600&h=400&fit=crop",
    artwork_total_visites: 38,
    artwork_moyenne_coeurs: 3.9,
    artwork_artist_id: "a4",
    artwork_expo_id: "e2",
    status: "active",
  },
  {
    artwork_id: "w6",
    artwork_title: "Amitié",
    artwork_description: "Une photographie célébrant les liens invisibles entre les êtres. La forêt devient métaphore de la connexion humaine.",
    artwork_photo_url: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&h=400&fit=crop",
    artwork_total_visites: 95,
    artwork_moyenne_coeurs: 4.5,
    artwork_artist_id: "a2",
    artwork_expo_id: "e1",
    status: "active",
  },
  {
    artwork_id: "w7",
    artwork_title: "Le Jardin Suspendu",
    artwork_description: "Des plantes luxuriantes défient la gravité. Ce jardin imaginaire pousse vers le ciel. La nature reprend ses droits.",
    artwork_photo_url: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=600&h=400&fit=crop",
    artwork_total_visites: 60,
    artwork_moyenne_coeurs: 3.6,
    artwork_artist_id: "a2",
    artwork_expo_id: "e2",
    status: "active",
  },
];

export const expos: Expo[] = [
  { id: "e1", expo_name: "Starting Block - Test", lieuExpo: "Galerie Centrale", agency_id: "ag1" },
  { id: "e2", expo_name: "NOP Galerie", lieuExpo: "Espace Nord", agency_id: "ag1" },
  { id: "e3", expo_name: "Octroi", lieuExpo: "Pavillon Est", agency_id: "ag2" },
];

export const emotions: Emotion[] = [
  { id: "em1", name: "Émerveillé", icon: "✨", percentage: 72, color: "hsl(38, 70%, 50%)" },
  { id: "em2", name: "Touché", icon: "💫", percentage: 55, color: "hsl(0, 65%, 48%)" },
  { id: "em3", name: "Intrigué", icon: "🔍", percentage: 40, color: "hsl(200, 60%, 50%)" },
  { id: "em4", name: "Apaisé", icon: "🌿", percentage: 30, color: "hsl(140, 45%, 45%)" },
  { id: "em5", name: "Troublé", icon: "🌊", percentage: 18, color: "hsl(260, 45%, 50%)" },
  { id: "em6", name: "Amusé", icon: "😄", percentage: 48, color: "hsl(30, 80%, 55%)" },
];

export const promptStyles: PromptStyle[] = [
  { id: "ps1", name: "L'expert", icon: "🎓", description: "Analyse académique et détaillée" },
  { id: "ps2", name: "Le senior", icon: "👴", description: "Sagesse et expérience de vie" },
  { id: "ps3", name: "Le pote", icon: "🤙", description: "Décontracté et familier" },
  { id: "ps4", name: "Le conteur", icon: "📖", description: "Narration immersive" },
  { id: "ps5", name: "Le Hip-hopeur", icon: "🎤", description: "Style street et rythmé" },
  { id: "ps6", name: "L'enfant de 5 ans", icon: "👶", description: "Simple et émerveillé" },
  { id: "ps7", name: "L'inclusif", icon: "♿", description: "FALC — Facile à lire et à comprendre" },
  { id: "ps8", name: "Le poète", icon: "🌹", description: "Lyrique et sensible" },
];

export const getArtistById = (id: string) => artists.find((a) => a.id === id);
export const getExpoById = (id: string) => expos.find((e) => e.id === id);
export const getArtworksByArtist = (artistId: string) =>
  artworks.filter((a) => a.artwork_artist_id === artistId);
export const getArtworksByExpo = (expoId: string) =>
  artworks.filter((a) => a.artwork_expo_id === expoId);

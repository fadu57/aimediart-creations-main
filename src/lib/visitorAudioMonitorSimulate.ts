import type { VisitorAudioPresenceRow } from "@/lib/visitorAudioSession";

const ARTWORK_TITLES = [
  "Custines",
  "Le Pont Neuf",
  "Nature morte aux pivoines",
  "Soleil couchant sur la Loire",
  "Abstraction bleue n°7",
  "Portrait de l'artiste",
  "La grange rouge",
  "Reflets sur l'eau",
];

const PSEUDO_STEMS = ["Gorille", "Pingouin", "Loutre", "Fennec", "Koala", "Lynx", "Hibou", "Renard"];

function pseudoForIndex(index: number): string {
  const stem = PSEUDO_STEMS[index % PSEUDO_STEMS.length];
  const flavors = ["Délicat", "Curieux", "Zen", "Vif", "Calme", "Agile", "Rêveur"];
  const flavor = flavors[(index * 2) % flavors.length];
  return `${stem}${flavor}${100 + (index % 900)}`;
}

function uuidFromIndex(prefix: string, index: number): string {
  const hex = (index + 1).toString(16).padStart(12, "0");
  return `${prefix.slice(0, 8)}-0000-4000-8000-${hex}`;
}

/** Génère des lignes fictives pour prévisualiser une forte affluence (admin). */
export function buildSimulatedAudioPresenceRows(
  count: number,
  expoId: string,
): VisitorAudioPresenceRow[] {
  const safeCount = Math.min(Math.max(count, 1), 500);
  const now = Date.now();

  return Array.from({ length: safeCount }, (_, index) => {
    const seenAt = new Date(now - index * 2_500).toISOString();
    return {
      id: uuidFromIndex("aaaaaaaa", index),
      visitor_client_id: uuidFromIndex("dea31163", index),
      visitor_pseudo: pseudoForIndex(index),
      expo_id: expoId,
      artwork_id: uuidFromIndex("3eb92fed", index),
      artwork_title: ARTWORK_TITLES[index % ARTWORK_TITLES.length],
      page_url: null,
      headphones_detected: null,
      audio_consent_acknowledged: index % 6 !== 0,
      banned_at: index % 53 === 0 ? seenAt : null,
      last_seen_at: seenAt,
      created_at: seenAt,
    };
  });
}

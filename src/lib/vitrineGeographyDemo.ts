import type { VisitorGeoTableRow } from "@/lib/statisticsVisitorGeography";

/** Données fictives pour la vitrine publique — aucune donnée réelle de visiteur. */
export const VITRINE_GEO_DEMO_ROWS: VisitorGeoTableRow[] = [
  demoVisitor("demo-paris", "Paris", "75011", 48.8566, 2.3522),
  demoVisitor("demo-lyon", "Lyon", "69002", 45.764, 4.8357),
  demoVisitor("demo-bordeaux", "Bordeaux", "33000", 44.8378, -0.5792),
  demoVisitor("demo-toulouse", "Toulouse", "31000", 43.6047, 1.4442),
  demoVisitor("demo-lille", "Lille", "59000", 50.6292, 3.0573),
  demoVisitor("demo-marseille", "Marseille", "13001", 43.2965, 5.3698),
  demoVisitor("demo-nantes", "Nantes", "44000", 47.2184, -1.5536),
  demoVisitor("demo-strasbourg", "Strasbourg", "67000", 48.5734, 7.7521),
];

function demoVisitor(
  key: string,
  city: string,
  zipCode: string,
  latitude: number,
  longitude: number,
): VisitorGeoTableRow {
  return {
    visitorKey: key,
    label: city,
    firstName: null,
    lastName: null,
    pseudo: `Visiteur · ${city}`,
    adressePostale: null,
    avatarUrl: null,
    selfieUrl: null,
    city,
    zipCode,
    country: "FR",
    region: null,
    latitude,
    longitude,
    source: "ip",
    ipAddress: null,
    participantKind: "visitor",
  };
}

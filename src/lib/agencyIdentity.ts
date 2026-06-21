/** Colonnes identité juridique — bloc dédié dans AgencyFormDialog. */
export const AGENCY_IDENTITY_KEYS = [
  "structure_category",
  "structure_type",
  "siret",
  "legal_rep_firstname",
  "legal_rep_lastname",
  "legal_rep_role",
] as const;

export type AgencyStructureCategory = (typeof AGENCY_STRUCTURE_CATEGORIES)[number]["value"];
export type AgencyStructureType = (typeof AGENCY_STRUCTURE_TYPES)[number]["value"];
export type AgencyLegalRepRole = (typeof AGENCY_LEGAL_REP_ROLES)[number]["value"];

export const AGENCY_STRUCTURE_CATEGORIES = [
  { value: "private_lucratif", label: "Structures privées à but lucratif (Entreprises)" },
  { value: "private_non_lucratif", label: "Structures privées à but non lucratif" },
  { value: "public_parapublic", label: "Organismes publics et parapublics" },
] as const;

export const AGENCY_STRUCTURE_TYPES = [
  { value: "societe_commerciale", label: "Sociétés commerciales", category: "private_lucratif" },
  { value: "entreprise_individuelle", label: "Entreprises individuelles", category: "private_lucratif" },
  { value: "societe_civile", label: "Sociétés civiles", category: "private_lucratif" },
  { value: "profession_liberale", label: "Professions libérales", category: "private_lucratif" },
  { value: "association", label: "Associations", category: "private_non_lucratif" },
  { value: "fondation", label: "Fondations", category: "private_non_lucratif" },
  { value: "fonds_dotation", label: "Fonds de dotation", category: "private_non_lucratif" },
  { value: "administration_etat", label: "Administrations d'État", category: "public_parapublic" },
  { value: "collectivite_territoriale", label: "Collectivités territoriales", category: "public_parapublic" },
  { value: "etablissement_public", label: "Établissements publics", category: "public_parapublic" },
] as const;

export const AGENCY_LEGAL_REP_ROLES = [
  { value: "gerant", label: "Gérant(e)" },
  { value: "president", label: "Président(e)" },
  { value: "president_dg", label: "Président(e)-Directeur(trice) général(e)" },
  { value: "president_ca", label: "Président(e) du conseil d'administration" },
  { value: "directeur_general", label: "Directeur(trice) Général(e)" },
  { value: "maire", label: "Maire" },
  { value: "president_conseil_departemental", label: "Président(e) du Conseil départemental" },
  { value: "president_conseil_regional", label: "Président(e) du Conseil régional" },
  { value: "dgs", label: "Directeur(trice) Général(e) des Services (DGS)" },
  { value: "directeur", label: "Directeur(trice)" },
] as const;

const LUCRATIF_ROLES: AgencyLegalRepRole[] = [
  "gerant",
  "president",
  "president_dg",
  "president_ca",
  "directeur_general",
];

const TERRITORIAL_ROLES: AgencyLegalRepRole[] = [
  "maire",
  "president_conseil_departemental",
  "president_conseil_regional",
  "dgs",
];

const STANDARD_ROLES: AgencyLegalRepRole[] = ["president", "directeur"];

export function isAgencyIdentityFormKey(key: string): boolean {
  return (AGENCY_IDENTITY_KEYS as readonly string[]).includes(key);
}

export function defaultAgencyIdentityValues(): Record<string, string> {
  return {
    structure_category: "",
    structure_type: "",
    siret: "",
    legal_rep_firstname: "",
    legal_rep_lastname: "",
    legal_rep_role: "",
  };
}

export function structureTypesForCategory(category: string): AgencyStructureType[] {
  const c = category.trim();
  if (!c) return [];
  return AGENCY_STRUCTURE_TYPES.filter((t) => t.category === c).map((t) => t.value);
}

export function legalRepRolesForStructureType(type: string): AgencyLegalRepRole[] {
  const t = type.trim();
  if (!t) return [];
  if (t === "collectivite_territoriale") return TERRITORIAL_ROLES;
  if (
    t === "societe_commerciale" ||
    t === "entreprise_individuelle" ||
    t === "societe_civile" ||
    t === "profession_liberale"
  ) {
    return LUCRATIF_ROLES;
  }
  if (
    t === "association" ||
    t === "fondation" ||
    t === "fonds_dotation" ||
    t === "administration_etat" ||
    t === "etablissement_public"
  ) {
    return STANDARD_ROLES;
  }
  return [];
}

export function structureTypeLabel(value: string): string {
  return AGENCY_STRUCTURE_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function structureCategoryLabel(value: string): string {
  return AGENCY_STRUCTURE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function legalRepRoleLabel(value: string): string {
  return AGENCY_LEGAL_REP_ROLES.find((r) => r.value === value)?.label ?? value;
}

/** Extrait les 14 chiffres max (stockage DB sans espaces). */
export function parseSiretInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 14);
}

/** Affichage SIRET : XXX XXX XXX XXXXX */
export function formatSiretDisplay(digits: string): string {
  const d = parseSiretInput(digits);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 14)].filter(Boolean);
  return parts.join(" ");
}

export function validateAgencyIdentityValues(values: Record<string, string>): string | null {
  const category = (values.structure_category ?? "").trim();
  const type = (values.structure_type ?? "").trim();
  const siretDigits = parseSiretInput(values.siret ?? "");
  const role = (values.legal_rep_role ?? "").trim();

  if (category && !type) {
    return "Sélectionnez la forme juridique détaillée.";
  }
  if (type && !category) {
    return "Sélectionnez d'abord la famille de structure.";
  }
  if (type && category && !structureTypesForCategory(category).includes(type as AgencyStructureType)) {
    return "La forme juridique ne correspond pas à la famille sélectionnée.";
  }
  if (siretDigits.length > 0 && siretDigits.length !== 14) {
    return "Le SIRET doit contenir exactement 14 chiffres (format XXX XXX XXX XXXXX).";
  }
  if (role && type && !legalRepRolesForStructureType(type).includes(role as AgencyLegalRepRole)) {
    return "La qualité du responsable légal n'est pas valide pour cette structure.";
  }
  return null;
}

/** Champs organisation requis pour la convention de sponsoring. */
export const CONVENTION_REQUIRED_AGENCY_FIELDS = [
  { key: "adresse_agency", label: "Adresse" },
  { key: "zip_agency", label: "Code postal" },
  { key: "city_agency", label: "Ville" },
  { key: "siret", label: "SIRET" },
  { key: "legal_rep_firstname", label: "Prénom du représentant légal" },
  { key: "legal_rep_lastname", label: "Nom du représentant légal" },
  { key: "legal_rep_role", label: "Qualité du représentant légal" },
] as const;

export function listMissingConventionAgencyFields(
  agency: Record<string, string | null | undefined> | null | undefined,
): string[] {
  if (!agency) return CONVENTION_REQUIRED_AGENCY_FIELDS.map((field) => field.label);
  return CONVENTION_REQUIRED_AGENCY_FIELDS.filter(({ key }) => !(agency[key] ?? "").trim()).map(
    ({ label }) => label,
  );
}

function formatFrenchList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

export function formatMissingConventionFieldsSentence(missingLabels: string[]): string {
  if (missingLabels.length === 0) {
    return "Votre fiche organisation contient les informations requises.";
  }
  return `merci de compléter les champs manquants dans votre fiche organisation suivants : ${formatFrenchList(missingLabels)}.`;
}

export function appendAgencyIdentityPayload(
  payload: Record<string, unknown>,
  values: Record<string, string>,
): void {
  for (const key of AGENCY_IDENTITY_KEYS) {
    const raw = values[key] ?? "";
    if (key === "siret") {
      const digits = parseSiretInput(raw);
      payload[key] = digits.length === 14 ? digits : digits.length === 0 ? null : digits;
      continue;
    }
    const t = raw.trim();
    payload[key] = t === "" ? null : t;
  }
}

import i18n from "@/i18n/instance";

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

/** Valeurs stockées en DB — libellés via i18n `agencies.identity.*`. */
export const AGENCY_STRUCTURE_CATEGORIES = [
  { value: "private_lucratif" },
  { value: "private_non_lucratif" },
  { value: "public_parapublic" },
] as const;

export const AGENCY_STRUCTURE_TYPES = [
  { value: "societe_commerciale", category: "private_lucratif" },
  { value: "entreprise_individuelle", category: "private_lucratif" },
  { value: "societe_civile", category: "private_lucratif" },
  { value: "profession_liberale", category: "private_lucratif" },
  { value: "association", category: "private_non_lucratif" },
  { value: "fondation", category: "private_non_lucratif" },
  { value: "fonds_dotation", category: "private_non_lucratif" },
  { value: "administration_etat", category: "public_parapublic" },
  { value: "collectivite_territoriale", category: "public_parapublic" },
  { value: "etablissement_public", category: "public_parapublic" },
] as const;

export const AGENCY_LEGAL_REP_ROLES = [
  { value: "gerant" },
  { value: "president" },
  { value: "president_dg" },
  { value: "president_ca" },
  { value: "directeur_general" },
  { value: "maire" },
  { value: "president_conseil_departemental" },
  { value: "president_conseil_regional" },
  { value: "dgs" },
  { value: "directeur" },
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

function agenciesT(key: string, defaultValue: string): string {
  return i18n.t(key, { ns: "agencies", defaultValue });
}

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
  if (!AGENCY_STRUCTURE_TYPES.some((t) => t.value === value)) return value;
  return agenciesT(`identity.types.${value}`, value);
}

export function structureCategoryLabel(value: string): string {
  if (!AGENCY_STRUCTURE_CATEGORIES.some((c) => c.value === value)) return value;
  return agenciesT(`identity.categories.${value}`, value);
}

export function legalRepRoleLabel(value: string): string {
  if (!AGENCY_LEGAL_REP_ROLES.some((r) => r.value === value)) return value;
  return agenciesT(`identity.roles.${value}`, value);
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
    return agenciesT(
      "identity.validation.type_required",
      "Sélectionnez la forme juridique détaillée.",
    );
  }
  if (type && !category) {
    return agenciesT(
      "identity.validation.category_required",
      "Sélectionnez d'abord la famille de structure.",
    );
  }
  if (type && category && !structureTypesForCategory(category).includes(type as AgencyStructureType)) {
    return agenciesT(
      "identity.validation.type_mismatch",
      "La forme juridique ne correspond pas à la famille sélectionnée.",
    );
  }
  if (siretDigits.length > 0 && siretDigits.length !== 14) {
    return agenciesT(
      "identity.validation.siret_length",
      "Le SIRET doit contenir exactement 14 chiffres (format XXX XXX XXX XXXXX).",
    );
  }
  if (role && type && !legalRepRolesForStructureType(type).includes(role as AgencyLegalRepRole)) {
    return agenciesT(
      "identity.validation.role_invalid",
      "La qualité du responsable légal n'est pas valide pour cette structure.",
    );
  }
  return null;
}

/** Champs organisation requis pour la convention de sponsoring. */
export const CONVENTION_REQUIRED_AGENCY_FIELDS = [
  { key: "adresse_agency", labelKey: "fields.adresse_agency" },
  { key: "zip_agency", labelKey: "fields.zip_agency" },
  { key: "city_agency", labelKey: "fields.city_agency" },
  { key: "siret", labelKey: "fields.siret" },
  { key: "legal_rep_firstname", labelKey: "fields.legal_rep_firstname" },
  { key: "legal_rep_lastname", labelKey: "fields.legal_rep_lastname" },
  { key: "legal_rep_role", labelKey: "fields.legal_rep_role" },
] as const;

export function listMissingConventionAgencyFields(
  agency: Record<string, string | null | undefined> | null | undefined,
): string[] {
  const labelFor = (labelKey: string) => agenciesT(labelKey, labelKey);
  if (!agency) return CONVENTION_REQUIRED_AGENCY_FIELDS.map((field) => labelFor(field.labelKey));
  return CONVENTION_REQUIRED_AGENCY_FIELDS.filter(({ key }) => !(agency[key] ?? "").trim()).map(
    ({ labelKey }) => labelFor(labelKey),
  );
}

function formatLocalizedList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  const andWord = agenciesT("identity.convention.list_and", "et");
  if (items.length === 2) return `${items[0]} ${andWord} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${andWord} ${items[items.length - 1]}`;
}

export function formatMissingConventionFieldsSentence(missingLabels: string[]): string {
  if (missingLabels.length === 0) {
    return agenciesT(
      "identity.convention.complete",
      "Votre fiche organisation contient les informations requises.",
    );
  }
  return i18n.t("identity.convention.missing", {
    ns: "agencies",
    fields: formatLocalizedList(missingLabels),
    defaultValue:
      "merci de compléter les champs manquants dans votre fiche organisation suivants : {{fields}}.",
  });
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

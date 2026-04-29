/** PostgREST peut renvoyer `agencies` comme objet ou tableau selon la relation. */
export const AGENCY_NAME_MISSING = "NOM_DE_L_AGENCE_INTROUVABLE";

type AgencyRow = {
  name_agency?: string | null;
};

export function resolveAgencyName(agencies: AgencyRow | AgencyRow[] | null | undefined): string {
  if (agencies == null) return AGENCY_NAME_MISSING;
  if (Array.isArray(agencies)) {
    const name = agencies[0]?.name_agency?.trim();
    return name ? name : AGENCY_NAME_MISSING;
  }
  const name = agencies.name_agency?.trim();
  return name ? name : AGENCY_NAME_MISSING;
}

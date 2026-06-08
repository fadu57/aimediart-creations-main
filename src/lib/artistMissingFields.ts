import type { TFunction } from "i18next";

export type ArtistMissingFieldsRow = {
  artist_firstname?: string | null;
  artist_lastname?: string | null;
  artist_typ?: string | null;
  artist_birth_date?: string | null;
  artist_death_date?: string | null;
  artist_vivant?: boolean | null;
  artist_pays?: string | null;
  pays?: string | null;
  artist_adresse?: string | null;
  artist_adresse2?: string | null;
  artist_address?: string | null;
  artist_zipcode?: string | null;
  artist_ville?: string | null;
  artist_city?: string | null;
  artist_email?: string | null;
  artist_phone?: string | null;
};

export type MissingArtistFieldId =
  | "firstname"
  | "lastname"
  | "art_types"
  | "birth_date"
  | "death_date"
  | "full_address"
  | "address"
  | "address_line2"
  | "zipcode"
  | "city"
  | "country"
  | "phone"
  | "email";

type MissingFieldHintKey = "missing_field_hint_birthdate" | "missing_field_hint_email";

export type MissingArtistFieldItem = {
  id: MissingArtistFieldId;
  label: string;
  hintKey?: MissingFieldHintKey;
};

const FIELD_HINT_KEYS: Partial<Record<MissingArtistFieldId, MissingFieldHintKey>> = {
  birth_date: "missing_field_hint_birthdate",
  email: "missing_field_hint_email",
};

function isBlank(value: string | null | undefined): boolean {
  return !(value ?? "").trim();
}

function hasArtistTyp(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  if (raw.includes("|")) {
    return raw.split("|").some((part) => part.trim().length > 0);
  }
  return true;
}

function pushMissing(
  missing: MissingArtistFieldItem[],
  id: MissingArtistFieldId,
  label: string,
): void {
  missing.push({ id, label, hintKey: FIELD_HINT_KEYS[id] });
}

/** Champs vides (hors pseudo), dans l’ordre du formulaire, avec infobulle optionnelle. */
export function getMissingArtistFieldItems(
  artist: ArtistMissingFieldsRow,
  t: TFunction<"artists">,
): MissingArtistFieldItem[] {
  const missing: MissingArtistFieldItem[] = [];

  if (isBlank(artist.artist_firstname)) pushMissing(missing, "firstname", t("form_firstname_label"));
  if (isBlank(artist.artist_lastname)) pushMissing(missing, "lastname", t("form_lastname_label"));
  if (!hasArtistTyp(artist.artist_typ)) pushMissing(missing, "art_types", t("form_art_types_label"));
  if (isBlank(artist.artist_birth_date)) pushMissing(missing, "birth_date", t("form_birthdate_label"));
  if (artist.artist_vivant === false && isBlank(artist.artist_death_date)) {
    pushMissing(missing, "death_date", t("form_deathdate_label"));
  }

  const address = (artist.artist_adresse ?? "").trim() || (artist.artist_address ?? "").trim();
  const zip = (artist.artist_zipcode ?? "").trim();
  const city = (artist.artist_ville ?? "").trim() || (artist.artist_city ?? "").trim();
  const coreAddressMissing = !address && !zip && !city;

  if (coreAddressMissing) {
    pushMissing(missing, "full_address", t("form_full_address_label"));
  } else {
    if (!address) pushMissing(missing, "address", t("form_address_label"));
    if (isBlank(artist.artist_adresse2)) pushMissing(missing, "address_line2", t("form_address_line2_label"));
    if (!zip) pushMissing(missing, "zipcode", t("form_zipcode_label"));
    if (!city) pushMissing(missing, "city", t("form_city_label"));
  }

  const country = (artist.artist_pays ?? artist.pays ?? "").trim();
  if (!country) pushMissing(missing, "country", t("form_country_label"));
  if (isBlank(artist.artist_phone)) pushMissing(missing, "phone", t("form_phone_label"));
  if (isBlank(artist.artist_email)) pushMissing(missing, "email", t("form_email_label"));

  return missing;
}

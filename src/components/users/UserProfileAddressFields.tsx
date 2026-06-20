import { useMemo } from "react";

import { CountryFlagIcon } from "@/components/CountryFlagIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_OPTIONS, getCountryOption } from "@/lib/countries";
import { postalPlaceholderForCountryLabel } from "@/lib/postalCode";

export type UserProfileAddressValues = {
  compl_adresse?: string | null;
  adresse_postale?: string | null;
  country?: string | null;
  zip_code?: string | null;
  city?: string | null;
};

type UserProfileAddressFieldsProps = {
  idPrefix: string;
  values: UserProfileAddressValues;
  onChange: (patch: Partial<UserProfileAddressValues & { country_code?: string | null }>) => void;
  disabled?: boolean;
};

/** Bloc adresse (même présentation que AddArtistDialog). */
export function UserProfileAddressFields({
  idPrefix,
  values,
  onChange,
  disabled = false,
}: UserProfileAddressFieldsProps) {
  const country = values.country?.trim() || "France";
  const postalPlaceholder = useMemo(() => postalPlaceholderForCountryLabel(country), [country]);

  return (
    <div className="grid w-full gap-3 sm:grid-cols-10">
      <div className="sm:col-span-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3">
          <div className="order-2 min-w-0 flex-1 sm:order-1">
            <div className="space-y-[5px]">
              <Label htmlFor={`${idPrefix}-compl-adresse`}>Complément d&apos;adresse</Label>
              <Input
                id={`${idPrefix}-compl-adresse`}
                autoComplete="address-line2"
                placeholder="Bâtiment, étage, boîte…"
                value={values.compl_adresse ?? ""}
                onChange={(e) => onChange({ compl_adresse: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="order-1 w-full max-w-full sm:order-2 sm:w-[363px] sm:shrink-0">
            <div className="space-y-[5px]">
              <Label htmlFor={`${idPrefix}-adresse-postale`}>Adresse</Label>
              <Input
                id={`${idPrefix}-adresse-postale`}
                autoComplete="address-line1"
                placeholder="Adresse"
                value={values.adresse_postale ?? ""}
                onChange={(e) => onChange({ adresse_postale: e.target.value })}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="w-[100px] max-w-full justify-self-start space-y-[5px] sm:col-span-1">
        <Label htmlFor={`${idPrefix}-country`}>Pays</Label>
        <Select
          value={country}
          onValueChange={(label) => {
            const iso = getCountryOption(label)?.iso?.toUpperCase() ?? null;
            onChange({
              country: label,
              ...(iso ? { country_code: iso } : {}),
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger id={`${idPrefix}-country`} disabled={disabled}>
            <SelectValue placeholder="Pays" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {COUNTRY_OPTIONS.map((c) => (
              <SelectItem key={c.label} value={c.label}>
                <span className="flex items-center gap-2">
                  <CountryFlagIcon iso={c.iso} />
                  <span>{c.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[115px] max-w-full justify-self-start space-y-[5px] sm:col-span-2">
        <Label htmlFor={`${idPrefix}-zip`}>Code postal</Label>
        <Input
          id={`${idPrefix}-zip`}
          autoComplete="postal-code"
          placeholder={postalPlaceholder}
          value={values.zip_code ?? ""}
          onChange={(e) => onChange({ zip_code: e.target.value })}
          disabled={disabled}
        />
      </div>

      <div className="space-y-[5px] sm:col-span-7">
        <Label htmlFor={`${idPrefix}-city`}>Ville</Label>
        <Input
          id={`${idPrefix}-city`}
          autoComplete="address-level2"
          placeholder="Ville"
          value={values.city ?? ""}
          onChange={(e) => onChange({ city: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/** Libellé pays à partir de `profiles.country` ou repli sur `country_code`. */
export function resolveProfileCountryLabel(
  country: string | null | undefined,
  countryCode: string | null | undefined,
): string {
  const label = country?.trim();
  if (label) return label;
  const code = countryCode?.trim().toUpperCase();
  if (!code) return "France";
  const found = COUNTRY_OPTIONS.find((option) => option.iso?.toUpperCase() === code);
  return found?.label ?? "France";
}

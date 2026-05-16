import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type CountryPhoneOption = {
  key: string;
  name: string;
  dial: string;
  iso?: string;
  flagEmoji?: string;
  minLength: number;
  maxLength: number;
};

type SmartPhoneInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Pays imposé par le formulaire (ex. sélecteur à côté du code postal). */
  countrySelectorLocked?: boolean;
  countryName?: string;
  onCountryNameChange?: (countryName: string) => void;
  onValidityChange?: (valid: boolean) => void;
};

function toDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeNational(raw: string): string {
  let digits = toDigits(raw);
  while (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function dialDigits(dial: string): string {
  return toDigits(dial);
}

function buildE164(dial: string, national: string): string {
  const cc = dialDigits(dial);
  if (!cc || !national) return "";
  return `+${cc}${national}`;
}

function getFlagPublicUrl(flagObjectPath: string | undefined): string {
  const objectPath = (flagObjectPath ?? "").trim();
  if (!objectPath) return "";
  return supabase.storage.from("flags").getPublicUrl(objectPath).data.publicUrl;
}

function parseCountriesPhoneRow(row: Record<string, unknown>): CountryPhoneOption | null {
  const name =
    (typeof row.name === "string" && row.name.trim()) ||
    (typeof row.country_name === "string" && row.country_name.trim()) ||
    (typeof row.label === "string" && row.label.trim()) ||
    "";
  const dial =
    (typeof row.dial_code === "string" && row.dial_code.trim()) ||
    (typeof row.calling_code === "string" && row.calling_code.trim()) ||
    (typeof row.indicatif === "string" && row.indicatif.trim()) ||
    "";

  if (!name || !dial) return null;

  const isoRaw =
    (typeof row.iso2 === "string" && row.iso2.trim()) ||
    (typeof row.iso === "string" && row.iso.trim()) ||
    (typeof row.country_code === "string" && row.country_code.trim()) ||
    "";
  const iso = isoRaw ? isoRaw.toLowerCase() : undefined;
  const flagEmoji =
    (typeof row.flag_emoji === "string" && row.flag_emoji.trim()) ||
    (typeof row.flagEmoji === "string" && row.flagEmoji.trim()) ||
    (typeof row.emoji === "string" && row.emoji.trim()) ||
    "";

  const minRaw = Number(
    row.min_length ?? row.min ?? row.phone_min_length ?? row.min_digits ?? 6,
  );
  const maxRaw = Number(
    row.max_length ?? row.max ?? row.phone_max_length ?? row.max_digits ?? 15,
  );
  const minLength = Number.isFinite(minRaw) && minRaw > 0 ? Math.trunc(minRaw) : 6;
  const maxLength = Number.isFinite(maxRaw) && maxRaw >= minLength ? Math.trunc(maxRaw) : Math.max(minLength, 15);
  const key = `${name}__${dial}`;

  return {
    key,
    name,
    dial,
    iso,
    flagEmoji: flagEmoji || undefined,
    minLength,
    maxLength,
  };
}

function fallbackCountries(): CountryPhoneOption[] {
  return COUNTRY_OPTIONS
    .filter((country) => (country.dial ?? "").trim())
    .map((country, idx) => ({
      key: `${country.label}__${country.dial}`,
      name: country.label,
      dial: country.dial,
      iso: country.iso,
      flagEmoji: `${(country.iso ?? "").toLowerCase()}.svg`,
      minLength: idx < 6 ? 8 : 6,
      maxLength: idx < 6 ? 11 : 15,
    }));
}

export function SmartPhoneInput({
  id,
  value,
  onChange,
  disabled,
  className,
  countrySelectorLocked = false,
  countryName,
  onCountryNameChange,
  onValidityChange,
}: SmartPhoneInputProps) {
  const [options, setOptions] = useState<CountryPhoneOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [nationalInput, setNationalInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("countries_phone")
        .select("*")
        .order("priority", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true, nullsFirst: false });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setOptions(fallbackCountries());
        return;
      }
      const mapped =
        ((data as Array<Record<string, unknown>> | null) ?? [])
          .map((row) => parseCountriesPhoneRow(row))
          .filter((row): row is CountryPhoneOption => row !== null) ?? [];
      setOptions(mapped.length ? mapped : fallbackCountries());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!options.length) return;
    if (countryName?.trim()) {
      const byName = options.find(
        (opt) => opt.name.toLowerCase() === countryName.trim().toLowerCase(),
      );
      if (byName) {
        setSelectedKey(byName.key);
        return;
      }
    }
    if (selectedKey && options.some((opt) => opt.key === selectedKey)) return;
    const first = options[0];
    setSelectedKey(first?.key ?? "");
    if (first && onCountryNameChange && !countrySelectorLocked) onCountryNameChange(first.name);
  }, [options, countryName, selectedKey, onCountryNameChange, countrySelectorLocked]);

  const selected = useMemo(
    () => options.find((opt) => opt.key === selectedKey) ?? null,
    [options, selectedKey],
  );
  const selectedFlagUrl = useMemo(() => getFlagPublicUrl(selected?.flagEmoji), [selected?.flagEmoji]);

  useEffect(() => {
    const raw = (value ?? "").trim();
    if (!raw) {
      setNationalInput("");
      return;
    }
    const digitsRaw = toDigits(raw);
    if (!options.length) {
      setNationalInput(normalizeNational(digitsRaw));
      return;
    }
    const sorted = [...options].sort((a, b) => dialDigits(b.dial).length - dialDigits(a.dial).length);
    const match = sorted.find((opt) => {
      const cc = dialDigits(opt.dial);
      return cc.length > 0 && digitsRaw.startsWith(cc);
    });
    if (match) {
      setNationalInput(normalizeNational(digitsRaw.slice(dialDigits(match.dial).length)));
      return;
    }
    setNationalInput(normalizeNational(digitsRaw));
  }, [value, options]);

  useEffect(() => {
    if (!selected || !options.length) return;
    const raw = (value ?? "").trim();
    if (!raw) return;
    const ccSel = dialDigits(selected.dial);
    if (!ccSel) return;
    const digitsRaw = toDigits(raw);
    const sorted = [...options].sort((a, b) => dialDigits(b.dial).length - dialDigits(a.dial).length);
    const match = sorted.find((opt) => {
      const cc = dialDigits(opt.dial);
      return cc.length > 0 && digitsRaw.startsWith(cc);
    });
    const national = match
      ? normalizeNational(digitsRaw.slice(dialDigits(match.dial).length))
      : normalizeNational(digitsRaw);
    const next = buildE164(selected.dial, national);
    const a = next.replace(/\s/g, "");
    const b = raw.replace(/\s/g, "");
    if (next && a !== b) {
      onChange(next);
    }
  }, [selectedKey, selected, options, onChange, value]);

  useEffect(() => {
    if (countrySelectorLocked) return;
    const raw = (value ?? "").trim();
    if (!raw.startsWith("+") || !options.length) return;
    const digitsRaw = toDigits(raw);
    const byDial = [...options]
      .sort((a, b) => dialDigits(b.dial).length - dialDigits(a.dial).length)
      .find((opt) => {
        const cc = dialDigits(opt.dial);
        return cc.length > 0 && digitsRaw.startsWith(cc);
      });
    if (byDial && byDial.key !== selectedKey) {
      setSelectedKey(byDial.key);
      if (onCountryNameChange) onCountryNameChange(byDial.name);
    }
  }, [value, options, selectedKey, onCountryNameChange, countrySelectorLocked]);

  const digits = toDigits(nationalInput);
  const hasBounds = Boolean(selected);
  const min = selected?.minLength ?? 0;
  const max = selected?.maxLength ?? 0;
  const validLength = !digits || !hasBounds || (digits.length >= min && digits.length <= max);
  const errorMessage =
    !validLength && selected
      ? `Numéro invalide pour ${selected.name}: ${min} à ${max} chiffres requis.`
      : "";

  useEffect(() => {
    onValidityChange?.(validLength);
  }, [validLength, onValidityChange]);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-start justify-start gap-0 w-full">
        {countrySelectorLocked ? (
          selected ? (
            <div
              className={cn(
                "flex shrink-0 select-none items-center justify-center gap-1 rounded-md border border-input bg-muted/30 px-2",
                "h-10 w-[100px] rounded-r-none border-r-0",
              )}
              title={selected.name}
            >
              {selectedFlagUrl ? (
                <img
                  src={selectedFlagUrl}
                  alt=""
                  className="h-[14px] w-[20px] aspect-auto rounded-sm shadow-sm object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="inline-flex h-[14px] w-[20px] items-center justify-center rounded-sm bg-muted text-[9px]">
                  —
                </span>
              )}
              <span className="max-w-[5rem] truncate tabular-nums text-xs font-medium text-foreground">
                {selected.dial?.trim() ? selected.dial : selected.name}
              </span>
            </div>
          ) : (
            <div
              className="flex h-10 w-[100px] shrink-0 items-center justify-center rounded-md rounded-r-none border border-r-0 border-input bg-muted/20 px-2 text-xs text-muted-foreground"
              aria-hidden
            >
              …
            </div>
          )
        ) : (
          <Select
            value={selectedKey}
            onValueChange={(next) => {
              setSelectedKey(next);
              const found = options.find((opt) => opt.key === next);
              if (found && onCountryNameChange) onCountryNameChange(found.name);
              if (!found) return;
              const normalized = normalizeNational(nationalInput);
              onChange(buildE164(found.dial, normalized));
            }}
            disabled={disabled || loading || options.length === 0}
          >
            <SelectTrigger className="h-8 w-[90px] rounded-r-none border-r-0 px-1.5 text-[11px]">
              <SelectValue placeholder="Pays">
                {selected ? (
                  <span className="inline-flex items-center gap-1">
                    {selectedFlagUrl ? (
                      <img
                        src={selectedFlagUrl}
                        alt=""
                        className="h-[14px] w-[20px] aspect-auto rounded-sm shadow-sm object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="inline-flex h-[14px] w-[20px] items-center justify-center rounded-sm bg-muted text-[9px]">
                        —
                      </span>
                    )}
                    <span className="tabular-nums text-[11px]">{selected.dial}</span>
                  </span>
                ) : (
                  "Pays"
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {options.map((opt) => (
                <SelectItem key={opt.key} value={opt.key}>
                  <span className="inline-flex items-center gap-2">
                    <img
                      src={getFlagPublicUrl(opt.flagEmoji)}
                      alt=""
                      className="h-[14px] w-[20px] aspect-auto rounded-sm shadow-sm object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="tabular-nums text-xs">{opt.dial}</span>
                    <span className="text-xs">{opt.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          id={id}
          type="tel"
          autoComplete="tel"
          inputMode="numeric"
          value={nationalInput}
          onChange={(e) => {
            const normalized = normalizeNational(e.target.value);
            setNationalInput(normalized);
            if (!selected) {
              onChange("");
              return;
            }
            onChange(buildE164(selected.dial, normalized));
          }}
          disabled={disabled || loading || !selected}
          className={cn(
            "w-full flex-1 rounded-l-none px-2",
            countrySelectorLocked
              ? "h-10 min-h-10 border-l-0 text-sm"
              : "h-8 text-xs",
          )}
          placeholder="Numéro"
        />
      </div>
      {!validLength && <p className="mt-1 text-[11px] text-destructive">{errorMessage}</p>}
    </div>
  );
}


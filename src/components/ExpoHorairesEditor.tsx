import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JourHoraire = {
  debut: string | null;
  fin: string | null;
  ferme: boolean;
};

export type ExpoHoraires = {
  lundi: JourHoraire;
  mardi: JourHoraire;
  mercredi: JourHoraire;
  jeudi: JourHoraire;
  vendredi: JourHoraire;
  samedi: JourHoraire;
  dimanche: JourHoraire;
};

export type JourKey = keyof ExpoHoraires;

const JOUR_KEYS: JourKey[] = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

export const HORAIRES_VIDE: ExpoHoraires = {
  lundi: { debut: null, fin: null, ferme: false },
  mardi: { debut: null, fin: null, ferme: false },
  mercredi: { debut: null, fin: null, ferme: false },
  jeudi: { debut: null, fin: null, ferme: false },
  vendredi: { debut: null, fin: null, ferme: false },
  samedi: { debut: null, fin: null, ferme: false },
  dimanche: { debut: null, fin: null, ferme: false },
};

/** Parse une valeur JSONB brute vers ExpoHoraires (tolère null / malformé). */
export function parseExpoHoraires(raw: unknown): ExpoHoraires {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...HORAIRES_VIDE };
  const src = raw as Record<string, unknown>;
  const result = { ...HORAIRES_VIDE };
  for (const key of JOUR_KEYS) {
    const j = src[key];
    if (!j || typeof j !== "object" || Array.isArray(j)) continue;
    const jj = j as Record<string, unknown>;
    result[key] = {
      debut: typeof jj.debut === "string" ? jj.debut : null,
      fin: typeof jj.fin === "string" ? jj.fin : null,
      ferme: jj.ferme === true,
    };
  }
  return result;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  value: ExpoHoraires;
  onChange: (next: ExpoHoraires) => void;
  disabled?: boolean;
  readonly?: boolean;
};

// ─── Composant ────────────────────────────────────────────────────────────────

export function ExpoHorairesEditor({ value, onChange, disabled = false, readonly = false }: Props) {
  const { t } = useTranslation("expos");

  const setJour = (key: JourKey, patch: Partial<JourHoraire>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  };

  const toggleFerme = (key: JourKey) => {
    const wasFerme = value[key].ferme;
    setJour(key, {
      ferme: !wasFerme,
      debut: wasFerme ? null : value[key].debut,
      fin: wasFerme ? null : value[key].fin,
    });
  };

  return (
    <div className="rounded-md border border-border overflow-hidden text-sm">
      <div className="grid grid-cols-[80px_1fr_1fr_60px] gap-x-2 px-3 py-1.5 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
        <span>{t("horaires.day")}</span>
        <span>{t("horaires.open")}</span>
        <span>{t("horaires.close")}</span>
        <span className="text-center">{t("horaires.closed")}</span>
      </div>

      {JOUR_KEYS.map((key, idx) => {
        const label = t(`horaires.${key}`);
        const jour = value[key];
        const isOdd = idx % 2 === 1;

        return (
          <div
            key={key}
            className={cn(
              "grid grid-cols-[80px_1fr_1fr_60px] gap-x-2 items-center px-3 py-2",
              isOdd && "bg-muted/20",
              jour.ferme && "opacity-50",
            )}
          >
            <span className="text-xs font-medium">{label}</span>

            <Input
              type="time"
              value={jour.debut ?? ""}
              disabled={disabled || jour.ferme}
              readOnly={readonly}
              className={cn(
                "h-8 text-xs shadow-none px-2",
                (readonly || jour.ferme) && "bg-muted/50 cursor-not-allowed",
              )}
              onChange={(e) => setJour(key, { debut: e.target.value || null })}
            />

            <Input
              type="time"
              value={jour.fin ?? ""}
              disabled={disabled || jour.ferme}
              readOnly={readonly}
              className={cn(
                "h-8 text-xs shadow-none px-2",
                (readonly || jour.ferme) && "bg-muted/50 cursor-not-allowed",
              )}
              onChange={(e) => setJour(key, { fin: e.target.value || null })}
            />

            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={jour.ferme}
                disabled={disabled || readonly}
                className="h-4 w-4 rounded border-border accent-[#E63946] cursor-pointer"
                onChange={() => toggleFerme(key)}
                aria-label={t("horaires.closed_aria", { day: label })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

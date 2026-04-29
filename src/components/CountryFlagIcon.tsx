import { cn } from "@/lib/utils";

type CountryFlagIconProps = {
  /** Code ISO 3166-1 alpha-2 (flag-icons lipis). Absent = globe « Autres ». */
  iso?: string;
  className?: string;
};

/**
 * Drapeau miniature (flag-icons) ou icône pour « Autres ».
 */
export function CountryFlagIcon({ iso, className }: CountryFlagIconProps) {
  if (!iso) {
    return (
      <span
        className={cn("inline-flex h-3.5 w-3.5 items-center justify-center text-[10px]", className)}
        aria-hidden
      >
        🌍
      </span>
    );
  }
  return (
    <span
      className={cn("inline-block shrink-0 text-[11px] leading-none", className)}
      aria-hidden
    >
      <span className={cn("fi", `fi-${iso}`)} />
    </span>
  );
}

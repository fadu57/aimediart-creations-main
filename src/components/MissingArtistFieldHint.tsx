import { CircleHelp } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type MissingArtistFieldHintProps = {
  label: string;
  hint: string;
  learnWhyLabel: string;
};

/** Champ manquant avec détail au clic (popover, hors lien carte artiste). */
export function MissingArtistFieldHint({ label, hint, learnWhyLabel }: MissingArtistFieldHintProps) {
  return (
    <span className="inline-flex items-center gap-0.5 align-baseline">
      <span className="italic text-destructive">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 rounded-sm p-0.5 text-destructive/75 hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={learnWhyLabel}
          >
            <CircleHelp className="h-3 w-3" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-[min(280px,calc(100vw-2rem))] p-3 text-xs leading-snug"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <p className="font-medium text-foreground mb-1">{label}</p>
          <p className="text-muted-foreground">{hint}</p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

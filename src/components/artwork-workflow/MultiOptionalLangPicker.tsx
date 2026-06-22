import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";

type MultiOptionalLangPickerProps = {
  primaryLang: MediationUiLang;
  availableLangs: MediationUiLang[];
  selectedLangs: MediationUiLang[];
  maxOptional: number;
  disabled?: boolean;
  onChange: (langs: MediationUiLang[]) => void;
};

export function MultiOptionalLangPicker({
  primaryLang,
  availableLangs,
  selectedLangs,
  maxOptional,
  disabled = false,
  onChange,
}: MultiOptionalLangPickerProps) {
  const optionalCandidates = availableLangs.filter((lng) => lng !== primaryLang);
  const label =
    selectedLangs.length === 0
      ? "Aucune langue optionnelle"
      : selectedLangs.map((lng) => lng.toUpperCase()).join(", ");

  const toggleLang = (lng: MediationUiLang) => {
    if (selectedLangs.includes(lng)) {
      onChange(selectedLangs.filter((item) => item !== lng));
      return;
    }
    if (selectedLangs.length >= maxOptional) {
      onChange([...selectedLangs.slice(1), lng]);
      return;
    }
    onChange([...selectedLangs, lng]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled || maxOptional <= 0}
          className="h-9 w-full justify-between text-xs font-normal sm:text-sm"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-2rem),280px)] p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>Aucune langue disponible</CommandEmpty>
            <CommandGroup>
              {optionalCandidates.map((lng) => {
                const checked = selectedLangs.includes(lng);
                return (
                  <CommandItem
                    key={lng}
                    value={lng}
                    onSelect={() => toggleLang(lng)}
                    className="text-sm"
                  >
                    <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                    {lng.toUpperCase()}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <p className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          {maxOptional <= 0
            ? "Votre formule ne permet qu'une seule langue."
            : `Jusqu'à ${maxOptional} langue(s) optionnelle(s) en plus de ${primaryLang.toUpperCase()}.`}
        </p>
      </PopoverContent>
    </Popover>
  );
}

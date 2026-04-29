import { useEffect, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";

import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

type BirthDatePickerFrProps = {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  fromYear?: number;
  toYear?: number;
  className?: string;
};

/**
 * Calendrier compact : en-tête « Mois » / « Année » (lignes séparées) + résumé + grille des jours.
 */
export function BirthDatePickerFr({
  selected,
  onSelect,
  fromYear = 1920,
  toYear = new Date().getFullYear(),
  className,
}: BirthDatePickerFrProps) {
  const [displayMonth, setDisplayMonth] = useState(() =>
    startOfMonth(selected ?? new Date()),
  );

  useEffect(() => {
    if (selected) {
      setDisplayMonth(startOfMonth(selected));
    }
  }, [selected]);

  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i).reverse();

  const setMonthIndex = (m: string) => {
    const month = Number.parseInt(m, 10);
    setDisplayMonth((prev) => new Date(prev.getFullYear(), month, 1));
  };

  const setYear = (y: string) => {
    const year = Number.parseInt(y, 10);
    setDisplayMonth((prev) => new Date(year, prev.getMonth(), 1));
  };

  return (
    <div className={cn("w-[min(100vw-2rem,252px)] space-y-2 p-2", className)}>
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 text-sm font-semibold">Mois</span>
        <Select
          value={String(displayMonth.getMonth())}
          onValueChange={setMonthIndex}
        >
          <SelectTrigger className="h-8 flex-1 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {MONTH_INDEXES.map((idx) => (
              <SelectItem key={idx} value={String(idx)}>
                {format(new Date(2024, idx, 1), "LLLL", { locale: fr })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-11 shrink-0 text-sm font-semibold">Année</span>
        <Select value={String(displayMonth.getFullYear())} onValueChange={setYear}>
          <SelectTrigger className="h-8 flex-1 text-sm tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs capitalize text-muted-foreground">
        {format(displayMonth, "MMMM yyyy", { locale: fr })}
      </p>
      <Calendar
        mode="single"
        month={displayMonth}
        onMonthChange={setDisplayMonth}
        selected={selected}
        onSelect={onSelect}
        locale={fr}
        initialFocus
        className="w-full p-0"
        classNames={{
          months: "flex w-full flex-col",
          month: "w-full space-y-1",
          caption: "hidden",
          caption_label: "hidden",
          caption_dropdowns: "hidden",
          nav: "hidden",
          table: "w-full border-collapse",
          head_row: "flex w-full justify-between",
          head_cell: "w-6 rounded-md p-0 text-center text-[0.65rem] font-normal text-muted-foreground",
          row: "mt-0.5 flex w-full",
          cell: "relative h-6 w-6 p-0 text-center text-[11px]",
          day: cn(
            "h-6 w-6 rounded-md p-0 font-normal",
            "hover:bg-accent hover:text-accent-foreground",
            "aria-selected:opacity-100",
          ),
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary",
          day_today: "bg-accent text-accent-foreground",
          day_outside: "text-muted-foreground opacity-40",
          day_disabled: "text-muted-foreground opacity-30",
        }}
      />
    </div>
  );
}

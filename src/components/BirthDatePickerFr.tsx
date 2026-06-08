import { useEffect, useMemo, useState } from "react";

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

import { clampLocalDay } from "@/lib/artistAge";

import { cn } from "@/lib/utils";



const MONTH_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;



type BirthDatePickerFrProps = {

  selected: Date | undefined;

  onSelect: (date: Date | undefined) => void;

  fromYear?: number;

  toYear?: number;

  minDate?: Date;

  maxDate?: Date;

  className?: string;

};



/**

 * Calendrier compact : en-tête « Mois » / « Année » (lignes séparées) + résumé + grille des jours.

 */

export function BirthDatePickerFr({

  selected,

  onSelect,

  fromYear = 1800,

  toYear = new Date().getFullYear(),

  minDate,

  maxDate,

  className,

}: BirthDatePickerFrProps) {

  const yearMin = minDate?.getFullYear() ?? fromYear;

  const yearMax = maxDate?.getFullYear() ?? toYear;



  const [displayMonth, setDisplayMonth] = useState(() => {

    const base = selected ?? maxDate ?? minDate ?? new Date();

    const month = startOfMonth(base);

    if (minDate && month < startOfMonth(minDate)) return startOfMonth(minDate);

    if (maxDate && month > startOfMonth(maxDate)) return startOfMonth(maxDate);

    return month;

  });



  useEffect(() => {

    if (selected) {

      setDisplayMonth(startOfMonth(selected));

    }

  }, [selected]);



  const years = useMemo(

    () =>

      Array.from({ length: yearMax - yearMin + 1 }, (_, i) => yearMin + i).reverse(),

    [yearMax, yearMin],

  );



  const dateFromDisplayMonth = (month: Date, daySource?: Date) => {

    const year = month.getFullYear();

    const monthIndex = month.getMonth();

    const day = daySource?.getDate() ?? 1;

    const maxDay = new Date(year, monthIndex + 1, 0).getDate();

    const raw = new Date(year, monthIndex, Math.min(day, maxDay));

    return clampLocalDay(raw, minDate, maxDate);

  };



  const commitDisplayMonth = (next: Date) => {

    const clampedMonth = clampLocalDay(startOfMonth(next), minDate, maxDate);

    setDisplayMonth(startOfMonth(clampedMonth));

    const nextDate = dateFromDisplayMonth(clampedMonth, selected);

    if (!selected || selected.getTime() !== nextDate.getTime()) {

      onSelect(nextDate);

    }

  };



  const setMonthIndex = (m: string) => {

    const month = Number.parseInt(m, 10);

    const next = new Date(displayMonth.getFullYear(), month, 1);

    commitDisplayMonth(next);

  };



  const setYear = (y: string) => {

    const year = Number.parseInt(y, 10);

    const next = new Date(year, displayMonth.getMonth(), 1);

    commitDisplayMonth(next);

  };



  const handleDaySelect = (date: Date | undefined) => {

    if (!date) {

      onSelect(undefined);

      return;

    }

    onSelect(clampLocalDay(date, minDate, maxDate));

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

        onMonthChange={(month) => setDisplayMonth(startOfMonth(clampLocalDay(month, minDate, maxDate)))}

        selected={selected}

        onSelect={handleDaySelect}

        fromDate={minDate}

        toDate={maxDate}

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



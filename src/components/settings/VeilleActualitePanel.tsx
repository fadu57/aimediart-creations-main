import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Newspaper,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  VEILLE_ACTUALITE_ITEMS,
  type VeilleActualiteItem,
} from "@/lib/veilleActualite";

type SortKey = "date" | "category";
type SortDir = "asc" | "desc";

function compareItems(a: VeilleActualiteItem, b: VeilleActualiteItem, key: SortKey, dir: SortDir) {
  const mul = dir === "asc" ? 1 : -1;
  if (key === "date") {
    return a.date === b.date ? 0 : a.date < b.date ? -1 * mul : 1 * mul;
  }
  const ca = a.category.localeCompare(b.category, "fr", { sensitivity: "base" });
  if (ca !== 0) return ca * mul;
  return a.date === b.date ? 0 : a.date < b.date ? 1 : -1; // date desc en second
}

function matchesQuery(item: VeilleActualiteItem, q: string) {
  if (!q) return true;
  const hay = `${item.category} ${item.title} ${item.dateLabel} ${item.summary} ${item.sourceLabel}`.toLowerCase();
  return hay.includes(q);
}

/** Bloc Settings : veille IA & médiation d’exposition. */
export function VeilleActualitePanel() {
  const { t } = useTranslation("settings");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const qNorm = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!qNorm) return [];
    return VEILLE_ACTUALITE_ITEMS.filter((item) => matchesQuery(item, qNorm)).slice(0, 8);
  }, [qNorm]);

  const items = useMemo(() => {
    return [...VEILLE_ACTUALITE_ITEMS]
      .filter((item) => matchesQuery(item, qNorm))
      .sort((a, b) => compareItems(a, b, sortKey, sortDir));
  }, [qNorm, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ active }: { active: boolean }) => {
    if (!active) return <ArrowUpDown className="h-3 w-3" aria-hidden />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3" aria-hidden />
    ) : (
      <ArrowDown className="h-3 w-3" aria-hidden />
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <Newspaper className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="font-serif text-lg font-bold tracking-tight text-foreground md:text-xl">
            {t("veille_actualite.panel_title")}
          </h2>
        </div>

        <div className="relative min-w-[12rem] flex-1 md:max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => {
              // laisse le clic suggestion passer
              window.setTimeout(() => setSuggestOpen(false), 120);
            }}
            placeholder={t("veille_actualite.search_placeholder")}
            className="h-8 pl-8 pr-8 text-sm"
            aria-autocomplete="list"
            aria-expanded={suggestOpen && suggestions.length > 0}
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
              aria-label={t("veille_actualite.search_clear")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {suggestOpen && suggestions.length > 0 ? (
            <ul
              role="listbox"
              className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-md"
            >
              {suggestions.map((item) => (
                <li key={item.id} role="option">
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-muted"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(item.title);
                      setOpenId(item.id);
                      setSuggestOpen(false);
                    }}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.category}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={sortKey === "category" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1 px-2 text-[11px] uppercase tracking-wide"
            onClick={() => toggleSort("category")}
            aria-label={t("veille_actualite.sort_category")}
            title={t("veille_actualite.sort_category")}
          >
            {t("veille_actualite.sort_category_short")}
            <SortIcon active={sortKey === "category"} />
          </Button>
          <Button
            type="button"
            variant={sortKey === "date" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1 px-2 text-[11px]"
            onClick={() => toggleSort("date")}
            aria-label={t("veille_actualite.sort_date")}
            title={t("veille_actualite.sort_date")}
          >
            {t("veille_actualite.sort_date_short")}
            <SortIcon active={sortKey === "date"} />
          </Button>
        </div>
      </div>

      <Accordion
        type="single"
        collapsible
        value={openId}
        onValueChange={setOpenId}
        className="flex flex-col gap-1"
      >
        {items.map((item) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="rounded-md border border-border/50 bg-background/80 px-2 md:px-3"
          >
            <AccordionTrigger className="py-1.5 hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0 text-left leading-tight">
                <span className="w-fit shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.category}
                </span>
                <span className="min-w-0 flex-1 font-serif text-sm font-bold text-foreground">
                  {item.title}{" "}
                  <span className="font-sans text-xs font-normal text-muted-foreground">
                    ({item.dateLabel})
                  </span>
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0">
              <p className="text-sm leading-relaxed text-foreground/90">
                <span className="font-medium">{t("veille_actualite.resume_label")} </span>
                {item.summary}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-1 text-sm">
                <span className="font-medium text-muted-foreground">
                  {t("veille_actualite.source_label")}
                </span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.sourceLabel}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("veille_actualite.search_empty")}</p>
      ) : null}
    </div>
  );
}

export default VeilleActualitePanel;

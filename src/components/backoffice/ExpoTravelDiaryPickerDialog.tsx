import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fetchExpoDiaryVisitors, type ExpoDiaryVisitorOption } from "@/lib/visitorTravelDiary";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expoId: string;
  expoName: string;
};

export function ExpoTravelDiaryPickerDialog({ open, onOpenChange, expoId, expoName }: Props) {
  const { t } = useTranslation("expos");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitors, setVisitors] = useState<ExpoDiaryVisitorOption[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open || !expoId.trim()) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchExpoDiaryVisitors(expoId).then(({ visitors: list, error: err }) => {
      if (cancelled) return;
      setVisitors(list);
      setError(err);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, expoId]);

  const filtered = visitors.filter((v) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return v.label.toLowerCase().includes(q) || v.visitorId.toLowerCase().includes(q);
  });

  const openDiary = (visitorId: string) => {
    onOpenChange(false);
    navigate(
      `/summary?expo_id=${encodeURIComponent(expoId)}&visitor_id=${encodeURIComponent(visitorId)}&admin=1`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden />
            {t("diary_picker.title")}
          </DialogTitle>
          <DialogDescription>
            {t("diary_picker.description", { expo: expoName })}
          </DialogDescription>
        </DialogHeader>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("diary_picker.search_placeholder")}
          className="text-neutral-900"
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">{t("diary_picker.loading")}</span>
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{t("diary_picker.error")}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("diary_picker.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((visitor) => (
                <li key={visitor.visitorId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                    onClick={() => openDiary(visitor.visitorId)}
                  >
                    <span className="min-w-0 truncate font-medium">{visitor.label}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {visitor.isAnonymous ? t("diary_picker.anonymous") : t("diary_picker.registered")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t("diary_picker.close")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

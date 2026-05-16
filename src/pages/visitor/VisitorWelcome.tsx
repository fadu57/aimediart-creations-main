import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrCreateVisitorUuid } from "@/lib/visitorIdentity";

function buildQuery(expoId: string): string {
  if (!expoId) return "";
  return `?expo_id=${encodeURIComponent(expoId)}`;
}

const VisitorWelcome = () => {
  const { t } = useTranslation("landing");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expoId = useMemo(() => searchParams.get("expo_id")?.trim() ?? "", [searchParams]);
  const qs = buildQuery(expoId);

  const benefitClass =
    "flex gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-foreground";

  const handleQuickVisit = () => {
    getOrCreateVisitorUuid();
    navigate(`/scan-work1${qs}`, { replace: false });
  };

  return (
    <div className="flex w-full flex-1 flex-col items-center px-4 pb-24 pt-6">
      <Card className="w-full max-w-[360px] border-border shadow-lg">
        <CardHeader className="space-y-3 pb-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide">{t("visitor_gate.badge")}</span>
          </div>
          <CardTitle className="text-center font-serif text-xl leading-snug">{t("visitor_gate.aha")}</CardTitle>
          <CardDescription className="text-center text-sm">{t("visitor_gate.lead")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-4 pb-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("visitor_gate.benefits_title")}
            </p>
            <ul className="space-y-2">
              <li className={benefitClass}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{t("visitor_gate.benefit_summary")}</span>
              </li>
              <li className={benefitClass}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{t("visitor_gate.benefit_artist")}</span>
              </li>
              <li className={benefitClass}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{t("visitor_gate.benefit_profile")}</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="h-11 w-full gradient-gold gradient-gold-hover-bg text-primary-foreground"
              onClick={handleQuickVisit}
            >
              {t("visitor_gate.btn_quick")}
            </Button>
            <Button type="button" variant="outline" className="h-11 w-full" asChild>
              <Link to={`/register_visitor${qs}`}>{t("visitor_gate.btn_profile")}</Link>
            </Button>
            <Button type="button" variant="ghost" className="h-9 w-full text-xs text-muted-foreground" asChild>
              <Link to={`/login${qs}`}>{t("visitor_gate.login_existing")}</Link>
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            <Link to="/home" className="underline underline-offset-2 hover:text-foreground">
              {t("visitor_gate.link_organizer")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default VisitorWelcome;

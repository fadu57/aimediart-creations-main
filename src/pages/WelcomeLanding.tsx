import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setAudienceChoice, clearAudienceChoice, type AudienceChoice } from "@/lib/audienceChoice";

/**
 * Choix initial Organisateur / Visiteur — mémorisé via `localStorage` (`audienceChoice`).
 */
const WelcomeLanding = () => {
  const { t } = useTranslation("landing");
  const navigate = useNavigate();

  const choose = (role: AudienceChoice) => {
    setAudienceChoice(role);
    navigate(role === "organizer" ? "/organisation" : "/visitor", { replace: true });
  };

  return (
    <div className="flex min-h-[calc(100vh-0px)] flex-col items-center justify-center bg-[#121212] px-4 py-12">
      <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="font-serif text-2xl text-foreground">{t("welcome.title")}</CardTitle>
          <CardDescription className="text-base text-muted-foreground">{t("welcome.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            size="lg"
            className="h-14 w-full gap-3 gradient-gold gradient-gold-hover-bg text-base text-primary-foreground"
            onClick={() => choose("organizer")}
          >
            <Building2 className="h-5 w-5 shrink-0" aria-hidden />
            {t("welcome.btn_organizer")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-14 w-full gap-3 border-primary/40 text-base"
            onClick={() => choose("visitor")}
          >
            <Users className="h-5 w-5 shrink-0" aria-hidden />
            {t("welcome.btn_visitor")}
          </Button>
          <p className="pt-1 text-center text-xs text-muted-foreground">{t("welcome.hint_remember")}</p>
          <button
            type="button"
            className="text-center text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => {
              clearAudienceChoice();
            }}
          >
            {t("welcome.change_choice")}
          </button>
        </CardContent>
      </Card>
    </div>
  );
};

export default WelcomeLanding;

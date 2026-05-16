import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

type LegalVariant = "cgv" | "rgpd";

type LegalStaticPageProps = { variant: LegalVariant };

/**
 * Pages de substitution pour CGV et RGPD ; remplacez par du contenu juridique réel ou VITE_LEGAL_* pointant vers votre site.
 */
const LegalStaticPage = ({ variant }: LegalStaticPageProps) => {
  const { t } = useTranslation("landing");
  const title = variant === "cgv" ? t("legal_pages.cgv_title") : t("legal_pages.rgpd_title");
  const body = variant === "cgv" ? t("legal_pages.cgv_body") : t("legal_pages.rgpd_body");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <Button variant="ghost" size="sm" className="mb-6 gap-2 text-muted-foreground" asChild>
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          {t("legal_pages.back")}
        </Link>
      </Button>
      <h1 className="font-serif text-2xl font-semibold text-foreground">{title}</h1>
      <p className="mt-6 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
};

export default LegalStaticPage;

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { openSponsoringConventionDocument } from "@/lib/sponsoringConvention";

type SponsoringConventionButtonProps = {
  organisationId: string;
};

export function SponsoringConventionButton({ organisationId }: SponsoringConventionButtonProps) {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full justify-start border-[#9d2525]/30 text-[#9d2525] hover:bg-[#fff9f7]"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void openSponsoringConventionDocument(organisationId)
          .catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : t("sponsoring.generate_error"));
          })
          .finally(() => setLoading(false));
      }}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileText className="mr-2 h-4 w-4" />
      )}
      {t("sponsoring.convention_button")}
    </Button>
  );
}

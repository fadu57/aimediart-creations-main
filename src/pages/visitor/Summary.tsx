import { useTranslation } from "react-i18next";

export default function Summary() {
  const { t } = useTranslation("visitor");
  return (
    <div className="mx-auto w-full max-w-[320px] px-4 py-6">
      <h1 className="text-xl font-semibold">{t("under_construction")}</h1>
    </div>
  );
}

import { useTranslation } from "react-i18next";

/**
 * Lien d’évitement WCAG 2.4.1 — invisible jusqu’au focus clavier.
 * `fixed` + z-index élevé : toujours au-dessus du header sticky/fixed.
 */
export function SkipToContentLink() {
  const { t } = useTranslation("header");

  return (
    <a
      href="#main-content"
      className="fixed left-3 top-3 z-[100] -translate-y-[150%] rounded-md bg-[#E63946] px-4 py-2 text-sm font-semibold text-white outline-none ring-2 ring-white ring-offset-2 ring-offset-[#121212] transition-transform focus:translate-y-0"
      onClick={(e) => {
        const target = document.getElementById("main-content");
        if (!target) return;
        e.preventDefault();
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {t("skip_to_content")}
    </a>
  );
}

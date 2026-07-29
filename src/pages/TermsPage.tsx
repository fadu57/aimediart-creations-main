import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { highlightAimediartCom } from "@/lib/highlightAimediartCom";
import { LegalEditablePage } from "@/pages/LegalEditablePage";
import { LEGAL_ARTICLE_CLASS, LEGAL_SECTION_TITLE_CLASS } from "@/pages/legalPageStyles";

const WCAG_CONFORMANCE_URL = "https://www.w3.org/WAI/WCAG22/Understanding/conformance";
const ACCESSIBILITY_SECTION_ID = "accessibilite-numerique";

function BulletList({
  prefix,
  keys,
}: {
  prefix: string;
  keys: readonly string[];
}) {
  const { t } = useTranslation("terms");
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
      {keys.map((k) => (
        <li key={k} className="!font-normal">
          {highlightAimediartCom(t(`${prefix}.${k}`))}
        </li>
      ))}
    </ul>
  );
}

function TermsI18nFullDocument() {
  const { t } = useTranslation("terms");
  const bt = (key: string) => highlightAimediartCom(t(key));

  return (
    <>
      <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{bt("meta.title")}</h1>
      <p className="mt-2 text-sm text-neutral-600">{bt("meta.version")}</p>
      <p className="mt-2 text-sm text-neutral-600">{bt("meta.workNotice")}</p>
      <p className="mt-1 text-sm italic text-neutral-500">{bt("meta.languageRef")}</p>

      <article className={LEGAL_ARTICLE_CLASS}>
        <section className="mb-10">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.object.title")}</h2>
          <p className="mt-3">{bt("sections.object.p1")}</p>
          <p className="mt-3">{bt("sections.object.p2")}</p>
        </section>

        <section className="mb-10">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.accessSecurity.title")}</h2>
          <BulletList prefix="sections.accessSecurity.list" keys={["i1", "i2", "i3", "i4"]} />
        </section>

        <section className="mb-10">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.acceptableUse.title")}</h2>
          <p className="mt-3">{bt("sections.acceptableUse.respectIntro")}</p>
          <BulletList prefix="sections.acceptableUse.respectList" keys={["i1", "i2", "i3", "i4"]} />
          <p className="mt-3">{bt("sections.acceptableUse.forbiddenIntro")}</p>
          <BulletList
            prefix="sections.acceptableUse.forbiddenList"
            keys={["i1", "i2", "i3", "i4", "i5", "i6"]}
          />
        </section>

        <section className="mb-10">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.contentResponsibility.title")}</h2>
          <BulletList prefix="sections.contentResponsibility.list" keys={["i1", "i2", "i3", "i4"]} />
        </section>

        <section className="mb-10">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.personalData.title")}</h2>
          <BulletList prefix="sections.personalData.list" keys={["i1", "i2"]} />
        </section>

        <section className="mb-10">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.suspension.title")}</h2>
          <BulletList prefix="sections.suspension.list" keys={["i1", "i2", "i3"]} />
        </section>

        <section id={ACCESSIBILITY_SECTION_ID} className="mb-10 scroll-mt-28">
          <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.accessibility.title")}</h2>
          <p className="mt-3">{bt("sections.accessibility.p1")}</p>
          <p className="mt-3">{bt("sections.accessibility.p2")}</p>
          <p className="mt-3">{bt("sections.accessibility.p3")}</p>
          <p className="mt-3">
            <Trans
              i18nKey="sections.accessibility.p4"
              ns="terms"
              components={{
                wcagLink: (
                  <a
                    href={WCAG_CONFORMANCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#1f1f1f] underline underline-offset-2 hover:text-[#E63946] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ),
              }}
            />
          </p>
        </section>
      </article>
    </>
  );
}

/**
 * Conditions d’utilisation — édition juriste / admin 1 via LegalEditablePage.
 * Conserve le scroll ancré #accessibilite-numerique sur le fallback i18n.
 */
const TermsPage = () => {
  const { hash } = useLocation();

  useEffect(() => {
    const id = hash.replace(/^#/, "").trim();
    if (id !== ACCESSIBILITY_SECTION_ID) return;
    const scroll = () => {
      document.getElementById(ACCESSIBILITY_SECTION_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };
    requestAnimationFrame(scroll);
    const timer = window.setTimeout(scroll, 80);
    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <LegalEditablePage
      slug="terms"
      contentNamespace="terms"
      i18nFallback={<TermsI18nFullDocument />}
    />
  );
};

export default TermsPage;

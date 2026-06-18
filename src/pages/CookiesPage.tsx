import { useTranslation } from "react-i18next";

import { PublicVitrineShell } from "@/components/PublicVitrineShell";
import { highlightAimediartCom } from "@/lib/highlightAimediartCom";
import { LEGAL_ARTICLE_CLASS, LEGAL_SECTION_TITLE_CLASS, LEGAL_SUBSECTION_TITLE_CLASS } from "@/pages/legalPageStyles";

function BulletList({
  prefix,
  keys,
}: {
  prefix: string;
  keys: readonly string[];
}) {
  const { t } = useTranslation("cookies");
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
      {keys.map((k) => (
        <li key={k}>{highlightAimediartCom(t(`${prefix}.${k}`))}</li>
      ))}
    </ul>
  );
}

/**
 * Politique Cookies & Traceurs — texte issu du namespace i18n `cookies` (source : politique_cookies_aimediart.md).
 */
const CookiesPage = () => {
  const { t } = useTranslation("cookies");
  const bt = (key: string) => highlightAimediartCom(t(key));

  return (
    <PublicVitrineShell vitrinePathPrefix="/organisation" atmosphericBackdrop>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 pt-24 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{bt("meta.title")}</h1>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.version")}</p>
          <p className="mt-1 text-sm italic text-neutral-500">{bt("meta.languageRef")}</p>

          <article className={LEGAL_ARTICLE_CLASS}>
          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.object.title")}</h2>
            <p className="mt-3">{bt("sections.object.p1")}</p>
            <p className="mt-3">{bt("sections.object.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.whatIsCookie.title")}</h2>
            <p className="mt-3">{bt("sections.whatIsCookie.p1")}</p>
            <p className="mt-3">{bt("sections.whatIsCookie.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.whoResponsible.title")}</h2>
            <p className="mt-3">{bt("sections.whoResponsible.intro")}</p>
            <BulletList prefix="sections.whoResponsible.list" keys={["i1", "i2"]} />
            <p className="mt-3">{bt("sections.whoResponsible.p1")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.types.title")}</h2>

            <div className="mt-6">
              <h3 className={LEGAL_SUBSECTION_TITLE_CLASS}>{bt("sections.types.necessary.title")}</h3>
              <p className="mt-3">{bt("sections.types.necessary.p1")}</p>
              <p className="mt-3">{bt("sections.types.necessary.p2")}</p>
              <BulletList prefix="sections.types.necessary.examples" keys={["e1", "e2", "e3"]} />
            </div>

            <div className="mt-8">
              <h3 className={LEGAL_SUBSECTION_TITLE_CLASS}>{bt("sections.types.analytics.title")}</h3>
              <p className="mt-3">{bt("sections.types.analytics.p1")}</p>
              <BulletList prefix="sections.types.analytics.list" keys={["i1", "i2", "i3", "i4"]} />
              <p className="mt-3">{bt("sections.types.analytics.p2")}</p>
              <p className="mt-3">{bt("sections.types.analytics.p3")}</p>
            </div>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.noAds.title")}</h2>
            <p className="mt-3">{bt("sections.noAds.p1")}</p>
            <BulletList prefix="sections.noAds.list" keys={["i1", "i2", "i3"]} />
            <p className="mt-3">{bt("sections.noAds.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.cmp.title")}</h2>
            <p className="mt-3">{bt("sections.cmp.p1")}</p>
            <p className="mt-3">{bt("sections.cmp.p2")}</p>
            <BulletList prefix="sections.cmp.choices" keys={["i1", "i2", "i3"]} />
            <p className="mt-4 font-medium">{bt("sections.cmp.defaultTitle")}</p>
            <BulletList prefix="sections.cmp.defaults" keys={["i1", "i2"]} />
            <p className="mt-3">{bt("sections.cmp.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.changeChoices.title")}</h2>
            <p className="mt-3">{bt("sections.changeChoices.p1")}</p>
            <BulletList prefix="sections.changeChoices.ways" keys={["i1", "i2"]} />
            <p className="mt-3">{bt("sections.changeChoices.p2")}</p>
            <BulletList prefix="sections.changeChoices.then" keys={["i1", "i2", "i3"]} />
            <p className="mt-3">{bt("sections.changeChoices.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.browser.title")}</h2>
            <p className="mt-3">{bt("sections.browser.p1")}</p>
            <BulletList prefix="sections.browser.list" keys={["i1", "i2", "i3"]} />
            <p className="mt-3">{bt("sections.browser.p2")}</p>
            <p className="mt-3">{bt("sections.browser.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.retention.title")}</h2>
            <p className="mt-3">{bt("sections.retention.p1")}</p>
            <BulletList prefix="sections.retention.list" keys={["i1", "i2"]} />
            <p className="mt-3">{bt("sections.retention.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.updates.title")}</h2>
            <p className="mt-3">{bt("sections.updates.p1")}</p>
            <BulletList prefix="sections.updates.list" keys={["i1", "i2", "i3"]} />
            <p className="mt-3">{bt("sections.updates.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.contact.title")}</h2>
            <p className="mt-3">{bt("sections.contact.p1")}</p>
            <p className="mt-3">{bt("sections.contact.p2")}</p>
            <p className="mt-3">{bt("sections.contact.p3")}</p>
          </section>
        </article>
        </div>
      </main>
    </PublicVitrineShell>
  );
};

export default CookiesPage;

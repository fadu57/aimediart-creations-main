import { useTranslation } from "react-i18next";

import { PublicVitrineShell } from "@/components/PublicVitrineShell";
import { highlightAimediartCom } from "@/lib/highlightAimediartCom";
import { LEGAL_ARTICLE_CLASS, LEGAL_SECTION_TITLE_CLASS } from "@/pages/legalPageStyles";

function BulletList({
  prefix,
  keys,
}: {
  prefix: string;
  keys: readonly string[];
}) {
  const { t } = useTranslation("ai_policy");
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

/**
 * Politique IA — namespace i18n `ai_policy` (source : base_contractuelle_aimediart_plateformes_culturelles_IA.docx, Partie 2).
 */
const AiPolicyPage = () => {
  const { t } = useTranslation("ai_policy");
  const bt = (key: string) => highlightAimediartCom(t(key));

  return (
    <PublicVitrineShell vitrinePathPrefix="/organisation" atmosphericBackdrop>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{bt("meta.title")}</h1>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.version")}</p>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.workNotice")}</p>
          <p className="mt-1 text-sm italic text-neutral-500">{bt("meta.languageRef")}</p>

          <article className={LEGAL_ARTICLE_CLASS}>
            <section className="mb-10">
              <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.scope.title")}</h2>
              <p className="mt-3">{bt("sections.scope.p1")}</p>
              <p className="mt-3">{bt("sections.scope.p2")}</p>
            </section>

            <section className="mb-10">
              <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.natureLimits.title")}</h2>
              <BulletList prefix="sections.natureLimits.list" keys={["i1", "i2", "i3"]} />
            </section>

            <section className="mb-10">
              <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.editorialResponsibility.title")}</h2>
              <BulletList prefix="sections.editorialResponsibility.list" keys={["i1", "i2", "i3"]} />
            </section>

            <section className="mb-10">
              <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.allowedUses.title")}</h2>
              <p className="mt-3">{bt("sections.allowedUses.allowedIntro")}</p>
              <BulletList prefix="sections.allowedUses.allowed" keys={["i1", "i2", "i3", "i4"]} />
              <p className="mt-3">{bt("sections.allowedUses.forbiddenIntro")}</p>
              <BulletList prefix="sections.allowedUses.forbidden" keys={["i1", "i2", "i3", "i4"]} />
            </section>

            <section className="mb-10">
              <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.aiData.title")}</h2>
              <BulletList prefix="sections.aiData.list" keys={["i1", "i2", "i3"]} />
            </section>

            <section className="mb-10">
              <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.regulation.title")}</h2>
              <p className="mt-3">{bt("sections.regulation.p1")}</p>
            </section>
          </article>
        </div>
      </main>
    </PublicVitrineShell>
  );
};

export default AiPolicyPage;

import { useTranslation } from "react-i18next";

import { PublicVitrineShell } from "@/components/PublicVitrineShell";
import { highlightAimediartCom } from "@/lib/highlightAimediartCom";

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

/**
 * Conditions d’utilisation de la plateforme — namespace i18n `terms` (source : base_contractuelle_aimediart_plateformes_culturelles_IA.docx, Partie 1).
 */
const TermsPage = () => {
  const { t } = useTranslation("terms");
  const bt = (key: string) => highlightAimediartCom(t(key));

  return (
    <PublicVitrineShell vitrinePathPrefix="/home" atmosphericBackdrop>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 pt-24 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{bt("meta.title")}</h1>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.version")}</p>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.workNotice")}</p>
          <p className="mt-1 text-sm italic text-neutral-500">{bt("meta.languageRef")}</p>

          <article className="prose prose-neutral mt-8 max-w-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none prose-headings:font-semibold prose-headings:text-[#1f1f1f] [&_blockquote]:!text-[12px] [&_li]:!font-normal [&_li]:!text-[12px] [&_li]:leading-relaxed [&_p]:!text-[12px] [&_p]:leading-relaxed sm:mt-10">
            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.object.title")}</h2>
              <p className="mt-3">{bt("sections.object.p1")}</p>
              <p className="mt-3">{bt("sections.object.p2")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.accessSecurity.title")}</h2>
              <BulletList prefix="sections.accessSecurity.list" keys={["i1", "i2", "i3", "i4"]} />
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.acceptableUse.title")}</h2>
              <p className="mt-3">{bt("sections.acceptableUse.respectIntro")}</p>
              <BulletList prefix="sections.acceptableUse.respectList" keys={["i1", "i2", "i3", "i4"]} />
              <p className="mt-3">{bt("sections.acceptableUse.forbiddenIntro")}</p>
              <BulletList prefix="sections.acceptableUse.forbiddenList" keys={["i1", "i2", "i3", "i4", "i5", "i6"]} />
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.contentResponsibility.title")}</h2>
              <BulletList prefix="sections.contentResponsibility.list" keys={["i1", "i2", "i3", "i4"]} />
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.personalData.title")}</h2>
              <BulletList prefix="sections.personalData.list" keys={["i1", "i2"]} />
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.suspension.title")}</h2>
              <BulletList prefix="sections.suspension.list" keys={["i1", "i2", "i3"]} />
            </section>
          </article>
        </div>
      </main>
    </PublicVitrineShell>
  );
};

export default TermsPage;

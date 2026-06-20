import { useTranslation } from "react-i18next";

import { PublicVitrineShell } from "@/components/PublicVitrineShell";
import { highlightAimediartCom } from "@/lib/highlightAimediartCom";
import { LEGAL_ARTICLE_CLASS, LEGAL_SECTION_TITLE_CLASS } from "@/pages/legalPageStyles";

function DefinitionsList() {
  const { t } = useTranslation("cgv");
  const keys = ["platform", "client", "user", "services", "clientContent", "subscription", "order"] as const;
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
      {keys.map((k) => (
        <li key={k} className="!font-medium">
          {highlightAimediartCom(t(`sections.definitions.list.${k}`))}
        </li>
      ))}
    </ul>
  );
}

function StringList({ prefix, count }: { prefix: string; count: number }) {
  const { t } = useTranslation("cgv");
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>{highlightAimediartCom(t(`${prefix}.item${i + 1}`))}</li>
      ))}
    </ul>
  );
}

/**
 * Page publique Conditions Générales de Vente — texte entièrement issu du namespace i18n `cgv`.
 */
const CgvPage = () => {
  const { t } = useTranslation("cgv");
  const bt = (key: string) => highlightAimediartCom(t(key));

  return (
    <PublicVitrineShell vitrinePathPrefix="/organisation" atmosphericBackdrop>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{bt("meta.title")}</h1>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.version")}</p>
          <p className="mt-1 text-sm italic text-neutral-500">{bt("meta.languageNotice")}</p>

          <article className={LEGAL_ARTICLE_CLASS}>
          <section className="mb-10">
            <p>{bt("sections.intro.p1")}</p>
            <p className="mt-3">{bt("sections.intro.p2")}</p>
            <p className="mt-3">{bt("sections.intro.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.sellerIdentity.title")}</h2>
            <p className="mt-3">{bt("sections.sellerIdentity.p1")}</p>
            <p className="mt-3">{bt("sections.sellerIdentity.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.definitions.title")}</h2>
            <p className="mt-3">{bt("sections.definitions.intro")}</p>
            <DefinitionsList />
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.documents.title")}</h2>
            <p className="mt-3">{bt("sections.documents.p1")}</p>
            <p className="mt-3">{bt("sections.documents.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.clientsScope.title")}</h2>
            <p className="mt-3">{bt("sections.clientsScope.p1")}</p>
            <p className="mt-3">{bt("sections.clientsScope.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.servicesDescription.title")}</h2>
            <p className="mt-3">{bt("sections.servicesDescription.p1")}</p>
            <p className="mt-3">{bt("sections.servicesDescription.p2")}</p>
            <p className="mt-3">{bt("sections.servicesDescription.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.contractFormation.title")}</h2>
            <p className="mt-3">{bt("sections.contractFormation.p1")}</p>
            <p className="mt-3">{bt("sections.contractFormation.p2")}</p>
            <p className="mt-3">{bt("sections.contractFormation.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.prices.title")}</h2>
            <p className="mt-3">{bt("sections.prices.p1")}</p>
            <p className="mt-3">{bt("sections.prices.p2")}</p>
            <p className="mt-3">{bt("sections.prices.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.payment.title")}</h2>
            <p className="mt-3">{bt("sections.payment.p1")}</p>
            <p className="mt-3">{bt("sections.payment.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.accessDelivery.title")}</h2>
            <p className="mt-3">{bt("sections.accessDelivery.p1")}</p>
            <p className="mt-3">{bt("sections.accessDelivery.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.duration.title")}</h2>
            <p className="mt-3">{bt("sections.duration.p1")}</p>
            <p className="mt-3">{bt("sections.duration.p2")}</p>
            <p className="mt-3">{bt("sections.duration.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.rightOfWithdrawal.title")}</h2>
            <p className="mt-3">{bt("sections.rightOfWithdrawal.p1")}</p>
            <p className="mt-3">{bt("sections.rightOfWithdrawal.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.clientObligations.title")}</h2>
            <p className="mt-3">{bt("sections.clientObligations.intro")}</p>
            <StringList prefix="sections.clientObligations.list" count={5} />
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.providerObligations.title")}</h2>
            <p className="mt-3">{bt("sections.providerObligations.intro")}</p>
            <StringList prefix="sections.providerObligations.list" count={5} />
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.warranty.title")}</h2>
            <p className="mt-3">{bt("sections.warranty.p1")}</p>
            <p className="mt-3">{bt("sections.warranty.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.liability.title")}</h2>
            <p className="mt-3">{bt("sections.liability.p1")}</p>
            <p className="mt-3">{bt("sections.liability.p2")}</p>
            <p className="mt-3">{bt("sections.liability.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.intellectualProperty.title")}</h2>
            <p className="mt-3">{bt("sections.intellectualProperty.p1")}</p>
            <p className="mt-3">{bt("sections.intellectualProperty.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.personalData.title")}</h2>
            <p className="mt-3">{bt("sections.personalData.p1")}</p>
            <p className="mt-3">{bt("sections.personalData.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.serviceModification.title")}</h2>
            <p className="mt-3">{bt("sections.serviceModification.p1")}</p>
            <p className="mt-3">{bt("sections.serviceModification.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.termination.title")}</h2>
            <p className="mt-3">{bt("sections.termination.p1")}</p>
            <p className="mt-3">{bt("sections.termination.p2")}</p>
            <p className="mt-3">{bt("sections.termination.p3")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.forceMajeure.title")}</h2>
            <p className="mt-3">{bt("sections.forceMajeure.p1")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.disputes.title")}</h2>
            <p className="mt-3">{bt("sections.disputes.p1")}</p>
            <p className="mt-3">{bt("sections.disputes.p2")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.applicableLaw.title")}</h2>
            <p className="mt-3">{bt("sections.applicableLaw.p1")}</p>
          </section>

          <section className="mb-10">
            <h2 className={LEGAL_SECTION_TITLE_CLASS}>{bt("sections.finalRecommendations.title")}</h2>
            <p className="mt-3">{bt("sections.finalRecommendations.p1")}</p>
            <p className="mt-3">{bt("sections.finalRecommendations.p2")}</p>
            <p className="mt-3">{bt("sections.finalRecommendations.p3")}</p>
          </section>
        </article>
        </div>
      </main>
    </PublicVitrineShell>
  );
};

export default CgvPage;

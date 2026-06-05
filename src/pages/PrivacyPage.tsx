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
  const { t } = useTranslation("privacy");
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 leading-relaxed">
      {keys.map((k) => (
        <li key={k}>{highlightAimediartCom(t(`${prefix}.${k}`))}</li>
      ))}
    </ul>
  );
}

/**
 * Politique de confidentialité RGPD — texte issu du namespace i18n `privacy` (source : politique_confidentialite_aimediart.docx).
 */
const PrivacyPage = () => {
  const { t } = useTranslation("privacy");
  const bt = (key: string) => highlightAimediartCom(t(key));

  return (
    <PublicVitrineShell vitrinePathPrefix="/organisation" atmosphericBackdrop>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 pt-24 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">{bt("meta.title")}</h1>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.version")}</p>
          <p className="mt-2 text-sm text-neutral-600">{bt("meta.scope")}</p>
          <p className="mt-1 text-sm italic text-neutral-500">{bt("meta.languageRef")}</p>

          <article className="prose prose-neutral mt-8 max-w-none border-0 bg-transparent p-0 shadow-none backdrop-blur-none prose-headings:font-semibold prose-headings:text-[#1f1f1f] [&_blockquote]:!text-[12px] [&_li]:!font-normal [&_li]:!text-[12px] [&_li]:leading-relaxed [&_p]:!text-[12px] [&_p]:leading-relaxed sm:mt-10">
            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.controller.title")}</h2>
              <p className="mt-3">{bt("sections.controller.p1")}</p>
              <p className="mt-3">{bt("sections.controller.p2")}</p>
              <p className="mt-3">{bt("sections.controller.p3")}</p>
              <BulletList prefix="sections.controller.list" keys={["i1", "i2"]} />
              <p className="mt-3">{bt("sections.controller.p4")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.dataCollected.title")}</h2>
              <p className="mt-3">{bt("sections.dataCollected.p1")}</p>

              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.dataCollected.accountId.title")}</h3>
                <BulletList prefix="sections.dataCollected.accountId.list" keys={["i1", "i2", "i3", "i4"]} />
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.dataCollected.contractBilling.title")}</h3>
                <BulletList prefix="sections.dataCollected.contractBilling.list" keys={["i1", "i2", "i3", "i4"]} />
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.dataCollected.contentProject.title")}</h3>
                <BulletList prefix="sections.dataCollected.contentProject.list" keys={["i1", "i2", "i3"]} />
                <p className="mt-3">{bt("sections.dataCollected.contentProject.p1")}</p>
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.dataCollected.logsSecurity.title")}</h3>
                <BulletList prefix="sections.dataCollected.logsSecurity.list" keys={["i1", "i2", "i3"]} />
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.dataCollected.navigation.title")}</h3>
                <p className="mt-3">{bt("sections.dataCollected.navigation.p1")}</p>
                <BulletList prefix="sections.dataCollected.navigation.list" keys={["i1", "i2", "i3"]} />
                <p className="mt-3">{bt("sections.dataCollected.navigation.p2")}</p>
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.dataCollected.support.title")}</h3>
                <BulletList prefix="sections.dataCollected.support.list" keys={["i1", "i2", "i3"]} />
              </div>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.purposes.title")}</h2>
              <p className="mt-3">{bt("sections.purposes.p1")}</p>

              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.purposes.accountServices.title")}</h3>
                <BulletList prefix="sections.purposes.accountServices.list" keys={["i1", "i2", "i3"]} />
                <p className="mt-3">{bt("sections.purposes.accountServices.legalBasis")}</p>
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.purposes.b2bClient.title")}</h3>
                <BulletList prefix="sections.purposes.b2bClient.list" keys={["i1", "i2", "i3"]} />
                <p className="mt-3">{bt("sections.purposes.b2bClient.legalBasis")}</p>
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.purposes.platformSecurity.title")}</h3>
                <BulletList prefix="sections.purposes.platformSecurity.list" keys={["i1", "i2", "i3"]} />
                <p className="mt-3">{bt("sections.purposes.platformSecurity.legalBasis")}</p>
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.purposes.audience.title")}</h3>
                <BulletList prefix="sections.purposes.audience.list" keys={["i1", "i2"]} />
                <p className="mt-3">{bt("sections.purposes.audience.legalBasisIntro")}</p>
                <BulletList prefix="sections.purposes.audience.legalList" keys={["i1", "i2"]} />
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.purposes.communication.title")}</h3>
                <BulletList prefix="sections.purposes.communication.list" keys={["i1", "i2"]} />
                <p className="mt-3">{bt("sections.purposes.communication.legalBasis")}</p>
              </div>
              <div className="mt-6">
                <h3 className="!text-[12px] italic text-[#1f1f1f]">{bt("sections.purposes.legalObligations.title")}</h3>
                <BulletList prefix="sections.purposes.legalObligations.list" keys={["i1", "i2", "i3"]} />
                <p className="mt-3">{bt("sections.purposes.legalObligations.legalBasis")}</p>
              </div>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.retention.title")}</h2>
              <p className="mt-3">{bt("sections.retention.p1")}</p>
              <p className="mt-3">{bt("sections.retention.p2")}</p>
              <BulletList prefix="sections.retention.list" keys={["i1", "i2", "i3", "i4", "i5"]} />
              <p className="mt-3">{bt("sections.retention.p3")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.recipients.title")}</h2>
              <p className="mt-3">{bt("sections.recipients.p1")}</p>
              <BulletList prefix="sections.recipients.list" keys={["i1", "i2", "i3", "i4"]} />
              <p className="mt-3">{bt("sections.recipients.p2")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.transfers.title")}</h2>
              <p className="mt-3">{bt("sections.transfers.p1")}</p>
              <p className="mt-3">{bt("sections.transfers.p2")}</p>
              <p className="mt-3">{bt("sections.transfers.p3")}</p>
              <BulletList prefix="sections.transfers.list" keys={["i1", "i2", "i3", "i4"]} />
              <p className="mt-3">{bt("sections.transfers.p4")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.rights.title")}</h2>
              <p className="mt-3">{bt("sections.rights.p1")}</p>
              <BulletList prefix="sections.rights.list" keys={["i1", "i2", "i3", "i4", "i5", "i6", "i7"]} />
              <p className="mt-3">{bt("sections.rights.p2")}</p>
              <p className="mt-3">{bt("sections.rights.p3")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.complaints.title")}</h2>
              <p className="mt-3">{bt("sections.complaints.p1")}</p>
              <p className="mt-3">{bt("sections.complaints.p2")}</p>
              <p className="mt-3">{bt("sections.complaints.p3")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.security.title")}</h2>
              <p className="mt-3">{bt("sections.security.p1")}</p>
              <p className="mt-3">{bt("sections.security.p2")}</p>
              <BulletList prefix="sections.security.list" keys={["i1", "i2", "i3", "i4", "i5"]} />
              <p className="mt-3">{bt("sections.security.p3")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.processorRole.title")}</h2>
              <p className="mt-3">{bt("sections.processorRole.p1")}</p>
              <p className="mt-3">{bt("sections.processorRole.p2")}</p>
              <BulletList prefix="sections.processorRole.list" keys={["i1", "i2", "i3"]} />
              <p className="mt-3">{bt("sections.processorRole.p3")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.ai.title")}</h2>
              <p className="mt-3">{bt("sections.ai.p1")}</p>
              <p className="mt-3">{bt("sections.ai.p2")}</p>
              <BulletList prefix="sections.ai.list" keys={["i1", "i2", "i3"]} />
              <p className="mt-3">{bt("sections.ai.p3")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.thirdPartyLinks.title")}</h2>
              <p className="mt-3">{bt("sections.thirdPartyLinks.p1")}</p>
              <p className="mt-3">{bt("sections.thirdPartyLinks.p2")}</p>
            </section>

            <section className="mb-10">
              <h2 className="!text-[12px] !font-black text-[#1f1f1f]">{bt("sections.updates.title")}</h2>
              <p className="mt-3">{bt("sections.updates.p1")}</p>
              <p className="mt-3">{bt("sections.updates.p2")}</p>
            </section>
          </article>
        </div>
      </main>
    </PublicVitrineShell>
  );
};

export default PrivacyPage;

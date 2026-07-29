import { Link, Navigate } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PublicVitrineShell } from "@/components/PublicVitrineShell";
import { useAuthUser } from "@/hooks/useAuthUser";
import { canAccessJuridiqueWorkspace } from "@/lib/authUser";
import {
  CREATION_ENTREPRISE_SLUGS,
  CREATION_ENTREPRISE_DOCS,
  JURIDIQUE_HUB_PATH,
  juridiqueDocPath,
} from "@/lib/creationEntrepriseDocs";

/**
 * Hub des documents de création d’entreprise — rôles 1 et 8 uniquement.
 */
const JuridiqueHubPage = () => {
  const { t } = useTranslation("juridique");
  const { role_id, role_name, loading } = useAuthUser();
  const allowed = canAccessJuridiqueWorkspace(role_id, role_name);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/organisation" replace />;
  }

  return (
    <PublicVitrineShell vitrinePathPrefix="/organisation" atmosphericBackdrop>
      <main className="mx-auto w-full max-w-[1060px] bg-[var(--tw-ring-offset-color)] px-5 pb-10 sm:px-6">
        <div className="rounded-2xl border border-[rgba(0,166,255,0.35)] bg-white px-5 py-8 shadow-[0_16px_48px_rgba(30,64,175,0.09)] backdrop-blur-xl sm:px-8 sm:py-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#1f1f1f]">
            {t("hub.title")}
          </h1>
          <p className="mt-2 text-sm text-neutral-600">{t("hub.subtitle")}</p>

          <ul className="mt-8 flex flex-col divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200">
            {CREATION_ENTREPRISE_SLUGS.map((slug) => {
              const doc = CREATION_ENTREPRISE_DOCS[slug];
              return (
                <li key={slug}>
                  <Link
                    to={juridiqueDocPath(slug)}
                    className="flex items-center gap-3 px-4 py-3.5 text-[#1f1f1f] transition-colors hover:bg-neutral-50"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-[#E63946]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{doc.title}</span>
                      <span className="block text-xs text-neutral-500">{doc.short}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 text-xs text-neutral-500">
            <Link to="/organisation" className="underline underline-offset-2 hover:text-[#E63946]">
              {t("hub.back_organisation")}
            </Link>
            {" · "}
            <span>{JURIDIQUE_HUB_PATH}</span>
          </p>
        </div>
      </main>
    </PublicVitrineShell>
  );
};

export default JuridiqueHubPage;

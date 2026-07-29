import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuthUser } from "@/hooks/useAuthUser";
import { canAccessJuridiqueWorkspace } from "@/lib/authUser";
import {
  CREATION_ENTREPRISE_DOCS,
  creationEntrepriseDbSlug,
  JURIDIQUE_HUB_PATH,
} from "@/lib/creationEntrepriseDocs";
import { LegalEditablePage } from "@/pages/LegalEditablePage";
import type { LegalPageSlug } from "@/lib/legalDocuments";

/**
 * Page éditable d’un document création entreprise (même moteur que /cgv).
 * Accès : admin général (1) ou juriste (8).
 */
const JuridiqueDocPage = () => {
  const { slug: pathSlug } = useParams<{ slug: string }>();
  const { role_id, role_name, loading } = useAuthUser();
  const allowed = canAccessJuridiqueWorkspace(role_id, role_name);
  const dbSlug = creationEntrepriseDbSlug(pathSlug);

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

  if (!dbSlug) {
    return <Navigate to={JURIDIQUE_HUB_PATH} replace />;
  }

  const doc = CREATION_ENTREPRISE_DOCS[dbSlug];

  return (
    <LegalEditablePage
      slug={dbSlug as LegalPageSlug}
      contentNamespace="juridique"
      documentTitle={doc.title}
      i18nFallback={<div dangerouslySetInnerHTML={{ __html: doc.html }} />}
    />
  );
};

export default JuridiqueDocPage;

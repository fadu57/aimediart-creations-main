import { initReactI18next } from "react-i18next";

import {
  SUPPORTED_LANGS,
  VITRINE_CORE_NAMESPACES,
  VITRINE_LEGAL_NAMESPACES,
  getInitialLanguage,
  isPublicMarketingPath,
  legalNamespaceForPath,
} from "./constants";
import i18n from "./instance";
import { loadI18nNamespaces } from "./loadNamespaces";
import { appResources } from "./appResources";
import { vitrineCoreResources } from "./vitrineResources";

let initialized = false;
let fullNamespacesLoaded = false;
const loadedLegalNamespaces = new Set<string>();

function buildInitNs(extra: string[] = []): string[] {
  return [...new Set([...VITRINE_CORE_NAMESPACES, ...extra])];
}

async function ensureInitialized(extraNs: string[] = []): Promise<void> {
  if (initialized) {
    if (extraNs.length > 0) {
      await loadI18nNamespaces(extraNs);
    }
    return;
  }

  const ns = buildInitNs(extraNs);

  await i18n.use(initReactI18next).init({
    resources: vitrineCoreResources,
    lng: getInitialLanguage(),
    fallbackLng: "fr",
    ns,
    defaultNS: "header",
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false,
      bindI18nStore: "added removed",
    },
  });

  if (extraNs.length > 0) {
    await loadI18nNamespaces(extraNs);
  }

  initialized = true;
}

/** Initialise i18n pour la vitrine (léger) ou charge tout le catalogue applicatif. */
export async function initI18nForPath(pathname: string): Promise<void> {
  if (isPublicMarketingPath(pathname)) {
    const legalNs = legalNamespaceForPath(pathname);
    const extra = legalNs ? [legalNs] : [];
    await ensureInitialized(extra);
    if (legalNs) loadedLegalNamespaces.add(legalNs);
    return;
  }

  await ensureFullI18n();
}

/** Charge les namespaces légaux si navigation client vers /cgv, /privacy, etc. */
export async function ensureVitrineNamespacesForPath(pathname: string): Promise<void> {
  if (!isPublicMarketingPath(pathname)) return;

  const legalNs = legalNamespaceForPath(pathname);
  if (!legalNs || loadedLegalNamespaces.has(legalNs)) return;

  await loadI18nNamespaces([legalNs]);
  loadedLegalNamespaces.add(legalNs);
}

function addAppResourceBundles(): void {
  for (const lng of SUPPORTED_LANGS) {
    const bundle = appResources[lng];
    for (const [ns, resources] of Object.entries(bundle)) {
      if (!i18n.hasResourceBundle(lng, ns)) {
        i18n.addResourceBundle(lng, ns, resources, true, true);
      }
    }
  }
}

/** Charge tous les namespaces (backoffice, visiteur, etc.). */
export async function ensureFullI18n(): Promise<void> {
  await ensureInitialized();

  if (fullNamespacesLoaded) return;

  addAppResourceBundles();
  await loadI18nNamespaces([...VITRINE_LEGAL_NAMESPACES]);
  fullNamespacesLoaded = true;
}

export { isPublicMarketingPath, VITRINE_LEGAL_NAMESPACES };

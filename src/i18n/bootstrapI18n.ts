import { initReactI18next } from "react-i18next";

import {
  SUPPORTED_LANGS,
  VITRINE_CORE_NAMESPACES,
  VITRINE_LEGAL_NAMESPACES,
  getInitialLanguage,
  isPublicMarketingPath,
  legalNamespaceForPath,
} from "./constants";
import type { SupportedLang } from "./constants";
import i18n from "./instance";
import { loadI18nNamespaces } from "./loadNamespaces";
import { appResources } from "./appResources";
import { legalResources } from "./legalResources";
import { vitrineCoreResources } from "./vitrineResources";

let initialized = false;
let fullNamespacesLoaded = false;
let legalBundlesRegistered = false;
const loadedLegalNamespaces = new Set<string>();

function buildInitNs(extra: string[] = []): string[] {
  return [...new Set([...VITRINE_CORE_NAMESPACES, ...extra])];
}

function isLegalNamespace(ns: string): ns is (typeof VITRINE_LEGAL_NAMESPACES)[number] {
  return (VITRINE_LEGAL_NAMESPACES as readonly string[]).includes(ns);
}

function addLegalResourceBundles(namespaces: readonly (typeof VITRINE_LEGAL_NAMESPACES)[number][] = VITRINE_LEGAL_NAMESPACES): void {
  for (const lng of SUPPORTED_LANGS) {
    const bundle = legalResources[lng as SupportedLang];
    for (const ns of namespaces) {
      if (i18n.hasResourceBundle(lng, ns)) continue;
      i18n.addResourceBundle(lng, ns, bundle[ns], true, true);
    }
  }

  for (const ns of namespaces) {
    if (SUPPORTED_LANGS.some((lng) => i18n.hasResourceBundle(lng, ns))) {
      loadedLegalNamespaces.add(ns);
    }
  }

  if (namespaces.length === VITRINE_LEGAL_NAMESPACES.length) {
    legalBundlesRegistered = true;
  }
}

function ensureLegalResourceBundles(namespaces: readonly (typeof VITRINE_LEGAL_NAMESPACES)[number][]): void {
  addLegalResourceBundles(namespaces);
}

async function loadExtraNamespaces(extraNs: string[]): Promise<void> {
  if (extraNs.length === 0) return;

  const legalNs = extraNs.filter(isLegalNamespace);
  const dynamicNs = extraNs.filter((ns) => !isLegalNamespace(ns));

  if (legalNs.length > 0) {
    ensureLegalResourceBundles(legalNs);
  }
  if (dynamicNs.length > 0) {
    await loadI18nNamespaces(dynamicNs);
  }
}

async function ensureInitialized(extraNs: string[] = []): Promise<void> {
  if (initialized) {
    await loadExtraNamespaces(extraNs);
    return;
  }

  const ns = buildInitNs(extraNs);

  await i18n.use(initReactI18next).init({
    resources: vitrineCoreResources,
    lng: getInitialLanguage(),
    fallbackLng: "fr",
    ns,
    defaultNS: "header",
    // Les JSON légaux sont ajoutés à la demande : sans ce flag,
    // hasLoadedNamespace renvoie true même si le bundle n’existe pas encore
    // → pages légales figées sur les clés (meta.title) après navigation SPA.
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false,
      bindI18n: "languageChanged loaded",
      bindI18nStore: "added removed",
    },
  });

  await loadExtraNamespaces(extraNs);

  initialized = true;
}

/** Initialise i18n pour la vitrine (léger) ou charge tout le catalogue applicatif. */
export async function initI18nForPath(pathname: string): Promise<void> {
  if (isPublicMarketingPath(pathname)) {
    // Bundles déjà importés statiquement dans legalResources — on les enregistre
    // tous dès la vitrine pour éviter le trou au clic footer (F5 OK, SPA KO).
    await ensureInitialized([...VITRINE_LEGAL_NAMESPACES]);
    return;
  }

  await ensureFullI18n();
}

/** Charge les namespaces légaux si navigation client vers /cgv, /privacy, etc. */
export function ensureVitrineNamespacesForPath(pathname: string): void {
  if (!isPublicMarketingPath(pathname)) return;

  // Idempotent : enregistre tout le pack légal (coût négligeable, JSON déjà en mémoire).
  if (!legalBundlesRegistered) {
    ensureLegalResourceBundles(VITRINE_LEGAL_NAMESPACES);
  }

  const legalNs = legalNamespaceForPath(pathname);
  if (!legalNs) return;

  const registeredNs = i18n.options.ns;
  const nsList = Array.isArray(registeredNs) ? registeredNs : registeredNs ? [registeredNs] : [];
  for (const ns of [legalNs, "legal_editor"] as const) {
    if (!nsList.includes(ns)) {
      void i18n.loadNamespaces(ns);
    }
  }
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
  if (!legalBundlesRegistered) {
    addLegalResourceBundles();
  }
  fullNamespacesLoaded = true;
}

export { isPublicMarketingPath, VITRINE_LEGAL_NAMESPACES };

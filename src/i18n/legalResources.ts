/**
 * Ressources i18n des pages légales publiques — bundlées statiquement.
 * Évite les textes vides quand import.meta.glob ne résout pas les JSON à temps.
 */
import type { SupportedLang } from "./constants";
import type { VITRINE_LEGAL_NAMESPACES } from "./constants";

import frCgv from "./locales/fr/cgv.json";
import enCgv from "./locales/en/cgv.json";
import deCgv from "./locales/de/cgv.json";
import esCgv from "./locales/es/cgv.json";
import itCgv from "./locales/it/cgv.json";

import frCookies from "./locales/fr/cookies.json";
import enCookies from "./locales/en/cookies.json";
import deCookies from "./locales/de/cookies.json";
import esCookies from "./locales/es/cookies.json";
import itCookies from "./locales/it/cookies.json";

import frPrivacy from "./locales/fr/privacy.json";
import enPrivacy from "./locales/en/privacy.json";
import dePrivacy from "./locales/de/privacy.json";
import esPrivacy from "./locales/es/privacy.json";
import itPrivacy from "./locales/it/privacy.json";

import frTerms from "./locales/fr/terms.json";
import enTerms from "./locales/en/terms.json";
import deTerms from "./locales/de/terms.json";
import esTerms from "./locales/es/terms.json";
import itTerms from "./locales/it/terms.json";

import frAiPolicy from "./locales/fr/ai_policy.json";
import enAiPolicy from "./locales/en/ai_policy.json";
import deAiPolicy from "./locales/de/ai_policy.json";
import esAiPolicy from "./locales/es/ai_policy.json";
import itAiPolicy from "./locales/it/ai_policy.json";

import frLegalPack from "./locales/fr/legal_pack.json";
import enLegalPack from "./locales/en/legal_pack.json";
import deLegalPack from "./locales/de/legal_pack.json";
import esLegalPack from "./locales/es/legal_pack.json";
import itLegalPack from "./locales/it/legal_pack.json";

type LegalNamespace = (typeof VITRINE_LEGAL_NAMESPACES)[number];

type LegalBundle = Record<LegalNamespace, Record<string, unknown>>;

export const legalResources: Record<SupportedLang, LegalBundle> = {
  fr: {
    cgv: frCgv,
    cookies: frCookies,
    privacy: frPrivacy,
    terms: frTerms,
    ai_policy: frAiPolicy,
    legal_pack: frLegalPack,
  },
  en: {
    cgv: enCgv,
    cookies: enCookies,
    privacy: enPrivacy,
    terms: enTerms,
    ai_policy: enAiPolicy,
    legal_pack: enLegalPack,
  },
  de: {
    cgv: deCgv,
    cookies: deCookies,
    privacy: dePrivacy,
    terms: deTerms,
    ai_policy: deAiPolicy,
    legal_pack: deLegalPack,
  },
  es: {
    cgv: esCgv,
    cookies: esCookies,
    privacy: esPrivacy,
    terms: esTerms,
    ai_policy: esAiPolicy,
    legal_pack: esLegalPack,
  },
  it: {
    cgv: itCgv,
    cookies: itCookies,
    privacy: itPrivacy,
    terms: itTerms,
    ai_policy: itAiPolicy,
    legal_pack: itLegalPack,
  },
};

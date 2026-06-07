/**
 * Configuration i18next — migration progressive depuis UiLanguageProvider.
 *
 * Traductions : imports JSON depuis `./locales/{{lng}}/{{ns}}.json` (chemins sous `src/i18n/locales/`).
 * Pas de HttpBackend ni de `loadPath` : tout est bundlé au build (équivalent logique à « src/i18n/locales », pas `/locales/` public).
 *
 * Sync langue : la langue est lue depuis localStorage (clé "ui_language") au démarrage,
 * puis mise à jour via i18n.changeLanguage() appelé par Header.tsx lors du changement
 * de sélecteur. UiLanguageProvider reste la source de vérité pour le reste de l'app.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import frHeader from "./locales/fr/header.json";
import enHeader from "./locales/en/header.json";
import deHeader from "./locales/de/header.json";
import esHeader from "./locales/es/header.json";
import itHeader from "./locales/it/header.json";

import frCatalogue from "./locales/fr/catalogue.json";
import enCatalogue from "./locales/en/catalogue.json";
import deCatalogue from "./locales/de/catalogue.json";
import esCatalogue from "./locales/es/catalogue.json";
import itCatalogue from "./locales/it/catalogue.json";

import frArtists from "./locales/fr/artists.json";
import enArtists from "./locales/en/artists.json";
import deArtists from "./locales/de/artists.json";
import esArtists from "./locales/es/artists.json";
import itArtists from "./locales/it/artists.json";

import frStatistiques from "./locales/fr/statistiques.json";
import enStatistiques from "./locales/en/statistiques.json";
import deStatistiques from "./locales/de/statistiques.json";
import esStatistiques from "./locales/es/statistiques.json";
import itStatistiques from "./locales/it/statistiques.json";

import frAgencies from "./locales/fr/agencies.json";
import enAgencies from "./locales/en/agencies.json";
import deAgencies from "./locales/de/agencies.json";
import esAgencies from "./locales/es/agencies.json";
import itAgencies from "./locales/it/agencies.json";

import frExpos from "./locales/fr/expos.json";
import enExpos from "./locales/en/expos.json";
import deExpos from "./locales/de/expos.json";
import esExpos from "./locales/es/expos.json";
import itExpos from "./locales/it/expos.json";

import frUtilisateurs from "./locales/fr/utilisateurs.json";
import enUtilisateurs from "./locales/en/utilisateurs.json";
import deUtilisateurs from "./locales/de/utilisateurs.json";
import esUtilisateurs from "./locales/es/utilisateurs.json";
import itUtilisateurs from "./locales/it/utilisateurs.json";

import frHome from "./locales/fr/home.json";
import enHome from "./locales/en/home.json";
import deHome from "./locales/de/home.json";
import esHome from "./locales/es/home.json";
import itHome from "./locales/it/home.json";

import frArtworkModal from "./locales/fr/artwork_modal.json";
import enArtworkModal from "./locales/en/artwork_modal.json";
import deArtworkModal from "./locales/de/artwork_modal.json";
import esArtworkModal from "./locales/es/artwork_modal.json";
import itArtworkModal from "./locales/it/artwork_modal.json";

import frVisitor from "./locales/fr/visitor.json";
import enVisitor from "./locales/en/visitor.json";
import deVisitor from "./locales/de/visitor.json";
import esVisitor from "./locales/es/visitor.json";
import itVisitor from "./locales/it/visitor.json";

import frAuth from "./locales/fr/auth.json";
import enAuth from "./locales/en/auth.json";
import deAuth from "./locales/de/auth.json";
import esAuth from "./locales/es/auth.json";
import itAuth from "./locales/it/auth.json";

import frLanding from "./locales/fr/landing.json";
import enLanding from "./locales/en/landing.json";
import deLanding from "./locales/de/landing.json";
import esLanding from "./locales/es/landing.json";
import itLanding from "./locales/it/landing.json";

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

import frTrash from "./locales/fr/trash.json";
import enTrash from "./locales/en/trash.json";
import deTrash from "./locales/de/trash.json";
import esTrash from "./locales/es/trash.json";
import itTrash from "./locales/it/trash.json";

import frSponsors from "./locales/fr/sponsors.json";
import enSponsors from "./locales/en/sponsors.json";
import deSponsors from "./locales/de/sponsors.json";
import esSponsors from "./locales/es/sponsors.json";
import itSponsors from "./locales/it/sponsors.json";

import frSettings from "./locales/fr/settings.json";
import enSettings from "./locales/en/settings.json";
import deSettings from "./locales/de/settings.json";
import esSettings from "./locales/es/settings.json";
import itSettings from "./locales/it/settings.json";

const SUPPORTED_LANGS = ["fr", "en", "de", "es", "it"] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

function getInitialLanguage(): SupportedLang {
  if (typeof window === "undefined") return "fr";
  const stored = window.localStorage.getItem("ui_language");
  return (SUPPORTED_LANGS as readonly string[]).includes(stored ?? "")
    ? (stored as SupportedLang)
    : "fr";
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { header: frHeader, catalogue: frCatalogue, artists: frArtists, statistiques: frStatistiques, agencies: frAgencies, expos: frExpos, utilisateurs: frUtilisateurs, home: frHome, artwork_modal: frArtworkModal, visitor: frVisitor, auth: frAuth, trash: frTrash, settings: frSettings, landing: frLanding, cgv: frCgv, cookies: frCookies, privacy: frPrivacy, terms: frTerms, ai_policy: frAiPolicy, legal_pack: frLegalPack, sponsors: frSponsors },
    en: { header: enHeader, catalogue: enCatalogue, artists: enArtists, statistiques: enStatistiques, agencies: enAgencies, expos: enExpos, utilisateurs: enUtilisateurs, home: enHome, artwork_modal: enArtworkModal, visitor: enVisitor, auth: enAuth, trash: enTrash, settings: enSettings, landing: enLanding, cgv: enCgv, cookies: enCookies, privacy: enPrivacy, terms: enTerms, ai_policy: enAiPolicy, legal_pack: enLegalPack, sponsors: enSponsors },
    de: { header: deHeader, catalogue: deCatalogue, artists: deArtists, statistiques: deStatistiques, agencies: deAgencies, expos: deExpos, utilisateurs: deUtilisateurs, home: deHome, artwork_modal: deArtworkModal, visitor: deVisitor, auth: deAuth, trash: deTrash, settings: deSettings, landing: deLanding, cgv: deCgv, cookies: deCookies, privacy: dePrivacy, terms: deTerms, ai_policy: deAiPolicy, legal_pack: deLegalPack, sponsors: deSponsors },
    es: { header: esHeader, catalogue: esCatalogue, artists: esArtists, statistiques: esStatistiques, agencies: esAgencies, expos: esExpos, utilisateurs: esUtilisateurs, home: esHome, artwork_modal: esArtworkModal, visitor: esVisitor, auth: esAuth, trash: esTrash, settings: esSettings, landing: esLanding, cgv: esCgv, cookies: esCookies, privacy: esPrivacy, terms: esTerms, ai_policy: esAiPolicy, legal_pack: esLegalPack, sponsors: esSponsors },
    it: { header: itHeader, catalogue: itCatalogue, artists: itArtists, statistiques: itStatistiques, agencies: itAgencies, expos: itExpos, utilisateurs: itUtilisateurs, home: itHome, artwork_modal: itArtworkModal, visitor: itVisitor, auth: itAuth, trash: itTrash, settings: itSettings, landing: itLanding, cgv: itCgv, cookies: itCookies, privacy: itPrivacy, terms: itTerms, ai_policy: itAiPolicy, legal_pack: itLegalPack, sponsors: itSponsors },
  },
  lng: getInitialLanguage(),
  fallbackLng: "fr",
  ns: ["header", "catalogue", "artists", "statistiques", "agencies", "expos", "utilisateurs", "home", "artwork_modal", "visitor", "auth", "trash", "settings", "landing", "cgv", "cookies", "privacy", "terms", "ai_policy", "legal_pack", "sponsors"],
  defaultNS: "header",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

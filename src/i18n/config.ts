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

import frTrash from "./locales/fr/trash.json";
import enTrash from "./locales/en/trash.json";
import deTrash from "./locales/de/trash.json";
import esTrash from "./locales/es/trash.json";
import itTrash from "./locales/it/trash.json";

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
    fr: { header: frHeader, catalogue: frCatalogue, artists: frArtists, statistiques: frStatistiques, agencies: frAgencies, expos: frExpos, utilisateurs: frUtilisateurs, home: frHome, artwork_modal: frArtworkModal, visitor: frVisitor, auth: frAuth, trash: frTrash, settings: frSettings },
    en: { header: enHeader, catalogue: enCatalogue, artists: enArtists, statistiques: enStatistiques, agencies: enAgencies, expos: enExpos, utilisateurs: enUtilisateurs, home: enHome, artwork_modal: enArtworkModal, visitor: enVisitor, auth: enAuth, trash: enTrash, settings: enSettings },
    de: { header: deHeader, catalogue: deCatalogue, artists: deArtists, statistiques: deStatistiques, agencies: deAgencies, expos: deExpos, utilisateurs: deUtilisateurs, home: deHome, artwork_modal: deArtworkModal, visitor: deVisitor, auth: deAuth, trash: deTrash, settings: deSettings },
    es: { header: esHeader, catalogue: esCatalogue, artists: esArtists, statistiques: esStatistiques, agencies: esAgencies, expos: esExpos, utilisateurs: esUtilisateurs, home: esHome, artwork_modal: esArtworkModal, visitor: esVisitor, auth: esAuth, trash: esTrash, settings: esSettings },
    it: { header: itHeader, catalogue: itCatalogue, artists: itArtists, statistiques: itStatistiques, agencies: itAgencies, expos: itExpos, utilisateurs: itUtilisateurs, home: itHome, artwork_modal: itArtworkModal, visitor: itVisitor, auth: itAuth, trash: itTrash, settings: itSettings },
  },
  lng: getInitialLanguage(),
  fallbackLng: "fr",
  ns: ["header", "catalogue", "artists", "statistiques", "agencies", "expos", "utilisateurs", "home", "artwork_modal", "visitor", "auth", "trash", "settings"],
  defaultNS: "header",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

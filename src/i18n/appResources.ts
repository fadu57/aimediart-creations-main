/**
 * Ressources i18n backoffice + visiteur (bundlé statiquement).
 * Évite l'affichage des clés brutes (ex. tableau_archive_aria) quand les namespaces
 * ne sont pas encore chargés via import.meta.glob.
 */
import type { SupportedLang } from "./constants";

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

import frSponsors from "./locales/fr/sponsors.json";
import enSponsors from "./locales/en/sponsors.json";
import deSponsors from "./locales/de/sponsors.json";
import esSponsors from "./locales/es/sponsors.json";
import itSponsors from "./locales/it/sponsors.json";

import frDashboard from "./locales/fr/dashboard.json";
import enDashboard from "./locales/en/dashboard.json";
import deDashboard from "./locales/de/dashboard.json";
import esDashboard from "./locales/es/dashboard.json";
import itDashboard from "./locales/it/dashboard.json";

type AppResourceBundle = {
  catalogue: typeof frCatalogue;
  artists: typeof frArtists;
  statistiques: typeof frStatistiques;
  agencies: typeof frAgencies;
  expos: typeof frExpos;
  utilisateurs: typeof frUtilisateurs;
  artwork_modal: typeof frArtworkModal;
  visitor: typeof frVisitor;
  auth: typeof frAuth;
  trash: typeof frTrash;
  settings: typeof frSettings;
  sponsors: typeof frSponsors;
  dashboard: typeof frDashboard;
};

export const appResources: Record<SupportedLang, AppResourceBundle> = {
  fr: {
    catalogue: frCatalogue,
    artists: frArtists,
    statistiques: frStatistiques,
    agencies: frAgencies,
    expos: frExpos,
    utilisateurs: frUtilisateurs,
    artwork_modal: frArtworkModal,
    visitor: frVisitor,
    auth: frAuth,
    trash: frTrash,
    settings: frSettings,
    sponsors: frSponsors,
    dashboard: frDashboard,
  },
  en: {
    catalogue: enCatalogue,
    artists: enArtists,
    statistiques: enStatistiques,
    agencies: enAgencies,
    expos: enExpos,
    utilisateurs: enUtilisateurs,
    artwork_modal: enArtworkModal,
    visitor: enVisitor,
    auth: enAuth,
    trash: enTrash,
    settings: enSettings,
    sponsors: enSponsors,
    dashboard: enDashboard,
  },
  de: {
    catalogue: deCatalogue,
    artists: deArtists,
    statistiques: deStatistiques,
    agencies: deAgencies,
    expos: deExpos,
    utilisateurs: deUtilisateurs,
    artwork_modal: deArtworkModal,
    visitor: deVisitor,
    auth: deAuth,
    trash: deTrash,
    settings: deSettings,
    sponsors: deSponsors,
    dashboard: deDashboard,
  },
  es: {
    catalogue: esCatalogue,
    artists: esArtists,
    statistiques: esStatistiques,
    agencies: esAgencies,
    expos: esExpos,
    utilisateurs: esUtilisateurs,
    artwork_modal: esArtworkModal,
    visitor: esVisitor,
    auth: esAuth,
    trash: esTrash,
    settings: esSettings,
    sponsors: esSponsors,
    dashboard: esDashboard,
  },
  it: {
    catalogue: itCatalogue,
    artists: itArtists,
    statistiques: itStatistiques,
    agencies: itAgencies,
    expos: itExpos,
    utilisateurs: itUtilisateurs,
    artwork_modal: itArtworkModal,
    visitor: itVisitor,
    auth: itAuth,
    trash: itTrash,
    settings: itSettings,
    sponsors: itSponsors,
    dashboard: itDashboard,
  },
};

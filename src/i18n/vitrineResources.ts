/**
 * Ressources i18n minimales pour la vitrine marketing (header + home + landing).
 * Bundlé de façon statique — léger comparé au catalogue complet.
 */
import frHeader from "./locales/fr/header.json";
import enHeader from "./locales/en/header.json";
import deHeader from "./locales/de/header.json";
import esHeader from "./locales/es/header.json";
import itHeader from "./locales/it/header.json";

import frHome from "./locales/fr/home.json";
import enHome from "./locales/en/home.json";
import deHome from "./locales/de/home.json";
import esHome from "./locales/es/home.json";
import itHome from "./locales/it/home.json";

import frLanding from "./locales/fr/landing.json";
import enLanding from "./locales/en/landing.json";
import deLanding from "./locales/de/landing.json";
import esLanding from "./locales/es/landing.json";
import itLanding from "./locales/it/landing.json";

import type { SupportedLang } from "./constants";

export const vitrineCoreResources: Record<
  SupportedLang,
  { header: typeof frHeader; home: typeof frHome; landing: typeof frLanding }
> = {
  fr: { header: frHeader, home: frHome, landing: frLanding },
  en: { header: enHeader, home: enHome, landing: enLanding },
  de: { header: deHeader, home: deHome, landing: deLanding },
  es: { header: esHeader, home: esHome, landing: esLanding },
  it: { header: itHeader, home: itHome, landing: itLanding },
};

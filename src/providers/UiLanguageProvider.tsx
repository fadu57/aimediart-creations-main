import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type UiLanguage = "fr" | "en" | "es" | "de" | "it";

const UI_LANGUAGE_STORAGE_KEY = "ui_language";
const DEFAULT_UI_LANGUAGE: UiLanguage = "fr";
const FALLBACK_TRANSLATIONS: Record<UiLanguage, Record<string, string>> = {
  fr: {},
  en: {
    Bonjour: "Hello",
    "Langue de l'interface": "Interface language",
    Accueil: "Home",
    Configuration: "Settings",
    Connexion: "Log in",
    "Déconnexion": "Log out",
    Expositions: "Exhibitions",
    Utilisateurs: "Users",
    Artistes: "Artists",
    Organisation: "Organization",
    Corbeille: "Trash",
  },
  es: {
    Bonjour: "Hola",
    "Langue de l'interface": "Idioma de la interfaz",
    Accueil: "Inicio",
    Configuration: "Configuración",
    Connexion: "Iniciar sesión",
    "Déconnexion": "Cerrar sesión",
    Expositions: "Exposiciones",
    Utilisateurs: "Usuarios",
    Artistes: "Artistas",
    Organisation: "Organización",
    Corbeille: "Papelera",
  },
  de: {
    Bonjour: "Hallo",
    "Langue de l'interface": "Oberflächensprache",
    Accueil: "Startseite",
    Configuration: "Einstellungen",
    Connexion: "Anmelden",
    "Déconnexion": "Abmelden",
    Expositions: "Ausstellungen",
    Utilisateurs: "Benutzer",
    Artistes: "Künstler",
    Organisation: "Organisation",
    Corbeille: "Papierkorb",
  },
  it: {
    Bonjour: "Ciao",
    "Langue de l'interface": "Lingua dell'interfaccia",
    Accueil: "Home",
    Configuration: "Impostazioni",
    Connexion: "Accedi",
    "Déconnexion": "Disconnetti",
    Expositions: "Esposizioni",
    Utilisateurs: "Utenti",
    Artistes: "Artisti",
    Organisation: "Organizzazione",
    Corbeille: "Cestino",
  },
};

type UiLanguageContextValue = {
  language: UiLanguage;
  setLanguage: (lang: UiLanguage) => void;
  t: (frenchText: string) => string;
};

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

function normalizeForLookup(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUiLanguage(value: string | null | undefined): UiLanguage {
  if (value === "fr" || value === "en" || value === "es" || value === "de" || value === "it") {
    return value;
  }
  return DEFAULT_UI_LANGUAGE;
}

export function UiLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") return DEFAULT_UI_LANGUAGE;
    const stored = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    return normalizeUiLanguage(stored);
  });
  const [translationsByFrench, setTranslationsByFrench] = useState<Map<string, Record<string, string>>>(new Map());

  const setLanguage = (lang: UiLanguage) => {
    setLanguageState(lang);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, language);
      document.documentElement.lang = language;
    }
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    const loadTranslations = async () => {
      const enableDbLanguageTable = import.meta.env.VITE_ENABLE_DB_LANGUAGE_TABLE === "true";
      if (!enableDbLanguageTable) {
        // Par défaut on évite l'appel réseau vers `language` (absente sur plusieurs environnements).
        setTranslationsByFrench(new Map());
        return;
      }

      const { data, error } = await supabase
        .from("language")
        .select("french, english, spanish, german, italian")
        .not("french", "is", null)
        .limit(5000);

      if (cancelled) return;
      if (error || !data) {
        const errorMessage = (error?.message ?? "").toLowerCase();
        const isMissingLanguageTable =
          errorMessage.includes("could not find the table 'public.language'") ||
          errorMessage.includes("relation \"public.language\" does not exist");

        // Certains environnements n'ont pas la table `language` : on bascule silencieusement
        // sur les traductions de fallback pour éviter le bruit console (404 attendu).
        if (isMissingLanguageTable) {
          setTranslationsByFrench(new Map());
          return;
        }
        if (import.meta.env.DEV) {
          console.warn("[i18n] impossible de charger la table language:", error?.message);
        }
        return;
      }

      const map = new Map<string, Record<string, string>>();
      for (const row of data as Array<{
        french?: string | null;
        english?: string | null;
        spanish?: string | null;
        german?: string | null;
        italian?: string | null;
      }>) {
        const fr = normalizeForLookup(row.french ?? "");
        if (!fr) continue;
        map.set(fr, {
          fr,
          en: (row.english ?? "").trim(),
          es: (row.spanish ?? "").trim(),
          de: (row.german ?? "").trim(),
          it: (row.italian ?? "").trim(),
        });
      }
      setTranslationsByFrench(map);
    };

    void loadTranslations();
    return () => {
      cancelled = true;
    };
  }, []);

  const t = (frenchText: string) => {
    const source = normalizeForLookup(frenchText);
    if (!source || language === "fr") return source;
    const row = translationsByFrench.get(source);
    if (row && row[language]) return row[language];
    return FALLBACK_TRANSLATIONS[language][source] || source;
  };

  const value = useMemo(() => ({ language, setLanguage, t }), [language, translationsByFrench]);
  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage() {
  const ctx = useContext(UiLanguageContext);
  if (!ctx) {
    throw new Error("useUiLanguage doit être utilisé dans UiLanguageProvider");
  }
  return ctx;
}


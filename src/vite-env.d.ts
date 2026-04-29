/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Clé API xAI (Grok) — exposée au navigateur ; préférez un backend en production. */
  readonly VITE_XAI_API_KEY?: string;
  /** Bucket Supabase Storage pour les photos d’artistes (défaut : artist-photos). */
  readonly VITE_SUPABASE_ARTIST_PHOTOS_BUCKET?: string;
  /** UUID d’agence par défaut si la session n’expose pas `agency_id` (ex. dev). */
  readonly VITE_DEFAULT_AGENCY_ID?: string;
  /** UUID d’exposition par défaut si la session n’expose pas `expo_id` (ex. dev). */
  readonly VITE_DEFAULT_EXPO_ID?: string;
  /** URL publique du site (ex. https://app.example.com) pour les redirections e-mail Auth ; sinon `window.location.origin`. */
  readonly VITE_PUBLIC_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

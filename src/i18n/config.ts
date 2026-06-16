/**
 * Point d’entrée i18n — l’instance est initialisée par `bootstrapI18n.ts` avant le rendu React.
 * @see bootstrap.tsx
 */
export { default } from "./instance";
export {
  initI18nForPath,
  ensureFullI18n,
  ensureVitrineNamespacesForPath,
  isPublicMarketingPath,
} from "./bootstrapI18n";

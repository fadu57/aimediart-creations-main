import i18n from "./instance";
import { SUPPORTED_LANGS } from "./constants";

type NamespaceLoader = () => Promise<{ default: Record<string, unknown> }>;

function resolveNamespaceLoaders(): Record<string, NamespaceLoader> {
  const globFn = (
    import.meta as ImportMeta & {
      glob?: (pattern: string) => Record<string, NamespaceLoader>;
    }
  ).glob;
  if (typeof globFn !== "function") return {};
  return globFn("./locales/*/*.json");
}

/** Charge dynamiquement des namespaces (non inclus dans le bundle vitrine initial). */
export async function loadI18nNamespaces(namespaces: readonly string[]): Promise<void> {
  const namespaceLoaders = resolveNamespaceLoaders();
  if (Object.keys(namespaceLoaders).length === 0) return;

  const pending: Promise<void>[] = [];

  for (const lng of SUPPORTED_LANGS) {
    for (const ns of namespaces) {
      if (i18n.hasResourceBundle(lng, ns)) continue;

      const key = `./locales/${lng}/${ns}.json`;
      const loader = namespaceLoaders[key];
      if (!loader) continue;

      pending.push(
        loader().then((mod) => {
          i18n.addResourceBundle(lng, ns, mod.default, true, true);
        }),
      );
    }
  }

  await Promise.all(pending);
}

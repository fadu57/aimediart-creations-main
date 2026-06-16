/**
 * Loader ESM pour le prérendu Node : assets statiques + modules browser-only (p5, etc.).
 */
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|css|woff2?)$/i;

const EMPTY_MODULE = "export default {};";

function dataUrl(source) {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === "p5" ||
    specifier.startsWith("p5/") ||
    specifier === "gifenc" ||
    specifier.includes("vanta")
  ) {
    return {
      url: dataUrl(EMPTY_MODULE),
      format: "module",
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.includes("forestCanopyP5Mount")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export function mountForestCanopyP5(){return ()=>{}};",
    };
  }

  if (ASSET_RE.test(url)) {
    const exported = url.endsWith(".css") ? "" : url.split("/").pop() ?? "asset";
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${JSON.stringify(exported)};`,
    };
  }

  return nextLoad(url, context, nextLoad);
}

import type { ImgHTMLAttributes } from "react";

type OptimizedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "loading" | "fetchPriority"> & {
  /** Chemin WebP explicite ; sinon dérivé de src pour les URLs /public (ex. /foo.png → /foo.webp). */
  webpSrc?: string;
  /** Image LCP : eager + fetchpriority=high */
  priority?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
};

function deriveWebpSrc(src: string): string | undefined {
  if (!src.startsWith("/")) return undefined;
  if (/\.webp$/i.test(src)) return undefined;
  return src.replace(/\.(png|jpe?g)$/i, ".webp");
}

/**
 * Image avec <picture> WebP + fallback, decoding async et lazy/priority cohérents.
 */
export function OptimizedImage({
  src,
  webpSrc,
  priority = false,
  loading,
  fetchPriority,
  decoding = "async",
  alt = "",
  ...rest
}: OptimizedImageProps) {
  const resolvedWebp = webpSrc ?? deriveWebpSrc(src);
  const imgLoading = priority ? "eager" : (loading ?? "lazy");
  const imgFetchPriority = priority ? "high" : fetchPriority;

  const imgProps: ImgHTMLAttributes<HTMLImageElement> = {
    src,
    alt,
    loading: imgLoading,
    decoding,
    ...rest,
  };

  if (imgFetchPriority) {
    (imgProps as ImgHTMLAttributes<HTMLImageElement> & { fetchpriority?: string }).fetchpriority =
      imgFetchPriority;
  }

  if (resolvedWebp && resolvedWebp !== src) {
    return (
      <picture>
        <source srcSet={resolvedWebp} type="image/webp" />
        <img {...imgProps} />
      </picture>
    );
  }

  return <img {...imgProps} />;
}

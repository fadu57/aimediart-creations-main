import { useEffect, useState, type ImgHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ImageWithSkeletonProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  skeletonClassName?: string;
};

export function ImageWithSkeleton({
  wrapperClassName,
  skeletonClassName,
  className,
  onLoad,
  onError,
  src,
  alt,
  ...imgProps
}: ImageWithSkeletonProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Réinitialise l’état au changement d’URL (sinon l’ancienne image « reste » visuelle).
  useEffect(() => {
    setIsLoaded(false);
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {!isLoaded && (
        <div
          className={cn("absolute inset-0 animate-pulse bg-slate-200/70 dark:bg-slate-700/50", skeletonClassName)}
          aria-hidden
        />
      )}
      <img
        {...imgProps}
        key={src ?? ""}
        src={src}
        alt={alt ?? ""}
        className={cn("transition-opacity duration-200", isLoaded ? "opacity-100" : "opacity-0", className)}
        onLoad={(e) => {
          setIsLoaded(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setIsLoaded(true);
          onError?.(e);
        }}
      />
    </div>
  );
}

import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ImageWithSkeletonProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  skeletonClassName?: string;
};

function isImgReady(img: HTMLImageElement | null): boolean {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

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
  const imgRef = useRef<HTMLImageElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cache navigateur : onLoad peut avoir déjà eu lieu avant l’effet — ne pas rester bloqué en opacity-0.
  useLayoutEffect(() => {
    if (isImgReady(imgRef.current)) {
      setIsLoaded(true);
      return;
    }
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
        ref={imgRef}
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

import { cn } from "@/lib/utils";

const PLACEHOLDER_GRADIENTS = [
  "from-amber-200/80 via-orange-100 to-rose-100",
  "from-sky-200/80 via-blue-100 to-indigo-100",
  "from-emerald-200/80 via-teal-100 to-cyan-100",
  "from-violet-200/80 via-purple-100 to-fuchsia-100",
];

type ArtworkGroupStackPreviewProps = {
  imageUrls?: string[];
  /** Nombre total (si plus d'images que maxVisible). */
  totalCount?: number;
  maxVisible?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function ArtworkGroupStackPreview({
  imageUrls = [],
  totalCount,
  maxVisible = 4,
  size = "md",
  className,
}: ArtworkGroupStackPreviewProps) {
  const count = totalCount ?? imageUrls.length;
  const visibleCount = Math.min(maxVisible, Math.max(count, 3));
  const cardW = size === "sm" ? "w-16" : size === "lg" ? "w-28" : "w-24";
  const cardH = size === "sm" ? "h-12" : size === "lg" ? "h-20" : "h-16";
  const step = size === "sm" ? 18 : size === "lg" ? 34 : 28;
  const containerW = step * (visibleCount - 1) + (size === "sm" ? 64 : size === "lg" ? 112 : 96);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: containerW, height: size === "lg" ? 88 : size === "sm" ? 56 : 72 }}
      aria-hidden
    >
      {Array.from({ length: visibleCount }).map((_, index) => {
        const src = imageUrls[index]?.trim() || "";
        const rotation = (index - (visibleCount - 1) / 2) * 5;
        return (
          <div
            key={index}
            className={cn(
              "absolute top-1 overflow-hidden rounded-lg border-2 border-background shadow-[0_6px_18px_rgba(0,0,0,0.12)]",
              cardW,
              cardH,
            )}
            style={{
              left: index * step,
              zIndex: index + 1,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            {src ? (
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div
                className={cn(
                  "h-full w-full bg-gradient-to-br",
                  PLACEHOLDER_GRADIENTS[index % PLACEHOLDER_GRADIENTS.length],
                )}
              />
            )}
          </div>
        );
      })}
      {count > maxVisible ? (
        <span
          className="absolute -bottom-0.5 right-0 z-20 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm"
        >
          +{count - maxVisible}
        </span>
      ) : null}
    </div>
  );
}

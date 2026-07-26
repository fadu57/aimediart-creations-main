import { useTranslation } from "react-i18next";
import type { EmotionCommunityInsight as InsightData } from "@/lib/visitorTravelDiary";

type Props = {
  insight: InsightData;
  variant?: "card" | "inline";
  className?: string;
};

export function EmotionCommunityInsight({ insight, variant = "card", className = "" }: Props) {
  const { t } = useTranslation("visitor");

  if (insight.isFirstVisitor) {
    return (
      <div
        className={
          variant === "card"
            ? `min-w-0 rounded-xl border border-[#E63946]/25 bg-gradient-to-br from-[#fff5f5] to-[#faf8f3] px-3 py-2 text-center shadow-sm ${className}`
            : className
        }
      >
        <p className="break-words text-[13px] leading-snug text-neutral-700">
          <span className="mr-1 text-base" aria-hidden>
            {insight.emotionEmoji}
          </span>
          {t("diary.community_first", { emotion: insight.emotionLabel })}
        </p>
      </div>
    );
  }

  const shell =
    variant === "card"
      ? `min-w-0 rounded-xl border border-[#E63946]/20 bg-gradient-to-br from-[#fff8f6] via-[#faf8f3] to-[#f5f0e8] px-3 py-3 shadow-[0_4px_20px_rgba(230,57,70,0.08)] ${className}`
      : className;

  return (
    <div className={shell}>
      <p className="break-words text-center text-[13px] leading-snug text-neutral-800">
        <span className="mr-1 text-lg" aria-hidden>
          {insight.emotionEmoji}
        </span>
        {t("diary.community_same_prefix", { emotion: insight.emotionLabel })}
      </p>
      <p className="mt-1.5 text-center font-serif text-xl font-bold tabular-nums text-[#E63946]">
        {t("diary.community_percentage", { percent: insight.sameEmotionPercentage })}
      </p>
      <p className="mt-1 break-words text-center text-[11px] text-neutral-500">
        {t("diary.community_visitors_count", { count: insight.othersTotal })}
      </p>
    </div>
  );
}

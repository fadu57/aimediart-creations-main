import { describe, expect, it } from "vitest";
import {
  expandSlidesForInfiniteCarousel,
  mediationCarouselLogicalIndex,
} from "@/lib/mediationSwiperLoop";

describe("mediationSwiperLoop", () => {
  it("duplique jusqu’à 14 slides pour une boucle auto", () => {
    const base = Array.from({ length: 8 }, (_, i) => ({ sid: `p${i}`, label: `P${i}` }));
    const expanded = expandSlidesForInfiniteCarousel(base);
    expect(expanded.length).toBeGreaterThanOrEqual(14);
    expect(new Set(expanded.map((s) => s.loopSlideKey)).size).toBe(expanded.length);
  });

  it("mappe l’index Swiper vers le persona logique", () => {
    expect(mediationCarouselLogicalIndex(7, 8)).toBe(7);
    expect(mediationCarouselLogicalIndex(8, 8)).toBe(0);
    expect(mediationCarouselLogicalIndex(15, 8)).toBe(7);
  });
});

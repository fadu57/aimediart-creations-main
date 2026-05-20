/**
 * Aide Swiper loop + slidesPerView "auto" : assez de slides DOM + index logique (personas réels).
 */

export type MediationCarouselSlide<T extends { sid: string }> = T & {
  /** Clé React unique (copies pour la boucle). */
  loopSlideKey: string;
};

/** Minimum de slides pour éviter le warning Swiper loop avec centeredSlides + auto. */
const MIN_CAROUSEL_SLIDES_FOR_LOOP = 14;

export function expandSlidesForInfiniteCarousel<T extends { sid: string }>(
  slides: T[],
): MediationCarouselSlide<T>[] {
  const n = slides.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{ ...slides[0], loopSlideKey: slides[0].sid }];
  }
  if (n >= MIN_CAROUSEL_SLIDES_FOR_LOOP) {
    return slides.map((slide, index) => ({
      ...slide,
      loopSlideKey: `${slide.sid}__${index}`,
    }));
  }
  const out: MediationCarouselSlide<T>[] = [];
  let copy = 0;
  while (out.length < MIN_CAROUSEL_SLIDES_FOR_LOOP) {
    for (let i = 0; i < n; i += 1) {
      const slide = slides[i];
      out.push({
        ...slide,
        loopSlideKey: `${slide.sid}__dup${copy}_${i}`,
      });
      if (out.length >= MIN_CAROUSEL_SLIDES_FOR_LOOP) break;
    }
    copy += 1;
  }
  return out;
}

/** Index persona réel (0 … count-1) depuis l’index Swiper (y compris slides dupliqués). */
export function mediationCarouselLogicalIndex(swiperIndex: number, logicalCount: number): number {
  if (logicalCount <= 0) return 0;
  const i = Math.floor(swiperIndex);
  return ((i % logicalCount) + logicalCount) % logicalCount;
}

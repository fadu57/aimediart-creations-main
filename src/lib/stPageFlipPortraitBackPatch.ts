/** StPageFlip — FlipDirection (page-flip) */
const FLIP_DIRECTION_FORWARD = 0;
const FLIP_DIRECTION_BACK = 1;

type PageCollectionLike = {
  getFlippingPage: (direction: number) => unknown;
  getCurrentSpreadIndex: () => number;
  pages: Array<{ newTemporaryCopy: () => unknown }>;
  render: { getOrientation: () => string };
};

type RenderDrawContext = {
  bottomPage: null | {
    getElement: () => HTMLElement;
    draw: (density?: unknown) => void;
  };
  flippingPage: null | { getDrawingDensity: () => unknown };
  getSettings: () => { startZIndex: number };
};

type PageFlipLike = {
  getPageCollection: () => PageCollectionLike;
  getRender: () => object;
  getFlipController: () => { flip: (point: { x: number; y: number }) => void };
};

let getFlippingPagePatched = false;
let drawBottomPagePatched = false;
let flipRestored = false;

let originalGetFlippingPage: ((this: PageCollectionLike, direction: number) => unknown) | null =
  null;

/** Restaure flip() natif si un ancien patch l'avait remplacé (hot reload). */
function restoreNativeFlipIfNeeded(pageFlip: PageFlipLike): void {
  if (flipRestored) return;

  const controller = pageFlip.getFlipController();
  const flipProto = Object.getPrototypeOf(controller) as {
    flip?: (point: { x: number; y: number }) => void;
    __aimediartNativeFlip?: (point: { x: number; y: number }) => void;
    __aimediartBrokenFlipPatch?: boolean;
  };

  if (flipProto.__aimediartBrokenFlipPatch && flipProto.__aimediartNativeFlip) {
    flipProto.flip = flipProto.__aimediartNativeFlip;
    delete flipProto.__aimediartBrokenFlipPatch;
  }

  flipRestored = true;
}

function patchPortraitBackFlippingPage(collection: PageCollectionLike): void {
  if (getFlippingPagePatched) return;

  const collectionProto = Object.getPrototypeOf(collection) as PageCollectionLike;
  originalGetFlippingPage = collectionProto.getFlippingPage;

  collectionProto.getFlippingPage = function (this: PageCollectionLike, direction: number) {
    if (direction === FLIP_DIRECTION_BACK && this.render.getOrientation() === "portrait") {
      return this.pages[this.getCurrentSpreadIndex()].newTemporaryCopy();
    }

    return originalGetFlippingPage!.call(this, direction);
  };

  getFlippingPagePatched = true;
}

/** StPageFlip ne dessine pas bottomPage en portrait+BACK — on force le rendu. */
function patchPortraitBackBottomPageDraw(render: object): void {
  if (drawBottomPagePatched) return;

  const renderProto = Object.getPrototypeOf(render) as {
    drawBottomPage?: (this: RenderDrawContext) => void;
  };

  if (!renderProto.drawBottomPage) return;

  renderProto.drawBottomPage = function (this: RenderDrawContext) {
    if (this.bottomPage === null) return;

    const tempDensity = this.flippingPage !== null ? this.flippingPage.getDrawingDensity() : null;
    this.bottomPage.getElement().style.zIndex = (this.getSettings().startZIndex + 3).toString(10);
    this.bottomPage.draw(tempDensity);
  };

  drawBottomPagePatched = true;
}

/**
 * Correctifs StPageFlip portrait pour le retour arrière :
 * - clone de la page courante qui se plie (comme en forward)
 * - page précédente visible en dessous pendant l'animation
 *
 * flip() natif conserve sa trajectoire ; seule la géométrie BACK du moteur s'applique.
 */
export function ensureStPageFlipPortraitBackPatch(pageFlip: PageFlipLike): void {
  restoreNativeFlipIfNeeded(pageFlip);
  patchPortraitBackFlippingPage(pageFlip.getPageCollection());
  patchPortraitBackBottomPageDraw(pageFlip.getRender());
}

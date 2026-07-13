import p5 from "p5";

import {
  DEFAULT_RESOLVED_FOREST_CANOPY_CONFIG,
  type ResolvedForestCanopyConfig,
} from "@/lib/forestCanopySettings";

const SB_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export type ForestCanopyStripOptions = {
  mode: "strip";
  /** Élément dont on lit la largeur (souvent le même que le conteneur p5). */
  widthElement: HTMLElement;
  /** Clic valide sur le canvas (ex. ouvrir /expo dans un nouvel onglet). */
  onCanvasClickOpenCast: () => void;
};

export type ForestCanopyFullscreenOptions = {
  mode: "fullscreen";
};

export type ForestCanopyMountOptions = ForestCanopyStripOptions | ForestCanopyFullscreenOptions;

/**
 * Monte la canopée p5 dans `mount` (bandeau ou plein écran cast).
 * Chaque instance a sa propre liste de mots (pas de tableau global partagé).
 */
export function mountForestCanopyP5(
  mount: HTMLElement,
  options: ForestCanopyMountOptions,
  config: ResolvedForestCanopyConfig = DEFAULT_RESOLVED_FOREST_CANOPY_CONFIG,
): () => void {
  const cfg = config;
  const isStrip = options.mode === "strip";
  const stripEl = isStrip ? options.widthElement : mount;
  const wordsFromDB: string[] = [];
  /** Debounce redimensionnement (hors draw) — évite rafales resize sur TV. */
  let resizeDebounceId: ReturnType<typeof setTimeout> | null = null;

  const overlayBurstCount = (strip: boolean): number => {
    if (strip) {
      const min = cfg.overlayBurstStripMin;
      const max = cfg.overlayBurstStripMax;
      if (min >= max) return min;
      return min + Math.floor(Math.random() * (max - min + 1));
    }
    const min = cfg.overlayBurstFullscreenMin;
    const max = cfg.overlayBurstFullscreenMax;
    if (min >= max) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  async function fetchEmotions(): Promise<void> {
    wordsFromDB.length = 0;
    const base = SB_URL.replace(/\/+$/, "");
    if (!base || !SB_KEY) return;
    try {
      const url = `${base}/rest/v1/emotions?select=*`;
      const res = await fetch(url, {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        const words = data
          .map((row: Record<string, unknown>) => [row.Emotion_F ?? row.emotion_f, row.Emotion_M ?? row.emotion_m])
          .flat()
          .filter((w): w is string => typeof w === "string" && w.trim() !== "");
        for (const w of words) {
          wordsFromDB.push(w.trim());
        }
      }
    } catch {
      /* réseau / CORS */
    }
  }

  let spawnIntervalId: ReturnType<typeof setInterval> | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const api: { resetSize: () => void } = {
    resetSize: () => {},
  };

  const sketch = (p: p5) => {
    let particles: LeafParticle[] = [];
    let canvasReady = false;
    const floatingElements: FloatingElement[] = [];

    const stripCanvasWidth = () => Math.min(cfg.stripMaxWidth, Math.max(stripEl.clientWidth, cfg.stripMinWidth));

    /** Taille de texte des mots liée à la largeur du canvas (p.width stable après resize). */
    const adaptiveWordFontSize = () =>
      p.constrain(p.map(p.width, 320, 2560, cfg.wordFontMin, cfg.wordFontMax), cfg.wordFontMin, cfg.wordFontMax);
    const adaptiveHeartFontSize = () =>
      p.constrain(p.map(p.width, 320, 2560, cfg.heartFontMin, cfg.heartFontMax), cfg.heartFontMin, cfg.heartFontMax);

    const overlayTextFont = () =>
      isStrip ? "system-ui, -apple-system, 'Segoe UI', sans-serif" : "Helvetica, Arial, sans-serif";

    const randomHueOutsideGreen = (): number => {
      const lo = 80;
      const hi = 170;
      for (let k = 0; k < 48; k++) {
        const h = p.random(0, 360);
        if (h < lo || h > hi) return h;
      }
      return p.random(0, lo);
    };

    /** Facteur « une frame à 60 Hz » pour scaler avec p.deltaTime (ms). */
    const dtFactor60 = (): number => {
      const dt = typeof p.deltaTime === "number" && p.deltaTime > 0 ? p.deltaTime : 1000 / 60;
      return dt / (1000 / 60);
    };

    class FloatingElement {
      kind: "word" | "heart";
      x: number;
      y: number;
      /** Vitesse verticale en px/s (vers le haut, y diminue). */
      vyPps: number;
      opacity: number;
      textStr: string;
      fontSize: number;
      wordHue: number;
      wordSat: number;
      wordBri: number;

      constructor(kind: "word" | "heart", x: number, y: number, textStr: string, fontSize: number) {
        this.kind = kind;
        this.x = x;
        this.y = y;
        this.vyPps =
          kind === "word" ? p.random(cfg.wordVyMin, cfg.wordVyMax) : p.random(cfg.heartVyMin, cfg.heartVyMax);
        this.opacity = 255;
        this.textStr = textStr;
        this.fontSize = fontSize;
        if (kind === "word") {
          this.wordHue = randomHueOutsideGreen();
          this.wordSat = p.random(80, 92);
          this.wordBri = p.random(82, 94);
        } else {
          this.wordHue = 0;
          this.wordSat = 0;
          this.wordBri = 0;
        }
      }

      update() {
        const dtSec =
          typeof p.deltaTime === "number" && p.deltaTime > 0 ? p.deltaTime / 1000 : 1 / 60;
        this.y -= this.vyPps * dtSec;
        const opacityPerSec = this.kind === "word" ? cfg.wordFadePerSec : cfg.heartFadePerSec;
        this.opacity -= opacityPerSec * dtSec;
      }

      isDead() {
        return this.opacity <= 1;
      }

      display() {
        const a = p.constrain(this.opacity, 0, 255);
        if (this.kind === "heart") {
          p.noStroke();
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(Math.max(cfg.heartFontMin, this.fontSize));
          p.fill(225, 35, 55, a);
          p.text("❤️", this.x, this.y);
        } else {
          p.push();
          p.colorMode(p.HSB, 360, 100, 100, 255);
          p.textFont(overlayTextFont());
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(this.fontSize);
          p.stroke(0, 0, 0, p.map(a, 0, 255, 70, 200));
          p.strokeWeight(p.constrain(this.fontSize * 0.03, 0.65, 1.45));
          p.fill(this.wordHue, this.wordSat, this.wordBri, a);
          p.text(this.textStr, this.x, this.y);
          p.noStroke();
          p.pop();
        }
      }
    }

    const spawnOverlay = () => {
      if (wordsFromDB.length === 0) return;
      const w = p.width;
      const h = p.height;
      if (w <= 0 || h <= 0) return;
      const padX = p.max(28, w * 0.02);
      const padY = p.max(20, h * 0.02);
      const x = p.random(padX, Math.max(padX + 1, w - padX));
      const y = p.random(padY, Math.max(padY + 1, h - padY));
      const useWord = p.random() < cfg.overlayWordChance;
      if (useWord) {
        const idx = Math.floor(p.random(wordsFromDB.length));
        const word = wordsFromDB[idx];
        if (word != null && typeof word === "string" && word.trim() !== "") {
          const sz = adaptiveWordFontSize() * p.random(0.94, 1.06);
          floatingElements.push(new FloatingElement("word", x, y, word.trim(), sz));
          return;
        }
      }
      floatingElements.push(
        new FloatingElement("heart", x, y, "", adaptiveHeartFontSize() * p.random(0.92, 1.08)),
      );
    };

    const spawnOverlayBurst = () => {
      const n = overlayBurstCount(isStrip);
      for (let i = 0; i < n; i++) {
        spawnOverlay();
      }
    };

    class LeafParticle {
      x: number;
      y: number;
      baseSize: number;
      r: number;
      g: number;
      b: number;
      alpha: number;
      currentSize: number;

      constructor() {
        const w = p.width;
        const h = p.height;
        this.x = p.random(w);
        this.y = p.random(h);
        const areaScale = p.constrain(Math.sqrt(w * h) / 520, 0.72, 3.2);
        this.baseSize = p.random(cfg.leafSizeMin, cfg.leafSizeMax) * areaScale;
        this.r = p.random(cfg.leafRMin, cfg.leafRMax);
        this.g = p.random(cfg.leafGMin, cfg.leafGMax);
        this.b = p.random(cfg.leafBMin, cfg.leafBMax);
        this.alpha = cfg.leafAlpha;
        this.currentSize = this.baseSize;
      }

      update(pulse: number) {
        const f = dtFactor60();
        const n = p.noise(this.x * 0.005, this.y * 0.005, p.frameCount * 0.005);
        this.x += p.map(n, 0, 1, -0.5, 0.5) * f;
        this.y += p.map(n, 0, 1, -0.2, 0.2) * f;
        this.currentSize = this.baseSize + n * pulse * 0.5;
      }

      display() {
        p.fill(this.r, this.g, this.b, this.alpha);
        p.ellipse(this.x, this.y, this.currentSize, this.currentSize * 0.7);
        p.fill(255, 20);
        p.ellipse(this.x, this.y, this.currentSize * 0.3);
      }
    }

    const resetParticles = () => {
      particles = [];
      for (let i = 0; i < cfg.numParticles; i++) {
        particles.push(new LeafParticle());
      }
    };

    const pAny = p as unknown as {
      pixelDensity?: (d: number) => void;
      setAttributes?: (key: string, value: boolean) => void;
      displayDensity?: () => number;
    };

    const applyPixelDensity = () => {
      let raw = 1;
      if (typeof pAny.displayDensity === "function") {
        raw = pAny.displayDensity();
      } else if (typeof window !== "undefined") {
        raw = window.devicePixelRatio || 1;
      }
      const d = Math.max(1, Math.round(Number(raw) || 1));
      if (typeof pAny.pixelDensity === "function") {
        pAny.pixelDensity(d);
      }
    };

    const applyCanvasPixelatedRendering = () => {
      const canvasEl = p.canvas as HTMLCanvasElement | undefined;
      if (!canvasEl || isStrip) return;
      canvasEl.style.imageRendering = "pixelated";
    };

    const clearCanvasPixelatedRendering = () => {
      const canvasEl = p.canvas as HTMLCanvasElement | undefined;
      if (!canvasEl) return;
      canvasEl.style.removeProperty("image-rendering");
    };

    const commitCanvasResize = () => {
      if (!canvasReady) return;
      if (isStrip) {
        const w = Math.floor(stripCanvasWidth());
        if (w <= 0) return;
        if (p.width === w && p.height === cfg.canvasHeight) return;
        p.resizeCanvas(w, cfg.canvasHeight);
        applyPixelDensity();
        p.smooth();
        clearCanvasPixelatedRendering();
      } else {
        const vw = Math.floor(window.outerWidth);
        const vh = Math.floor(window.outerHeight);
        if (vw <= 0 || vh <= 0) return;
        if (p.width === vw && p.height === vh) return;
        p.resizeCanvas(vw, vh);
        applyPixelDensity();
        p.noSmooth();
        applyCanvasPixelatedRendering();
      }
      resetParticles();
    };

    const scheduleCanvasResize = () => {
      if (resizeDebounceId != null) clearTimeout(resizeDebounceId);
      resizeDebounceId = setTimeout(() => {
        resizeDebounceId = null;
        commitCanvasResize();
      }, 200);
    };

    api.resetSize = scheduleCanvasResize;

    p.setup = () => {
      try {
        if (typeof pAny.setAttributes === "function") {
          pAny.setAttributes("alpha", false);
        }
      } catch {
        /* 2D / versions sans setAttributes */
      }

      if (isStrip) {
        const w = Math.floor(stripCanvasWidth());
        p.createCanvas(w, cfg.canvasHeight);
      } else {
        p.createCanvas(Math.floor(window.outerWidth), Math.floor(window.outerHeight));
      }
      applyPixelDensity();
      if (isStrip) {
        p.smooth();
      } else {
        p.noSmooth();
      }
      p.textFont(overlayTextFont());
      p.noStroke();
      if (!isStrip) applyCanvasPixelatedRendering();
      resetParticles();
      canvasReady = true;
      void fetchEmotions();
      spawnIntervalId = setInterval(() => {
        spawnOverlayBurst();
      }, cfg.overlaySpawnIntervalMs);
    };

    if (isStrip) {
      const stripOpts = options;
      p.mouseClicked = () => {
        if (p.width <= 0 || p.height <= 0) return;
        if (!(p.mouseX >= 0 && p.mouseX <= p.width && p.mouseY >= 0 && p.mouseY <= p.height)) return;
        stripOpts.onCanvasClickOpenCast();
      };
    }

    p.draw = () => {
      if (isStrip) {
        p.cursor(p.HAND);
      } else {
        p.cursor(p.ARROW);
      }
      p.background(cfg.backgroundR, cfg.backgroundG, cfg.backgroundB, cfg.backgroundA);
      const pulse = p.sin(p.frameCount * cfg.pulseSpeed) * cfg.pulseAmplitude;
      for (const part of particles) {
        part.update(pulse);
        part.display();
      }
      for (let i = floatingElements.length - 1; i >= 0; i--) {
        const el = floatingElements[i]!;
        el.update();
        if (el.isDead()) {
          floatingElements.splice(i, 1);
        } else {
          el.display();
        }
      }
    };

    p.windowResized = () => {
      scheduleCanvasResize();
    };
  };

  const instance = new p5(sketch, mount);

  queueMicrotask(() => {
    if (isStrip) {
      resizeObserver = new ResizeObserver(() => {
        api.resetSize();
      });
      resizeObserver.observe(stripEl);
    }
  });

  return () => {
    if (resizeDebounceId != null) {
      clearTimeout(resizeDebounceId);
      resizeDebounceId = null;
    }
    if (spawnIntervalId != null) {
      clearInterval(spawnIntervalId);
      spawnIntervalId = null;
    }
    resizeObserver?.disconnect();
    instance.remove();
  };
}

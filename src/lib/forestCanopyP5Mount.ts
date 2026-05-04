import p5 from "p5";

const CANVAS_HEIGHT = 150;
const STRIP_MAX_WIDTH = 850;
const NUM_PARTICLES = 600;
/** Intervalle entre rafales d’éléments flottants (mots / cœurs) — plus court = plus vivant */
const OVERLAY_SPAWN_INTERVAL_MS = 1100;
/** Probabilité qu’un spawn soit un mot (le reste = cœur) — plus bas = plus de cœurs */
const OVERLAY_WORD_CHANCE = 0.42;
/** Combien d’éléments par rafale : bandeau 1–2, plein écran 3–4 pour une canopée plus « bavarde » */
function overlayBurstCount(isStrip: boolean): number {
  if (isStrip) return Math.random() < 0.65 ? 2 : 1;
  return 3 + (Math.random() < 0.45 ? 1 : 0);
}

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
export function mountForestCanopyP5(mount: HTMLElement, options: ForestCanopyMountOptions): () => void {
  const isStrip = options.mode === "strip";
  const stripEl = isStrip ? options.widthElement : mount;
  const wordsFromDB: string[] = [];
  /** Debounce redimensionnement (hors draw) — évite rafales resize sur TV. */
  let resizeDebounceId: ReturnType<typeof setTimeout> | null = null;

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

    const stripCanvasWidth = () => Math.min(STRIP_MAX_WIDTH, Math.max(stripEl.clientWidth, 320));

    /** Taille de texte des mots liée à la largeur du canvas (p.width stable après resize). */
    const adaptiveWordFontSize = () =>
      p.constrain(p.map(p.width, 320, 2560, 20, 50), 20, 50);
    const adaptiveHeartFontSize = () =>
      p.constrain(p.map(p.width, 320, 2560, 24, 54), 22, 58);

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
        /* px/s : même vitesse apparente quel que soit le framerate ou la densité de pixels */
        this.vyPps = kind === "word" ? p.random(10, 22) : p.random(14, 26);
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
        /* Fade lié au temps (~63 / ~99 α·s⁻¹ à l’équivalent 60 Hz) */
        const opacityPerSec = this.kind === "word" ? 63 : 99;
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
          p.textSize(Math.max(22, this.fontSize));
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
      const useWord = p.random() < OVERLAY_WORD_CHANCE;
      if (useWord) {
        const idx = Math.floor(p.random(wordsFromDB.length));
        const word = wordsFromDB[idx];
        if (word != null && typeof word === "string" && word.trim() !== "") {
          const sz = adaptiveWordFontSize() * p.random(0.94, 1.06);
          floatingElements.push(new FloatingElement("word", x, y, word.trim(), sz));
          return;
        }
      }
      floatingElements.push(new FloatingElement("heart", x, y, "", adaptiveHeartFontSize() * p.random(0.92, 1.08)));
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
        this.baseSize = p.random(12, 40) * areaScale;
        this.r = p.random(18, 48);
        this.g = p.random(80, 160);
        this.b = p.random(30, 60);
        this.alpha = 150;
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
      for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push(new LeafParticle());
      }
    };

    const pAny = p as unknown as {
      pixelDensity?: (d: number) => void;
      setAttributes?: (key: string, value: boolean) => void;
      displayDensity?: () => number;
    };

    /** DPR natif (1 sur écran standard, 2 sur Retina / beaucoup de 4K) — pas de forçage artificiel. */
    const applyPixelDensity = () => {
      const raw =
        typeof pAny.displayDensity === "function"
          ? pAny.displayDensity()
          : typeof window !== "undefined"
            ? window.devicePixelRatio || 1
            : 1;
      const d = Math.max(1, Math.round(Number(raw) || 1));
      pAny.pixelDensity?.(d);
    };

    /** Pas de scaling CSS sur le canvas : seul le flag agrandissement sans flou navigateur (TV). */
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

    /** Redimensionnement effectif : une seule fois après debounce (pas dans draw). */
    const commitCanvasResize = () => {
      if (!canvasReady) return;
      if (isStrip) {
        const w = Math.floor(stripCanvasWidth());
        if (w <= 0) return;
        if (p.width === w && p.height === CANVAS_HEIGHT) return;
        p.resizeCanvas(w, CANVAS_HEIGHT);
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
        pAny.setAttributes?.("alpha", false);
      } catch {
        /* 2D / versions sans setAttributes */
      }

      if (isStrip) {
        const w = Math.floor(stripCanvasWidth());
        p.createCanvas(w, CANVAS_HEIGHT);
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
      }, OVERLAY_SPAWN_INTERVAL_MS);
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
      p.background(5, 20, 10, 80);
      const pulse = p.sin(p.frameCount * 0.02) * 20;
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

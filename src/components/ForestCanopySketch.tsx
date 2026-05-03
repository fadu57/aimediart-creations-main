import type { CSSProperties } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import p5 from "p5";

import { cn } from "@/lib/utils";

const CANVAS_HEIGHT = 150;
const STRIP_MAX_WIDTH = 850;
const NUM_PARTICLES = 600;

const ROOT_ID = "root";

/** Styles inline du shell immersif (dimensions fines pilotées par innerWidth/innerHeight, pas 100vh). */
const IMMERSIVE_SHELL_STYLE: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  zIndex: 99999,
  backgroundColor: "#05140a",
  opacity: 1,
  visibility: "visible",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  touchAction: "none",
  WebkitTouchCallout: "none",
};

/** URL projet Supabase (lecture publique emotions si RLS le permet). */
const SB_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
/** Clé anon Supabase. */
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Mots issus des colonnes Emotion_F / Emotion_M de la table `emotions`. */
const wordsFromDB: string[] = [];

/** API exposée au React (équivalent « instance » sketch) pour resize forcé, etc. */
export type ForestCanopySketchInstance = {
  resetSize: () => void;
  applyImmersive: (active: boolean) => void;
  /** Annule le resize différé (démontage composant). */
  dispose: () => void;
};

/**
 * Charge les libellés d’émotions depuis Supabase (REST).
 * Colonnes : Emotion_F / emotion_f, Emotion_M / emotion_m (mapping flexible).
 */
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

const IMMERSIVE_POINTER_BLOCK_TYPES = [
  "mousemove",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "wheel",
  "pointerdown",
  "pointermove",
  "pointerup",
  "touchstart",
  "touchmove",
  "touchend",
  "contextmenu",
] as const;

/**
 * Canopée « pouls des visites » — sketch p5.js (adapté depuis l’éditeur p5.js Web Editor).
 * Overlays : mots (Supabase) et cœurs. Clic sur le bandeau → mode immersif plein écran.
 */
export function ForestCanopySketch({ className }: { className?: string }) {
  const [immersive, setImmersive] = useState(false);
  const stripWrapperRef = useRef<HTMLDivElement>(null);
  const immersiveShellRef = useRef<HTMLDivElement>(null);
  /** Nœud DOM créé une fois : hôte p5 (hors arbre React pour pouvoir reparenter sous #root / body). */
  const mountElRef = useRef<HTMLDivElement | null>(null);
  const immersiveRef = useRef(false);
  immersiveRef.current = immersive;
  const openImmersiveRef = useRef<() => void>(() => {});
  openImmersiveRef.current = () => setImmersive(true);
  const instanceRef = useRef<ForestCanopySketchInstance | null>(null);
  const rootDisplayBeforeImmersiveRef = useRef<string | null>(null);

  useEffect(() => {
    if (immersive) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "auto";
      };
    }
    document.body.style.overflow = "auto";
    return undefined;
  }, [immersive]);

  useEffect(() => {
    if (!immersive) return;
    const shell = () => immersiveShellRef.current;

    const blockUnlessShell = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && shell()?.contains(t)) return;
      e.stopImmediatePropagation();
    };

    const opts = { capture: true } as const;
    for (const t of IMMERSIVE_POINTER_BLOCK_TYPES) {
      window.addEventListener(t, blockUnlessShell, opts);
    }
    return () => {
      for (const t of IMMERSIVE_POINTER_BLOCK_TYPES) {
        window.removeEventListener(t, blockUnlessShell, opts);
      }
    };
  }, [immersive]);

  useEffect(() => {
    if (!immersive) return;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        instanceRef.current?.applyImmersive(true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [immersive]);

  /** Reparentage du canvas + masquage brutal de #root (le sketch vit alors sous body). */
  useLayoutEffect(() => {
    const mountEl = mountElRef.current;
    const strip = stripWrapperRef.current;
    const root = document.getElementById(ROOT_ID);
    if (!mountEl || !strip) return;

    if (!immersive) {
      return undefined;
    }

    const slot = immersiveShellRef.current?.querySelector("[data-forest-p5-slot]");
    if (!slot) {
      return undefined;
    }
    slot.appendChild(mountEl);
    mountEl.style.flex = "1";
    mountEl.style.minHeight = "0";
    mountEl.style.width = "100%";
    mountEl.style.height = "100%";

    if (root) {
      rootDisplayBeforeImmersiveRef.current = root.style.display;
      root.style.display = "none";
    }

    return () => {
      strip.appendChild(mountEl);
      mountEl.style.flex = "";
      mountEl.style.minHeight = "";
      mountEl.style.width = "100%";
      mountEl.style.height = "";
      mountEl.style.minHeight = `${CANVAS_HEIGHT}px`;

      if (root) {
        const prev = rootDisplayBeforeImmersiveRef.current;
        if (prev == null || prev === "") {
          root.style.removeProperty("display");
        } else {
          root.style.display = prev;
        }
        rootDisplayBeforeImmersiveRef.current = null;
      }
    };
  }, [immersive]);

  /** Aligne le shell sur la viewport JS (barre d’adresse mobile) — cohérent avec resizeCanvas(inner*). */
  useLayoutEffect(() => {
    if (!immersive) return;
    const el = immersiveShellRef.current;
    if (!el) return;
    const syncShellToInnerViewport = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.maxWidth = `${w}px`;
      el.style.maxHeight = `${h}px`;
    };
    syncShellToInnerViewport();
    window.addEventListener("resize", syncShellToInnerViewport);
    window.visualViewport?.addEventListener("resize", syncShellToInnerViewport);
    return () => {
      window.removeEventListener("resize", syncShellToInnerViewport);
      window.visualViewport?.removeEventListener("resize", syncShellToInnerViewport);
    };
  }, [immersive]);

  const handleCloseImmersive = useCallback(() => {
    document.body.style.overflow = "auto";
    setImmersive(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        instanceRef.current?.applyImmersive(false);
      });
    });
  }, []);

  useEffect(() => {
    const strip = stripWrapperRef.current;
    if (!strip || mountElRef.current) return;

    const mountEl = document.createElement("div");
    mountEl.style.width = "100%";
    mountEl.style.minHeight = `${CANVAS_HEIGHT}px`;
    mountElRef.current = mountEl;
    strip.appendChild(mountEl);

    let spawnIntervalId: ReturnType<typeof setInterval> | null = null;

    const api: ForestCanopySketchInstance = {
      resetSize: () => {},
      applyImmersive: () => {},
      dispose: () => {},
    };
    instanceRef.current = api;

    const sketch = (p: p5) => {
      let particles: LeafParticle[] = [];
      let canvasReady = false;
      let immersiveActive = false;
      const floatingElements: FloatingElement[] = [];

      const stripCanvasWidth = () => Math.min(STRIP_MAX_WIDTH, Math.max(strip.clientWidth, 320));

      const randomHueOutsideGreen = (): number => {
        const lo = 80;
        const hi = 170;
        for (let k = 0; k < 48; k++) {
          const h = p.random(0, 360);
          if (h < lo || h > hi) return h;
        }
        return p.random(0, lo);
      };

      class FloatingElement {
        kind: "word" | "heart";
        x: number;
        y: number;
        vy: number;
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
          this.vy = p.random(0.35, 0.75);
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
          this.y -= this.vy;
          this.opacity -= 1.8;
        }

        isDead() {
          return this.opacity <= 1;
        }

        display() {
          const a = p.constrain(this.opacity, 0, 255);
          if (this.kind === "heart") {
            p.noStroke();
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(Math.max(14, this.fontSize));
            p.fill(225, 35, 55, a);
            p.text("❤️", this.x, this.y);
          } else {
            p.push();
            p.colorMode(p.HSB, 360, 100, 100, 255);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(this.fontSize);
            p.stroke(0, 0, 0, p.map(a, 0, 255, 70, 200));
            p.strokeWeight(1);
            p.fill(this.wordHue, this.wordSat, this.wordBri, a);
            p.text(this.textStr, this.x, this.y);
            p.noStroke();
            p.pop();
          }
        }
      }

      const spawnOverlay = () => {
        if (wordsFromDB.length === 0) return;
        const w = p.width > 0 ? p.width : Math.max(strip.clientWidth, 320);
        const h = p.height > 0 ? p.height : CANVAS_HEIGHT;
        const x = p.random(24, Math.max(25, w - 24));
        const y = p.random(16, Math.max(17, h - 8));
        const useWord = p.random() < 0.55;
        if (useWord) {
          const idx = Math.floor(p.random(wordsFromDB.length));
          const word = wordsFromDB[idx];
          if (word != null && typeof word === "string" && word.trim() !== "") {
            floatingElements.push(new FloatingElement("word", x, y, word.trim(), p.random(12, 28)));
            return;
          }
        }
        floatingElements.push(new FloatingElement("heart", x, y, "", p.random(16, 26)));
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
          const w = p.width > 0 ? p.width : Math.max(strip.clientWidth, 320);
          const h = p.height > 0 ? p.height : CANVAS_HEIGHT;
          this.x = p.random(w);
          this.y = p.random(h);
          this.baseSize = p.random(15, 45);
          this.r = p.random(20, 50);
          this.g = p.random(80, 160);
          this.b = p.random(30, 60);
          this.alpha = 150;
          this.currentSize = this.baseSize;
        }

        update(pulse: number) {
          const n = p.noise(this.x * 0.005, this.y * 0.005, p.frameCount * 0.005);
          this.x += p.map(n, 0, 1, -0.5, 0.5);
          this.y += p.map(n, 0, 1, -0.2, 0.2);
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
      };

      /** Plein écran : 1 pour batterie / perfs ; bandeau : densité d’écran native. */
      const applyPixelDensityForMode = () => {
        const d = immersiveActive ? 1 : Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
        pAny.pixelDensity?.(d);
      };

      let immersiveResizeTimer: ReturnType<typeof setTimeout> | null = null;
      let suppressResetUntil = 0;
      let immersiveOpaquePaintPending = false;

      const clearImmersiveResizeTimer = () => {
        if (immersiveResizeTimer != null) {
          clearTimeout(immersiveResizeTimer);
          immersiveResizeTimer = null;
        }
      };

      api.dispose = () => {
        clearImmersiveResizeTimer();
      };

      api.applyImmersive = (active: boolean) => {
        immersiveActive = active;
        if (!canvasReady) return;
        floatingElements.length = 0;
        clearImmersiveResizeTimer();
        if (!active) {
          suppressResetUntil = performance.now() + 120;
        } else {
          suppressResetUntil = 0;
        }
        immersiveResizeTimer = setTimeout(() => {
          immersiveResizeTimer = null;
          if (active) {
            p.resizeCanvas(window.innerWidth, window.innerHeight);
            immersiveOpaquePaintPending = true;
          } else {
            p.resizeCanvas(STRIP_MAX_WIDTH, CANVAS_HEIGHT);
          }
          applyPixelDensityForMode();
          resetParticles();
        }, 50);
      };

      api.resetSize = () => {
        if (!canvasReady) return;
        if (performance.now() < suppressResetUntil) return;
        if (immersiveActive) {
          p.resizeCanvas(window.innerWidth, window.innerHeight);
          applyPixelDensityForMode();
          resetParticles();
          return;
        }
        const w = stripCanvasWidth();
        if (w <= 0) return;
        p.resizeCanvas(w, CANVAS_HEIGHT);
        applyPixelDensityForMode();
        resetParticles();
      };

      p.setup = () => {
        try {
          pAny.setAttributes?.("alpha", false);
        } catch {
          /* 2D / versions sans setAttributes */
        }

        const w = stripCanvasWidth();
        p.createCanvas(w, CANVAS_HEIGHT);
        applyPixelDensityForMode();
        p.noStroke();
        resetParticles();
        canvasReady = true;
        void fetchEmotions();
        spawnIntervalId = setInterval(() => {
          spawnOverlay();
        }, 2000);
      };

      p.mouseMoved = () => {
        if (immersiveRef.current) return false;
      };

      p.mouseClicked = () => {
        if (immersiveRef.current) return;
        openImmersiveRef.current();
      };

      p.draw = () => {
        if (immersiveRef.current) {
          p.cursor(p.ARROW);
        } else {
          p.cursor(p.HAND);
        }

        if (immersiveOpaquePaintPending) {
          p.background(5, 20, 10, 255);
          immersiveOpaquePaintPending = false;
        } else {
          p.background(5, 20, 10, 80);
        }

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
        if (immersiveActive) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          p.resizeCanvas(vw, vh);
          applyPixelDensityForMode();
          resetParticles();
        } else {
          api.resetSize();
        }
      };
    };

    const instance = new p5(sketch, mountEl);

    let resizeObserver: ResizeObserver | null = null;
    const scheduleObserve = () => {
      queueMicrotask(() => {
        resizeObserver = new ResizeObserver(() => {
          api.resetSize();
        });
        resizeObserver.observe(strip);
      });
    };
    scheduleObserve();

    return () => {
      if (spawnIntervalId != null) {
        clearInterval(spawnIntervalId);
        spawnIntervalId = null;
      }
      resizeObserver?.disconnect();
      instanceRef.current?.dispose();
      instance.remove();
      instanceRef.current = null;
      const root = document.getElementById(ROOT_ID);
      if (root && root.style.display === "none") {
        const prev = rootDisplayBeforeImmersiveRef.current;
        if (prev == null || prev === "") {
          root.style.removeProperty("display");
        } else {
          root.style.display = prev;
        }
        rootDisplayBeforeImmersiveRef.current = null;
      }
      mountEl.remove();
      mountElRef.current = null;
    };
  }, []);

  const immersivePortal =
    immersive && typeof document !== "undefined" ? (
      <div ref={immersiveShellRef} style={IMMERSIVE_SHELL_STYLE}>
        <div
          data-forest-p5-slot
          style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            position: "relative",
            backgroundColor: "#05140a",
            opacity: 1,
            touchAction: "none",
          }}
        />
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-white/15 bg-black/50 px-3 py-2 text-sm text-white/95 shadow-md backdrop-blur-sm transition-colors hover:bg-white/15"
          style={{
            position: "fixed",
            zIndex: 100000,
            top: "env(safe-area-inset-top, 16px)",
            right: "env(safe-area-inset-right, 16px)",
            pointerEvents: "auto",
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCloseImmersive();
          }}
          aria-label="Fermer le mode immersif"
        >
          <X className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Fermer
        </button>
      </div>
    ) : null;

  return (
    <>
      <div
        ref={stripWrapperRef}
        className={cn(!immersive && "relative cursor-pointer", !immersive && className)}
        style={{ minHeight: CANVAS_HEIGHT, width: "100%" }}
        aria-hidden={immersive}
      />
      {immersivePortal != null ? createPortal(immersivePortal, document.body) : null}
    </>
  );
}

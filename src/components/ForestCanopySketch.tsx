import { useEffect, useRef } from "react";
import p5 from "p5";

const CANVAS_HEIGHT = 150;
const NUM_PARTICLES = 600;

/**
 * Canopée « pouls des visites » — sketch p5.js (adapté depuis l’éditeur p5.js Web Editor).
 */
export function ForestCanopySketch({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const api = {
      resetSize: () => {},
    };

    const sketch = (p: p5) => {
      let particles: LeafParticle[] = [];
      let canvasReady = false;

      /** Couleur en RGBA numérique — évite p.color() avant que le renderer soit prêt */
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
          const w = p.width > 0 ? p.width : Math.max(container.clientWidth, 320);
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

      api.resetSize = () => {
        if (!canvasReady) return;
        const w = Math.max(container.clientWidth, 320);
        if (w <= 0) return;
        p.resizeCanvas(w, CANVAS_HEIGHT);
        resetParticles();
      };

      p.setup = () => {
        const w = Math.max(container.clientWidth, 320);
        p.createCanvas(w, CANVAS_HEIGHT);
        p.noStroke();
        resetParticles();
        canvasReady = true;
      };

      p.draw = () => {
        p.background(5, 20, 10, 80);
        const pulse = p.sin(p.frameCount * 0.02) * 20;
        for (const part of particles) {
          part.update(pulse);
          part.display();
        }
      };

      p.windowResized = () => {
        api.resetSize();
      };
    };

    const instance = new p5(sketch, container);

    let resizeObserver: ResizeObserver | null = null;
    const scheduleObserve = () => {
      queueMicrotask(() => {
        resizeObserver = new ResizeObserver(() => {
          api.resetSize();
        });
        resizeObserver.observe(container);
      });
    };
    scheduleObserve();

    return () => {
      resizeObserver?.disconnect();
      instance.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: CANVAS_HEIGHT }}
      aria-hidden
    />
  );
}

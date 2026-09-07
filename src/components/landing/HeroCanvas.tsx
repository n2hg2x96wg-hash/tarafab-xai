import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const PARTICLE_COUNT = 42;
const LINK_DISTANCE = 130;

/**
 * Lightweight animated constellation of drifting nodes connected by lines —
 * an abstract AI/market-network motif rendered on a single canvas.
 * Pauses when offscreen, when the tab is hidden, or when the user prefers
 * reduced motion (renders one static frame instead).
 */
export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let rafId = 0;
    let running = false;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: 1.2 + Math.random() * 1.8,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const isDark = document.documentElement.classList.contains('dark');
      const nodeColor = isDark ? 'rgba(45, 212, 191, 0.55)' : 'rgba(20, 184, 166, 0.4)';
      const lineColor = isDark ? 'rgba(45, 212, 191, 0.10)' : 'rgba(20, 184, 166, 0.10)';
      const goldColor = isDark ? 'rgba(245, 205, 108, 0.4)' : 'rgba(234, 179, 8, 0.3)';

      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DISTANCE) {
            ctx.globalAlpha = 1 - dist / LINK_DISTANCE;
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      particles.forEach((p, index) => {
        ctx.fillStyle = index % 7 === 0 ? goldColor : nodeColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const step = () => {
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
      });
      draw();
      if (running) {
        rafId = requestAnimationFrame(step);
      }
    };

    const startLoop = () => {
      if (running || reducedMotion || !visible || document.hidden) return;
      running = true;
      rafId = requestAnimationFrame(step);
    };

    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    resize();
    seed();

    if (reducedMotion) {
      draw(); // static frame only
    } else {
      startLoop();
    }

    const handleResize = () => {
      resize();
      seed();
      if (reducedMotion) draw();
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        startLoop();
      } else {
        stopLoop();
      }
    });
    observer.observe(canvas);

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      stopLoop();
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

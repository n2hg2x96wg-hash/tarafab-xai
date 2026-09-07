import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 to `target` once the returned ref scrolls into view.
 * Returns the current value plus a ref to attach to the observed element.
 * Snaps straight to the target when the user prefers reduced motion.
 */
export function useCountUp(target: number, duration = 1600) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || startedRef.current) return;

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (prefersReducedMotion) {
        setValue(target);
        return;
      }
      const startTime = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        // easeOutCubic for a smooth decelerating count.
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(target * eased));
        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === 'undefined') {
      start();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target, duration]);

  return { ref, value };
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

type RevealVariant = 'up' | 'left' | 'right' | 'scale';

interface RevealProps {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
  /** Stagger delay in milliseconds before the entrance transition runs. */
  delay?: number;
}

const variantClass: Record<RevealVariant, string> = {
  up: '',
  left: 'reveal-left',
  right: 'reveal-right',
  scale: 'reveal-scale',
};

/**
 * Scroll-triggered entrance animation. Adds `is-visible` once the element
 * enters the viewport; CSS in index.css handles the actual transition and
 * disables it entirely for users with prefers-reduced-motion.
 */
export function Reveal({ children, className, variant = 'up', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      // Legacy browsers without IntersectionObserver: reveal on the next frame.
      const rafId = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(rafId);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -48px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={clsx('reveal', variantClass[variant], visible && 'is-visible', className)}
      style={delay > 0 ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

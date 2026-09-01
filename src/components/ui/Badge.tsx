import type { ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'gold';

const toneStyles: Record<BadgeTone, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-navy-600/60 dark:text-slate-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
  gold: 'bg-gold-500/15 text-gold-500 dark:bg-gold-500/15 dark:text-gold-400',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        toneStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

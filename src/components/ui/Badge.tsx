import type { ReactNode } from 'react';
import clsx from 'clsx';

export type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral' | 'info' | 'gold';

const toneStyles: Record<BadgeTone, string> = {
  success: 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300',
  danger: 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/20 dark:border-rose-500/40 dark:text-rose-300',
  warning: 'bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-300',
  neutral: 'bg-slate-100 border border-slate-200 text-slate-600 dark:bg-navy-600/40 dark:border-navy-600/60 dark:text-slate-300',
  info: 'bg-sky-50 border border-sky-200 text-sky-700 dark:bg-sky-500/20 dark:border-sky-500/40 dark:text-sky-300',
  gold: 'bg-yellow-50 border border-yellow-200 text-yellow-700 dark:bg-yellow-500/20 dark:border-yellow-500/40 dark:text-yellow-300',
};

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
        toneStyles[tone],
      )}
    >
      {children}
    </span>
  );
}

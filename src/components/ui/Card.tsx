import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
}

export function Card({ children, className, hoverable = false, ...rest }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300',
        'dark:border-navy-600/60 dark:bg-navy-800',
        hoverable && 'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-black/30',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

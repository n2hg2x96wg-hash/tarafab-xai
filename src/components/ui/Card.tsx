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
        'rounded-2xl border border-slate-200/50 bg-white p-6 shadow-md transition-all duration-300',
        'dark:border-navy-600/40 dark:bg-gradient-to-br dark:from-navy-800 dark:to-navy-900',
        'bg-gradient-to-br from-white to-slate-50/50',
        hoverable && 'cursor-pointer hover:-translate-y-1 hover:shadow-xl hover:shadow-teal-500/10 dark:hover:shadow-teal-500/20',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

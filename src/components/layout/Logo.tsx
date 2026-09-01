import { Link } from 'react-router-dom';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`group flex items-center gap-2 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-teal-400 shadow-inner shadow-black/30 transition-transform group-hover:scale-105 dark:bg-navy-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path d="M4 6h16v3H14v9h-4V9H4V6z" fill="currentColor" />
          <circle cx="18" cy="4.5" r="1.6" fill="#eab308" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
        Tarafab<span className="text-teal-500">.XAi</span>
      </span>
    </Link>
  );
}

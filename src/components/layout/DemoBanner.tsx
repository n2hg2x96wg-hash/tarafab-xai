export function DemoBanner() {
  return (
    <div className="bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 px-4 py-2 text-center text-xs font-medium text-teal-300">
      <span className="inline-flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Fictional Demo / Simulation — all figures, accounts, and transactions are simulated and not real financial advice or a real investment product.
      </span>
    </div>
  );
}

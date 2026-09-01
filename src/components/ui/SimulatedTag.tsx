export function SimulatedTag({ label = 'Simulated Data' }: { label?: string }) {
  return (
    <span
      title="All figures on this page are fictional and simulated for demo purposes only."
      className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-teal-600 uppercase dark:text-teal-400"
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
      {label}
    </span>
  );
}

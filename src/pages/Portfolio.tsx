import { Card } from '../components/ui/Card';

export function Portfolio() {
  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Portfolio</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Your verified asset positions and performance will appear here.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Total Value', 'Best Performer', 'Worst Performer', 'Diversification Score'].map((label) => (
          <Card key={label} hoverable>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-3 text-lg font-bold text-slate-400">—</p>
            <p className="text-xs text-slate-400">Awaiting verified portfolio data</p>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900 dark:text-white">Asset Allocation</h2>
          <div className="flex min-h-[260px] items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">No verified asset allocation is available yet.</div>
        </Card>
        <Card>
          <h2 className="font-semibold text-slate-900 dark:text-white">Performance History</h2>
          <div className="flex min-h-[260px] items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">Performance history will appear after verified portfolio activity is recorded.</div>
        </Card>
      </div>
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Allocation Breakdown</h2>
        <div className="flex min-h-[120px] items-center justify-center text-sm text-slate-500 dark:text-slate-400">No verified portfolio positions to display.</div>
      </Card>
    </div>
  );
}

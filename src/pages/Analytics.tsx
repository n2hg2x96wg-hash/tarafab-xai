import { Card } from '../components/ui/Card';

export function Analytics() {
  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Performance analytics will appear here when verified account activity is available.</p>
      </div>
      <Card>
        <div className="flex min-h-[320px] items-center justify-center text-center">
          <div className="max-w-md">
            <h2 className="font-semibold text-slate-900 dark:text-white">Performance data unavailable</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">There is not enough verified portfolio history to calculate performance, ROI, volatility, or growth rates yet.</p>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {['ROI', 'Volatility', 'Growth Rate'].map((label) => (
          <Card key={label} hoverable>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-400">—</p>
            <p className="text-xs text-slate-400">Awaiting verified data</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

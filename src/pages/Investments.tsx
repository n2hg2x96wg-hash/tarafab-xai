import { useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SimulatedTag } from '../components/ui/SimulatedTag';
import { Modal } from '../components/ui/Modal';
import { investmentPlans, type InvestmentPlan, type RiskLevel } from '../data/investments';
import { useToast } from '../components/ui/Toast';

const riskTone: Record<RiskLevel, 'success' | 'warning' | 'danger'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'danger',
};

export function Investments() {
  const [selectedPlan, setSelectedPlan] = useState<InvestmentPlan | null>(null);
  const { showToast } = useToast();

  const handleConfirm = () => {
    if (!selectedPlan) return;
    showToast(`Simulated investment in "${selectedPlan.name}" recorded (demo only — no real funds moved).`);
    setSelectedPlan(null);
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Investment Plans</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every plan below is a fictional demo product. Returns are simulated illustrations, not guarantees.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {investmentPlans.map((plan) => (
          <Card key={plan.id} hoverable className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge tone="gold">Demo Plan</Badge>
                <h2 className="mt-2 font-semibold text-slate-900 dark:text-white">{plan.name}</h2>
              </div>
              <Badge tone={riskTone[plan.risk]}>{plan.risk} Risk</Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Annual Return</dt>
                <dd className="font-semibold text-teal-600 dark:text-teal-400">{plan.returnRange}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Duration</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{plan.duration}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Minimum</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">${plan.minInvestment.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Category</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{plan.category}</dd>
              </div>
            </dl>
            <div className="flex items-center justify-between pt-2">
              <SimulatedTag />
              <button
                type="button"
                onClick={() => setSelectedPlan(plan)}
                className="rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-teal-300 transition-transform hover:scale-105 dark:bg-teal-500 dark:text-navy-950"
              >
                Invest (Demo)
              </button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={selectedPlan !== null} onClose={() => setSelectedPlan(null)} title="Confirm Simulated Investment">
        {selectedPlan && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You're about to simulate an investment in <strong>{selectedPlan.name}</strong>. This is a{' '}
              <strong>fictional demo action</strong> — no real money will be transferred, and no real account will be
              charged.
            </p>
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-navy-700">
              <p>
                Simulated return: <strong>{selectedPlan.returnRange}</strong>
              </p>
              <p>
                Duration: <strong>{selectedPlan.duration}</strong>
              </p>
              <p>
                Minimum: <strong>${selectedPlan.minInvestment.toLocaleString()}</strong>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-navy-500 dark:text-slate-300 dark:hover:bg-navy-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-teal-400"
              >
                Confirm Demo Investment
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

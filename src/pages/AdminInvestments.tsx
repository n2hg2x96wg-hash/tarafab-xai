import { Card } from '../components/ui/Card';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export function AdminInvestments() {
  const [editingId, setEditingId] = useState<number | null>(null);

  const investments = [
    {
      id: 1,
      name: 'Growth Portfolio',
      risk: 'High',
      minReturn: 12,
      maxReturn: 18,
      subscribers: 342,
    },
    {
      id: 2,
      name: 'Balanced Fund',
      risk: 'Medium',
      minReturn: 8,
      maxReturn: 12,
      subscribers: 567,
    },
    {
      id: 3,
      name: 'Conservative',
      risk: 'Low',
      minReturn: 4,
      maxReturn: 7,
      subscribers: 248,
    },
    {
      id: 4,
      name: 'Dividend Income',
      risk: 'Medium',
      minReturn: 6,
      maxReturn: 10,
      subscribers: 189,
    },
  ];

const getRiskColor = (risk: string): BadgeTone => {
    switch (risk) {
      case 'High':
        return 'danger';
      case 'Medium':
        return 'warning';
      case 'Low':
        return 'success';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
              ← Back
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Investment Management
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Manage investment plans and returns
              </p>
            </div>
          </div>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
            + New Plan
          </button>
        </div>

        {/* Investment Plans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {investments.map((investment) => (
            <Card key={investment.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {investment.name}
                  </h3>
                  <div className="flex gap-2 mt-2">
                    <Badge tone={getRiskColor(investment.risk)}>
                      {investment.risk} Risk
                    </Badge>
                    <Badge tone="neutral">{investment.subscribers} subscribers</Badge>
                  </div>
                </div>
                <button
                  onClick={() => setEditingId(editingId === investment.id ? null : investment.id)}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium text-sm"
                >
                  {editingId === investment.id ? 'Save' : 'Edit'}
                </button>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                      Min Return
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {investment.minReturn}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">
                      Max Return
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {investment.maxReturn}%
                    </p>
                  </div>
                </div>
              </div>

              {editingId === investment.id && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Min Return (%)
                    </label>
                    <input
                      type="number"
                      defaultValue={investment.minReturn}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Max Return (%)
                    </label>
                    <input
                      type="number"
                      defaultValue={investment.maxReturn}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

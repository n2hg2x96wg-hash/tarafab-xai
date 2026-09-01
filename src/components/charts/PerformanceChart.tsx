import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PerformancePoint } from '../../data/performance';
import { formatCurrency, formatDate } from '../../utils/format';
import { useAppSettings } from '../../context/AppSettingsContext';

interface PerformanceChartProps {
  data: PerformancePoint[];
  height?: number;
}

export function PerformanceChart({ data, height = 280 }: PerformanceChartProps) {
  const { currency } = useAppSettings();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="performanceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-navy-600" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => formatDate(value)}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="text-slate-400"
          minTickGap={40}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="text-slate-400"
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value), currency), 'Portfolio value']}
          labelFormatter={(label) => formatDate(String(label))}
          contentStyle={{
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.3)',
            fontSize: 12,
          }}
        />
        <Area type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} fill="url(#performanceGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AssetAllocation } from '../../data/portfolio';
import { formatCurrency } from '../../utils/format';
import { useAppSettings } from '../../context/AppSettingsContext';

export function AllocationDonut({ data, height = 260 }: { data: AssetAllocation[]; height?: number }) {
  const { currency } = useAppSettings();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="60%"
          outerRadius="90%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, _name, item) => [
            formatCurrency(Number(value), currency),
            String(item?.payload?.name ?? ''),
          ]}
          contentStyle={{ borderRadius: 12, border: '1px solid rgba(148,163,184,0.3)', fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

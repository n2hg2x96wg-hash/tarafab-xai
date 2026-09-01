// Portfolio performance time series data.
export interface PerformancePoint {
  date: string;
  value: number;
}

// Deterministic pseudo-random generator so charts render consistently across sessions.
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateSeries(days: number, start: number, drift: number, volatility: number, seed: number): PerformancePoint[] {
  const rand = seededRandom(seed);
  const points: PerformancePoint[] = [];
  let value = start;
  const today = new Date('2026-08-30T00:00:00Z');

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const noise = (rand() - 0.45) * volatility;
    value = Math.max(value * (1 + drift + noise), start * 0.5);
    points.push({
      date: date.toISOString().slice(0, 10),
      value: Math.round(value * 100) / 100,
    });
  }
  return points;
}

// Full two-year history used to derive all selectable ranges.
export const fullHistory: PerformancePoint[] = generateSeries(730, 92000, 0.0009, 0.018, 42);

export const performanceRanges = {
  '1W': fullHistory.slice(-7),
  '1M': fullHistory.slice(-30),
  '3M': fullHistory.slice(-90),
  '1Y': fullHistory.slice(-365),
  All: fullHistory,
};

export type PerformanceRangeKey = keyof typeof performanceRanges;

export const dashboardSeries: PerformancePoint[] = fullHistory.slice(-90);

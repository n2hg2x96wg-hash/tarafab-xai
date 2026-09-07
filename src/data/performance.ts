// Portfolio performance time series data, isolated per account.
export interface PerformancePoint {
  date: string;
  value: number;
}

export type PerformanceRangeKey = '1W' | '1M' | '3M' | '1Y' | 'All';

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

interface PerformanceConfig {
  start: number;
  drift: number;
  volatility: number;
  seed: number;
}

// Starting values and drift/volatility tuned per account's investor profile so each
// account's chart reflects its own realistic history rather than shared mock data.
const configByClient: Record<string, PerformanceConfig> = {
  'client-1': { start: 54000, drift: 0.0004, volatility: 0.006, seed: 17 }, // Conservative — steady, low volatility
  'client-2': { start: 92000, drift: 0.0009, volatility: 0.018, seed: 42 }, // Moderate — balanced growth
  'client-3': { start: 172000, drift: 0.0014, volatility: 0.032, seed: 91 }, // Growth — higher upside and swings
};

const fullHistoryByClient: Record<string, PerformancePoint[]> = Object.fromEntries(
  Object.entries(configByClient).map(([clientId, config]) => [
    clientId,
    generateSeries(730, config.start, config.drift, config.volatility, config.seed),
  ]),
);

export function getFullHistory(clientId: string): PerformancePoint[] {
  return fullHistoryByClient[clientId] ?? fullHistoryByClient['client-2'];
}

export function getPerformanceRanges(clientId: string): Record<PerformanceRangeKey, PerformancePoint[]> {
  const fullHistory = getFullHistory(clientId);
  return {
    '1W': fullHistory.slice(-7),
    '1M': fullHistory.slice(-30),
    '3M': fullHistory.slice(-90),
    '1Y': fullHistory.slice(-365),
    All: fullHistory,
  };
}

export function getDashboardSeries(clientId: string): PerformancePoint[] {
  return getFullHistory(clientId).slice(-90);
}

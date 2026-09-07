// Portfolio holdings and allocations, fully isolated per account.
export interface AssetAllocation {
  name: string;
  value: number;
  percentage: number;
  color: string;
  change24h: number;
}

export interface PortfolioStats {
  totalValue: number;
  totalInvested: number;
  profitLoss: number;
  profitLossPercent: number;
  bestPerformer: string;
  bestPerformerReturn: number;
  worstPerformer: string;
  worstPerformerReturn: number;
  diversificationScore: number;
}

export interface Holding {
  id: string;
  asset: string;
  category: string;
  units: number;
  avgCost: number;
  currentPrice: number;
  value: number;
  returnPercent: number;
}

export interface PortfolioData {
  stats: PortfolioStats;
  allocations: AssetAllocation[];
  holdings: Holding[];
}

const portfolioByClient: Record<string, PortfolioData> = {
  // Jordan Ashworth — Conservative investor: bonds, cash, and stable funds.
  'client-1': {
    stats: {
      totalValue: 58420,
      totalInvested: 54000,
      profitLoss: 4420,
      profitLossPercent: 8.19,
      bestPerformer: 'Steadfast Treasury Bonds',
      bestPerformerReturn: 6.1,
      worstPerformer: 'Cash Reserve',
      worstPerformerReturn: 0.0,
      diversificationScore: 62,
    },
    allocations: [
      { name: 'Bonds', value: 29500, percentage: 50.5, color: '#eab308', change24h: 0.1 },
      { name: 'Cash', value: 14620, percentage: 25.0, color: '#94a3b8', change24h: 0.0 },
      { name: 'Stocks', value: 11700, percentage: 20.0, color: '#2dd4bf', change24h: 0.4 },
      { name: 'Real Estate', value: 2600, percentage: 4.5, color: '#3b82f6', change24h: 0.2 },
    ],
    holdings: [
      { id: 'h1', asset: 'Steadfast Treasury Bonds', category: 'Bonds', units: 280, avgCost: 100.0, currentPrice: 105.4, value: 29512, returnPercent: 5.4 },
      { id: 'h2', asset: 'Cash Reserve', category: 'Cash', units: 1, avgCost: 14620, currentPrice: 14620, value: 14620, returnPercent: 0.0 },
      { id: 'h3', asset: 'Vertex Blue Chip', category: 'Stocks', units: 38, avgCost: 300.0, currentPrice: 308.0, value: 11704, returnPercent: 2.7 },
      { id: 'h4', asset: 'Horizon Reit Trust', category: 'Real Estate', units: 43, avgCost: 59.0, currentPrice: 60.5, value: 2601, returnPercent: 2.5 },
    ],
  },
  // Sarah Mitchell — Moderate investor: mixed stocks, bonds, real estate, and a small crypto sleeve.
  'client-2': {
    stats: {
      totalValue: 125250,
      totalInvested: 108500,
      profitLoss: 16750,
      profitLossPercent: 15.44,
      bestPerformer: 'Quantum Growth Fund',
      bestPerformerReturn: 22.8,
      worstPerformer: 'Nova Crypto Basket',
      worstPerformerReturn: -6.3,
      diversificationScore: 78,
    },
    allocations: [
      { name: 'Stocks', value: 48250, percentage: 38.6, color: '#2dd4bf', change24h: 1.2 },
      { name: 'Bonds', value: 22400, percentage: 17.9, color: '#eab308', change24h: 0.3 },
      { name: 'Real Estate', value: 18300, percentage: 14.6, color: '#3b82f6', change24h: 0.6 },
      { name: 'Crypto', value: 26150, percentage: 20.9, color: '#a855f7', change24h: -2.4 },
      { name: 'Cash', value: 10150, percentage: 8.0, color: '#94a3b8', change24h: 0.0 },
    ],
    holdings: [
      { id: 'h1', asset: 'Aurora Index Fund', category: 'Stocks', units: 120, avgCost: 210.5, currentPrice: 248.2, value: 29784, returnPercent: 17.9 },
      { id: 'h2', asset: 'Vertex Blue Chip', category: 'Stocks', units: 60, avgCost: 305.0, currentPrice: 309.4, value: 18564, returnPercent: 1.4 },
      { id: 'h3', asset: 'Nova Crypto Basket', category: 'Crypto', units: 4.2, avgCost: 4100, currentPrice: 3841, value: 16132, returnPercent: -6.3 },
      { id: 'h4', asset: 'Helio Token Reserve', category: 'Crypto', units: 950, avgCost: 9.8, currentPrice: 10.6, value: 10018, returnPercent: 8.2 },
      { id: 'h5', asset: 'Steadfast Treasury Bonds', category: 'Bonds', units: 200, avgCost: 100.0, currentPrice: 104.6, value: 20920, returnPercent: 4.6 },
      { id: 'h6', asset: 'Horizon Reit Trust', category: 'Real Estate', units: 300, avgCost: 58.0, currentPrice: 61.0, value: 18300, returnPercent: 5.2 },
      { id: 'h7', asset: 'Cash Reserve', category: 'Cash', units: 1, avgCost: 10150, currentPrice: 10150, value: 10150, returnPercent: 0.0 },
    ],
  },
  // Marcus Chen — Growth investor: technology stocks and a large crypto allocation.
  'client-3': {
    stats: {
      totalValue: 214800,
      totalInvested: 172000,
      profitLoss: 42800,
      profitLossPercent: 24.88,
      bestPerformer: 'Nova Crypto Basket',
      bestPerformerReturn: 38.6,
      worstPerformer: 'Frontier Innovation Fund',
      worstPerformerReturn: -4.1,
      diversificationScore: 54,
    },
    allocations: [
      { name: 'Crypto', value: 96660, percentage: 45.0, color: '#a855f7', change24h: 3.8 },
      { name: 'Stocks', value: 85920, percentage: 40.0, color: '#2dd4bf', change24h: 2.1 },
      { name: 'Cash', value: 21480, percentage: 10.0, color: '#94a3b8', change24h: 0.0 },
      { name: 'Real Estate', value: 10740, percentage: 5.0, color: '#3b82f6', change24h: 0.3 },
    ],
    holdings: [
      { id: 'h1', asset: 'Nova Crypto Basket', category: 'Crypto', units: 14.6, avgCost: 3750, currentPrice: 5198, value: 75893, returnPercent: 38.6 },
      { id: 'h2', asset: 'Helio Token Reserve', category: 'Crypto', units: 1960, avgCost: 8.9, currentPrice: 10.6, value: 20776, returnPercent: 19.1 },
      { id: 'h3', asset: 'Quantum Growth Fund', category: 'Stocks', units: 210, avgCost: 268.0, currentPrice: 327.9, value: 68859, returnPercent: 22.4 },
      { id: 'h4', asset: 'Frontier Innovation Fund', category: 'Stocks', units: 120, avgCost: 143.0, currentPrice: 137.2, value: 16464, returnPercent: -4.1 },
      { id: 'h5', asset: 'Cash Reserve', category: 'Cash', units: 1, avgCost: 21480, currentPrice: 21480, value: 21480, returnPercent: 0.0 },
      { id: 'h6', asset: 'Horizon Reit Trust', category: 'Real Estate', units: 176, avgCost: 58.0, currentPrice: 61.0, value: 10736, returnPercent: 5.2 },
    ],
  },
};

export function getPortfolioData(clientId: string): PortfolioData {
  return portfolioByClient[clientId] ?? portfolioByClient['client-2'];
}

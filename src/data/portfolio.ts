// Fictional demo portfolio holdings — simulated figures only, not real financial data.
export interface AssetAllocation {
  name: string;
  value: number;
  percentage: number;
  color: string;
  change24h: number;
}

export const assetAllocations: AssetAllocation[] = [
  { name: 'Stocks', value: 48250, percentage: 38.6, color: '#2dd4bf', change24h: 1.2 },
  { name: 'Crypto', value: 26150, percentage: 20.9, color: '#a855f7', change24h: -2.4 },
  { name: 'Bonds', value: 22400, percentage: 17.9, color: '#eab308', change24h: 0.3 },
  { name: 'Real Estate', value: 18300, percentage: 14.6, color: '#3b82f6', change24h: 0.6 },
  { name: 'Cash', value: 10150, percentage: 8.0, color: '#94a3b8', change24h: 0.0 },
];

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

export const portfolioStats: PortfolioStats = {
  totalValue: 125250,
  totalInvested: 108500,
  profitLoss: 16750,
  profitLossPercent: 15.44,
  bestPerformer: 'Quantum Growth Fund (Demo)',
  bestPerformerReturn: 22.8,
  worstPerformer: 'Nova Crypto Basket (Demo)',
  worstPerformerReturn: -6.3,
  diversificationScore: 78,
};

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

export const holdings: Holding[] = [
  { id: 'h1', asset: 'Aurora Index Fund (Demo)', category: 'Stocks', units: 120, avgCost: 210.5, currentPrice: 248.2, value: 29784, returnPercent: 17.9 },
  { id: 'h2', asset: 'Vertex Blue Chip (Demo)', category: 'Stocks', units: 60, avgCost: 305.0, currentPrice: 309.4, value: 18564, returnPercent: 1.4 },
  { id: 'h3', asset: 'Nova Crypto Basket (Demo)', category: 'Crypto', units: 4.2, avgCost: 4100, currentPrice: 3841, value: 16132, returnPercent: -6.3 },
  { id: 'h4', asset: 'Helio Token Reserve (Demo)', category: 'Crypto', units: 950, avgCost: 9.8, currentPrice: 10.6, value: 10018, returnPercent: 8.2 },
  { id: 'h5', asset: 'Steadfast Treasury Bonds (Demo)', category: 'Bonds', units: 200, avgCost: 100.0, currentPrice: 104.6, value: 20920, returnPercent: 4.6 },
  { id: 'h6', asset: 'Horizon Reit Trust (Demo)', category: 'Real Estate', units: 300, avgCost: 58.0, currentPrice: 61.0, value: 18300, returnPercent: 5.2 },
  { id: 'h7', asset: 'Demo Cash Reserve', category: 'Cash', units: 1, avgCost: 10150, currentPrice: 10150, value: 10150, returnPercent: 0.0 },
];

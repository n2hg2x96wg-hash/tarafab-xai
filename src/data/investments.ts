// Investment plans with return ranges and risk levels
export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface InvestmentPlan {
  id: string;
  name: string;
  description: string;
  returnRange: string;
  duration: string;
  minInvestment: number;
  risk: RiskLevel;
  category: string;
}

export const investmentPlans: InvestmentPlan[] = [
  {
    id: 'plan-steady-income',
    name: 'Steady Income Plan',
    description: 'A conservative allocation weighted toward bonds and cash equivalents, designed to model stable, low-volatility growth.',
    returnRange: '3–5% / yr',
    duration: '6 months',
    minInvestment: 500,
    risk: 'Low',
    category: 'Fixed Income',
  },
  {
    id: 'plan-balanced-growth',
    name: 'Balanced Growth Plan',
    description: 'A diversified mix of equities and bonds intended to model moderate growth with managed volatility.',
    returnRange: '6–10% / yr',
    duration: '12 months',
    minInvestment: 1000,
    risk: 'Medium',
    category: 'Balanced',
  },
  {
    id: 'plan-quantum-growth',
    name: 'Quantum Growth Fund',
    description: 'An equity-heavy strategy modeling higher growth potential across technology-themed holdings.',
    returnRange: '9–15% / yr',
    duration: '18 months',
    minInvestment: 2500,
    risk: 'Medium',
    category: 'Equities',
  },
  {
    id: 'plan-nova-crypto',
    name: 'Nova Crypto Basket',
    description: 'A basket of digital-asset tokens modeling high-volatility, high-upside scenarios.',
    returnRange: '-10–25% / yr',
    duration: '12 months',
    minInvestment: 250,
    risk: 'High',
    category: 'Crypto',
  },
  {
    id: 'plan-horizon-reit',
    name: 'Horizon Real Estate Trust',
    description: 'A real-estate trust model reflecting rental-yield style returns with moderate volatility.',
    returnRange: '5–8% / yr',
    duration: '24 months',
    minInvestment: 1500,
    risk: 'Low',
    category: 'Real Estate',
  },
  {
    id: 'plan-frontier-innovation',
    name: 'Frontier Innovation Fund',
    description: 'An aggressive-growth fund modeling emerging-sector allocations with elevated risk/reward.',
    returnRange: '10–20% / yr',
    duration: '36 months',
    minInvestment: 3000,
    risk: 'High',
    category: 'Equities',
  },
];

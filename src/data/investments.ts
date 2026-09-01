// Fictional demo investment plans — simulated returns, not guaranteed real-world performance.
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
    name: 'Steady Income Plan (Demo)',
    description: 'A conservative simulated allocation weighted toward bonds and cash equivalents, designed to model stable, low-volatility growth.',
    returnRange: 'Simulated 3–5% / yr',
    duration: '6 months',
    minInvestment: 500,
    risk: 'Low',
    category: 'Fixed Income',
  },
  {
    id: 'plan-balanced-growth',
    name: 'Balanced Growth Plan (Demo)',
    description: 'A simulated diversified mix of equities and bonds intended to model moderate growth with managed volatility.',
    returnRange: 'Simulated 6–10% / yr',
    duration: '12 months',
    minInvestment: 1000,
    risk: 'Medium',
    category: 'Balanced',
  },
  {
    id: 'plan-quantum-growth',
    name: 'Quantum Growth Fund (Demo)',
    description: 'A simulated equity-heavy strategy modeling higher growth potential across technology-themed demo holdings.',
    returnRange: 'Simulated 9–15% / yr',
    duration: '18 months',
    minInvestment: 2500,
    risk: 'Medium',
    category: 'Equities',
  },
  {
    id: 'plan-nova-crypto',
    name: 'Nova Crypto Basket (Demo)',
    description: 'A simulated basket of fictional digital-asset tokens modeling high-volatility, high-upside scenarios.',
    returnRange: 'Simulated -10–25% / yr',
    duration: '12 months',
    minInvestment: 250,
    risk: 'High',
    category: 'Crypto',
  },
  {
    id: 'plan-horizon-reit',
    name: 'Horizon Real Estate Trust (Demo)',
    description: 'A simulated real-estate trust model reflecting rental-yield style demo returns with moderate volatility.',
    returnRange: 'Simulated 5–8% / yr',
    duration: '24 months',
    minInvestment: 1500,
    risk: 'Low',
    category: 'Real Estate',
  },
  {
    id: 'plan-frontier-innovation',
    name: 'Frontier Innovation Fund (Demo)',
    description: 'A simulated aggressive-growth demo fund modeling emerging-sector allocations with elevated risk/reward.',
    returnRange: 'Simulated 10–20% / yr',
    duration: '36 months',
    minInvestment: 3000,
    risk: 'High',
    category: 'Equities',
  },
];

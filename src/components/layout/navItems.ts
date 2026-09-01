export interface NavItem {
  label: string;
  to: string;
  icon: string;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: 'grid' },
  { label: 'Investments', to: '/investments', icon: 'trending-up' },
  { label: 'Portfolio', to: '/portfolio', icon: 'pie-chart' },
  { label: 'Transactions', to: '/transactions', icon: 'list' },
  { label: 'Analytics', to: '/analytics', icon: 'bar-chart' },
  { label: 'Profile', to: '/profile', icon: 'user' },
  { label: 'Support', to: '/support', icon: 'life-buoy' },
];

// Multi-client user profiles with individual dashboard data
export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  memberSince: string;
  accountTier: string;
  avatarInitials: string;
  currency: string;
  twoFactorEnabled: boolean;
  notifications: {
    productUpdates: boolean;
    priceAlerts: boolean;
    monthlyStatement: boolean;
    securityAlerts: boolean;
  };
}

export const clients: ClientProfile[] = [
  {
    id: 'client-1',
    name: 'Jordan Ashworth',
    email: 'jordan.ashworth@tarafab.com',
    memberSince: 'March 2023',
    accountTier: 'Premium',
    avatarInitials: 'JA',
    currency: 'USD',
    twoFactorEnabled: true,
    notifications: {
      productUpdates: true,
      priceAlerts: true,
      monthlyStatement: false,
      securityAlerts: true,
    },
  },
  {
    id: 'client-2',
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@tarafab.com',
    memberSince: 'June 2022',
    accountTier: 'Premium Plus',
    avatarInitials: 'SM',
    currency: 'USD',
    twoFactorEnabled: true,
    notifications: {
      productUpdates: false,
      priceAlerts: true,
      monthlyStatement: true,
      securityAlerts: true,
    },
  },
  {
    id: 'client-3',
    name: 'Marcus Chen',
    email: 'marcus.chen@tarafab.com',
    memberSince: 'January 2023',
    accountTier: 'Elite',
    avatarInitials: 'MC',
    currency: 'USD',
    twoFactorEnabled: true,
    notifications: {
      productUpdates: true,
      priceAlerts: true,
      monthlyStatement: true,
      securityAlerts: true,
    },
  },
  {
    id: 'client-4',
    name: 'Elena Rodriguez',
    email: 'elena.rodriguez@tarafab.com',
    memberSince: 'September 2023',
    accountTier: 'Premium',
    avatarInitials: 'ER',
    currency: 'USD',
    twoFactorEnabled: false,
    notifications: {
      productUpdates: true,
      priceAlerts: false,
      monthlyStatement: false,
      securityAlerts: true,
    },
  },
];

export function getClientById(id: string): ClientProfile | undefined {
  return clients.find(c => c.id === id);
}

export function getDefaultClient(): ClientProfile {
  return clients[0];
}

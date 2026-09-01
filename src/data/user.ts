// Fictional demo user profile — all data is mock and for prototype purposes only.
export interface UserProfile {
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

export const mockUser: UserProfile = {
  name: 'Jordan Ashworth',
  email: 'jordan.ashworth@example-demo.com',
  memberSince: 'March 2023',
  accountTier: 'Premium (Demo)',
  avatarInitials: 'JA',
  currency: 'USD',
  twoFactorEnabled: true,
  notifications: {
    productUpdates: true,
    priceAlerts: true,
    monthlyStatement: false,
    securityAlerts: true,
  },
};

// Authorized test accounts for the Tarafab.XAi platform.
// Each account has its own investor profile, credentials, and verification status,
// and is used to look up fully isolated portfolio/transaction/performance data.
export type InvestorProfile = 'Conservative' | 'Moderate' | 'Growth';
export type VerificationStatus = 'Verified' | 'Pending';

export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  password: string;
  memberSince: string;
  accountTier: string;
  avatarInitials: string;
  currency: string;
  investorProfile: InvestorProfile;
  verificationStatus: VerificationStatus;
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
    password: 'Conserve#2024',
    memberSince: 'March 2023',
    accountTier: 'Premium',
    avatarInitials: 'JA',
    currency: 'USD',
    investorProfile: 'Conservative',
    verificationStatus: 'Verified',
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
    password: 'Balanced#2024',
    memberSince: 'June 2022',
    accountTier: 'Premium Plus',
    avatarInitials: 'SM',
    currency: 'USD',
    investorProfile: 'Moderate',
    verificationStatus: 'Verified',
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
    password: 'Growth#2024',
    memberSince: 'January 2023',
    accountTier: 'Elite',
    avatarInitials: 'MC',
    currency: 'USD',
    investorProfile: 'Growth',
    verificationStatus: 'Pending',
    twoFactorEnabled: false,
    notifications: {
      productUpdates: true,
      priceAlerts: true,
      monthlyStatement: true,
      securityAlerts: true,
    },
  },
];

export function getClientById(id: string): ClientProfile | undefined {
  return clients.find((c) => c.id === id);
}

export function findClientByEmail(email: string): ClientProfile | undefined {
  return clients.find((c) => c.email.toLowerCase() === email.trim().toLowerCase());
}

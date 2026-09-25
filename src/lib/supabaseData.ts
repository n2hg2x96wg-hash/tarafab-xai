import { supabase } from './supabase';
import type { DashboardData, Transaction } from '../types';

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured for this deployment.');
  return supabase;
}

function mapTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id) as unknown as number,
    type: row.type as Transaction['type'],
    amount: Number(row.amount),
    fee: Number(row.fee ?? 0),
    status: row.status as Transaction['status'],
    timestamp: String(row.created_at),
    reference: row.reference ? String(row.reference) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

export async function getSupabaseDashboard(): Promise<DashboardData> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Your session has expired. Please sign in again.');

  const [{ data: account, error: accountError }, { data: rows, error: transactionError }] = await Promise.all([
    client.from('accounts')
      .select('account_balance, available_balance, invested_balance, pending_balance')
      .eq('user_id', userData.user.id)
      .single(),
    client.from('transactions')
      .select('id, type, amount, fee, status, created_at, reference, notes')
      .or(`user_id.eq.${userData.user.id},recipient_id.eq.${userData.user.id}`)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  if (accountError) throw new Error(accountError.message);
  if (transactionError) throw new Error(transactionError.message);

  return {
    account: {
      accountBalance: Number(account.account_balance),
      availableBalance: Number(account.available_balance),
      investedBalance: Number(account.invested_balance),
      pendingBalance: Number(account.pending_balance),
    },
    performance: null,
    recentTransactions: (rows ?? []).map((row) => mapTransaction(row as Record<string, unknown>)),
  };
}

export async function getSupabaseTransactions(filter: string): Promise<Transaction[]> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error('Your session has expired. Please sign in again.');

  let query = client.from('transactions')
    .select('id, type, amount, fee, status, created_at, reference, notes')
    .or(`user_id.eq.${userData.user.id},recipient_id.eq.${userData.user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filter !== 'all') query = query.eq('type', filter);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTransaction(row as Record<string, unknown>));
}

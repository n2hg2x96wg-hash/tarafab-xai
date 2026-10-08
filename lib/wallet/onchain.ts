// Read-only on-chain balances, fetched server-side over JSON-RPC.
// Only eth_getBalance and eth_call(balanceOf) are ever sent: nothing here can
// sign, send or change anything, and no wallet app or signature is involved.
// A failed read is reported as an error, never as a zero balance.
import { CANONICAL_TOKENS } from '@/lib/depositOptions'

// Same public endpoints the transfer verifier uses; WALLET_RPC_<chainId>
// overrides one (e.g. a paid provider) without a code change.
const PUBLIC_RPC: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com', 8453: 'https://mainnet.base.org', 42161: 'https://arb1.arbitrum.io/rpc',
  10: 'https://mainnet.optimism.io', 137: 'https://polygon-bor-rpc.publicnode.com', 56: 'https://bsc-dataseed.bnbchain.org',
}
export const rpcUrl = (chainId: number) => process.env[`WALLET_RPC_${chainId}`] || PUBLIC_RPC[chainId] || null

// Mirrors NETWORKS in lib/wallet/eip1193 (a client module, so not importable here).
const NETWORKS: { chainId: number; symbol: string; decimals: number }[] = [
  { chainId: 1, symbol: 'ETH', decimals: 18 }, { chainId: 8453, symbol: 'ETH', decimals: 18 }, { chainId: 42161, symbol: 'ETH', decimals: 18 },
  { chainId: 10, symbol: 'ETH', decimals: 18 }, { chainId: 137, symbol: 'POL', decimals: 18 }, { chainId: 56, symbol: 'BNB', decimals: 18 },
]
const HEX40 = /^0x[0-9a-fA-F]{40}$/

async function rpc(url: string, method: string, params: unknown[], timeoutMs = 8000): Promise<string> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ac.signal, cache: 'no-store' })
    if (!r.ok) throw new Error(`RPC ${r.status}`)
    const j = await r.json() as { result?: unknown; error?: { message?: string } }
    if (j.error || typeof j.result !== 'string' || !/^0x[0-9a-fA-F]*$/.test(j.result)) throw new Error(j.error?.message || 'Bad RPC response')
    return j.result
  } finally { clearTimeout(timer) }
}

// Exact decimal string from integer base units (no floating point).
export function formatUnits(v: bigint, decimals: number, maxFrac = 6) {
  const base = BigInt('1' + '0'.repeat(decimals))
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export type Holding = { symbol: string; amount: string | null; error?: string; token?: boolean }
export type WalletBalances = { chain_id: number; address: string; native: Holding; tokens: Holding[]; at: string }

export async function readBalances(chainId: number, address: string): Promise<WalletBalances | null> {
  const net = NETWORKS.find(n => n.chainId === chainId)
  const url = rpcUrl(chainId)
  if (!net || !url || !HEX40.test(address)) return null
  const native = rpc(url, 'eth_getBalance', [address, 'latest'])
    .then(h => ({ symbol: net.symbol, amount: formatUnits(BigInt(h), net.decimals) }) as Holding)
    .catch(() => ({ symbol: net.symbol, amount: null, error: 'unavailable' }) as Holding)
  // Supported stablecoins on this chain (official contracts only).
  const data = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0')
  const tokens = Object.entries(CANONICAL_TOKENS).filter(([k]) => k.startsWith(`${chainId}:`)).map(([k, tk]) =>
    rpc(url, 'eth_call', [{ to: tk.contract, data }, 'latest'])
      .then(h => ({ symbol: k.split(':')[1], amount: formatUnits(BigInt(h === '0x' ? '0x0' : h), tk.decimals), token: true }) as Holding)
      .catch(() => ({ symbol: k.split(':')[1], amount: null, error: 'unavailable', token: true }) as Holding))
  return { chain_id: chainId, address, native: await native, tokens: await Promise.all(tokens), at: new Date().toISOString() }
}

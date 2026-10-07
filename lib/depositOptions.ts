// Validation of Admin → Tarafab receiving addresses before a client sees
// them as deposit options (shared by the API routes and tests).
const NETWORKS: Record<number, { name: string; native: string; standard: string }> = {
  1: { name: 'Ethereum', native: 'ETH', standard: 'ERC-20' }, 56: { name: 'BNB Smart Chain', native: 'BNB', standard: 'BEP-20' }, 8453: { name: 'Base', native: 'ETH', standard: 'ERC-20' },
  42161: { name: 'Arbitrum One', native: 'ETH', standard: 'ERC-20' }, 10: { name: 'Optimism', native: 'ETH', standard: 'ERC-20' }, 137: { name: 'Polygon', native: 'POL', standard: 'ERC-20' },
}
// The issuers' official stablecoin contracts on these networks (public,
// fixed). Used only to fill a receiving address whose token contract was
// left empty, so the client is shown the right token for the network.
export const CANONICAL_TOKENS: Record<string, { contract: string; decimals: number }> = {
  '1:USDT': { contract: '0xdac17f958d2ee523a2206206994597c13d831ec7', decimals: 6 },
  '1:USDC': { contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  '56:USDT': { contract: '0x55d398326f99059ff775485246999027b3197955', decimals: 18 },
  '56:USDC': { contract: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
}
const HEX40 = /^0x[0-9a-fA-F]{40}$/
export type Row = { asset: string; network: string; chain_id: number; address: string; min_confirmations: number; token_contract: string | null; decimals: number }
export type DepositOption = { asset: string; network: string; chain_id: number; address: string; min_confirmations: number; token_contract: string | null; decimals: number; standard: string; contract_source?: 'record' | 'canonical' }

// canonical: allow filling an EMPTY token contract with the official one
// (manual, admin-reviewed deposits). Automatic on-chain flows pass false:
// their verifier reads the stored record, so the record must be complete.
export function validOption(d: Row, opts: { canonical?: boolean } = {}): DepositOption | null {
  const net = NETWORKS[d.chain_id]
  const asset = String(d.asset || '').trim().toUpperCase()
  if (!net || !/^[A-Z0-9]{2,10}$/.test(asset) || !HEX40.test(d.address || '')) return null
  const native = asset === net.native
  if (native) {
    if (d.token_contract) return null
  } else if (!(d.token_contract && HEX40.test(d.token_contract))) {
    const known = opts.canonical ? CANONICAL_TOKENS[`${d.chain_id}:${asset}`] : undefined
    if (!known || d.token_contract) return null
    if (!(d.min_confirmations >= 1)) return null
    return { asset, network: net.name, chain_id: d.chain_id, address: d.address, min_confirmations: d.min_confirmations, token_contract: known.contract, decimals: known.decimals, standard: net.standard, contract_source: 'canonical' }
  }
  if (!Number.isInteger(d.decimals) || d.decimals < 0 || d.decimals > 36 || !(d.min_confirmations >= 1)) return null
  return { asset, network: net.name, chain_id: d.chain_id, address: d.address, min_confirmations: d.min_confirmations, token_contract: native ? null : d.token_contract!.toLowerCase(), decimals: d.decimals, standard: native ? 'Native' : net.standard, contract_source: 'record' }
}

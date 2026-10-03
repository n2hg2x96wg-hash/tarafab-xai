// Validation of Admin → Tarafab receiving addresses before a client sees
// them as deposit options (shared by the API route and tests).
const NETWORKS: Record<number, { name: string; native: string }> = {
  1: { name: 'Ethereum', native: 'ETH' }, 56: { name: 'BNB Smart Chain', native: 'BNB' }, 8453: { name: 'Base', native: 'ETH' },
  42161: { name: 'Arbitrum One', native: 'ETH' }, 10: { name: 'Optimism', native: 'ETH' }, 137: { name: 'Polygon', native: 'POL' },
}
const HEX40 = /^0x[0-9a-fA-F]{40}$/
export type Row = { asset: string; network: string; chain_id: number; address: string; min_confirmations: number; token_contract: string | null; decimals: number }
export type DepositOption = { asset: string; network: string; chain_id: number; address: string; min_confirmations: number; token_contract: string | null; decimals: number }

export function validOption(d: Row): DepositOption | null {
  const net = NETWORKS[d.chain_id]
  const asset = String(d.asset || '').trim().toUpperCase()
  if (!net || !/^[A-Z0-9]{2,10}$/.test(asset) || !HEX40.test(d.address || '')) return null
  const native = asset === net.native
  if (native ? d.token_contract : !(d.token_contract && HEX40.test(d.token_contract))) return null
  if (!Number.isInteger(d.decimals) || d.decimals < 0 || d.decimals > 36 || !(d.min_confirmations >= 1)) return null
  return { asset, network: net.name, chain_id: d.chain_id, address: d.address, min_confirmations: d.min_confirmations, token_contract: native ? null : d.token_contract!.toLowerCase(), decimals: d.decimals }
}


// External wallet → Tarafab transfer verifier.
//
// A transfer is credited only after the real blockchain transaction has been
// read from the network and checked:
//   - it exists and succeeded (receipt status 1),
//   - it went to Tarafab's configured receiving address (native coin) or
//     moved the configured token to that address (ERC-20 Transfer log),
//   - it was sent from the client's verified wallet,
//   - it has the required number of confirmations.
// The credit itself happens in engine_transfer_credit(), which locks the row
// and can credit a transfer only once; a transaction hash can be claimed only
// once (unique index). Anything unusual (sent from another address, nothing
// received) is set to needs_review for an admin instead of being guessed.
//
// Callers:
//   - pg_cron every minute with x-engine-key (all pending transfers);
//   - a signed-in client asking for their own transfer to be re-checked now.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createPublicClient, http, type Hex } from 'npm:viem@2'
import { arbitrum, base, mainnet, optimism, polygon, bsc } from 'npm:viem@2/chains'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CHAINS = { 1: mainnet, 8453: base, 42161: arbitrum, 10: optimism, 137: polygon, 56: bsc } as const
const PUBLIC_RPC: Record<number, string> = {
  1: 'https://ethereum-rpc.publicnode.com', 8453: 'https://mainnet.base.org', 42161: 'https://arb1.arbitrum.io/rpc',
  10: 'https://mainnet.optimism.io', 137: 'https://polygon-bor-rpc.publicnode.com', 56: 'https://bsc-dataseed.bnbchain.org',
}
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const NOT_FOUND_GRACE_MS = 3 * 60 * 60 * 1000

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-engine-key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

type Transfer = { id: string; user_id: string; chain_id: number; asset: string; token_contract: string | null; decimals: number; from_address: string; to_address: string;
  tx_hash: string; usd_rate: number; quote_expires_at: string; submitted_at: string; required_confirmations: number; status: string }

export type Check =
  | { kind: 'pending'; confirmations: number; note?: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'review'; reason: string; received?: number }
  | { kind: 'ready'; received: number; confirmations: number }

type Rpc = {
  getTransaction: (h: Hex) => Promise<{ from: string; to: string | null; value: bigint } | null>
  getTransactionReceipt: (h: Hex) => Promise<{ status: string; blockNumber: bigint; logs: { address: string; topics: string[]; data: string }[] } | null>
  getBlockNumber: () => Promise<bigint>
}

const units = (v: bigint, decimals: number) => Number(v) / 10 ** decimals
const padTopic = (addr: string) => '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0')

// Pure check of one transfer against what the chain reports (exported for tests).
export async function checkTransfer(t: Transfer, rpc: Rpc, now = Date.now()): Promise<Check> {
  const hash = t.tx_hash as Hex
  const tx = await rpc.getTransaction(hash).catch((e) => { if (/not found|could not be found/i.test(String(e))) return null; throw e })
  if (!tx) {
    return now - new Date(t.submitted_at).getTime() > NOT_FOUND_GRACE_MS
      ? { kind: 'failed', reason: 'The transaction was not found on the network.' }
      : { kind: 'pending', confirmations: 0, note: 'Waiting for the transaction to appear on the network.' }
  }
  const receipt = await rpc.getTransactionReceipt(hash).catch((e) => { if (/not found|could not be found/i.test(String(e))) return null; throw e })
  if (!receipt) return { kind: 'pending', confirmations: 0, note: 'Waiting for the transaction to be included in a block.' }
  if (receipt.status !== 'success') return { kind: 'failed', reason: 'The transaction failed on the network; no funds were received.' }

  let received = 0n
  if (!t.token_contract) {
    if ((tx.to || '').toLowerCase() !== t.to_address) return { kind: 'failed', reason: 'The transaction was not sent to the Tarafab receiving address.' }
    received = tx.value
  } else {
    const to = padTopic(t.to_address)
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === t.token_contract && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics[2]?.toLowerCase() === to) {
        received += BigInt(log.data)
      }
    }
    if (received === 0n) return { kind: 'failed', reason: `No ${t.asset} was transferred to the Tarafab receiving address in this transaction.` }
  }
  if (received <= 0n) return { kind: 'failed', reason: 'Nothing was received in this transaction.' }

  const amount = units(received, t.decimals)
  if (tx.from.toLowerCase() !== t.from_address) {
    return { kind: 'review', reason: 'Funds arrived, but from a different address than your verified wallet. Support will review it.', received: amount }
  }
  const tip = await rpc.getBlockNumber()
  const confirmations = Number(tip - receipt.blockNumber + 1n)
  if (confirmations < t.required_confirmations) return { kind: 'pending', confirmations }
  return { kind: 'ready', received: amount, confirmations }
}

function rpcFor(chainId: number): Rpc | null {
  const chain = CHAINS[chainId as keyof typeof CHAINS]
  if (!chain) return null
  const url = Deno.env.get(`WALLET_RPC_${chainId}`) || PUBLIC_RPC[chainId]
  const c = createPublicClient({ chain, transport: http(url, { timeout: 12_000, retryCount: 1 }) })
  return {
    getTransaction: async (h) => { const x = await c.getTransaction({ hash: h }); return { from: x.from, to: x.to, value: x.value } },
    getTransactionReceipt: async (h) => {
      const r = await c.getTransactionReceipt({ hash: h })
      return { status: r.status, blockNumber: r.blockNumber, logs: r.logs.map(l => ({ address: l.address, topics: l.topics as string[], data: l.data })) }
    },
    getBlockNumber: () => c.getBlockNumber(),
  }
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // Who is asking: the scheduler (all pending) or a client (their own one).
  let onlyUser: string | null = null
  let onlyId: string | null = null
  const engineKey = req.headers.get('x-engine-key') || ''
  if (engineKey) {
    const { data: st } = await db.from('automation_engine_state').select('run_key').eq('id', 1).single()
    if (!st || engineKey.length < 32 || engineKey !== st.run_key) return json({ error: 'Forbidden' }, 403)
  } else {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: u } = token ? await db.auth.getUser(token) : { data: { user: null } }
    if (!u?.user) return json({ error: 'Please sign in again.' }, 401)
    const body = await req.json().catch(() => ({})) as { id?: string }
    if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return json({ error: 'Transfer id required.' }, 400)
    onlyUser = u.user.id; onlyId = body.id
  }

  let q = db.from('wallet_transfers').select('id, user_id, chain_id, asset, token_contract, decimals, from_address, to_address, tx_hash, usd_rate, quote_expires_at, submitted_at, required_confirmations, status')
    .in('status', ['submitted', 'confirming']).order('submitted_at', { ascending: true }).limit(50)
  if (onlyId) q = q.eq('id', onlyId).eq('user_id', onlyUser!)
  const { data: rows, error } = await q
  if (error) return json({ error: 'Could not load transfers.' }, 500)

  const results: Record<string, string> = {}
  for (const t of (rows || []) as Transfer[]) {
    const rpc = rpcFor(t.chain_id)
    if (!rpc) { await db.rpc('engine_transfer_progress', { p_id: t.id, p_status: 'needs_review', p_confirmations: 0, p_error: 'Unsupported network.' }); results[t.id] = 'review'; continue }
    try {
      const c = await checkTransfer(t, rpc)
      if (c.kind === 'pending') {
        await db.rpc('engine_transfer_progress', { p_id: t.id, p_status: c.confirmations > 0 ? 'confirming' : 'submitted', p_confirmations: c.confirmations, p_error: c.note || null })
      } else if (c.kind === 'failed') {
        await db.rpc('engine_transfer_progress', { p_id: t.id, p_status: 'failed', p_confirmations: 0, p_error: c.reason })
      } else if (c.kind === 'review') {
        await db.rpc('engine_transfer_progress', { p_id: t.id, p_status: 'needs_review', p_confirmations: 0, p_error: c.reason })
      } else {
        // Quote rate if the hash came back within the quote window; otherwise
        // the real current price (never an invented one).
        let rate = Number(t.usd_rate)
        if (new Date(t.submitted_at) > new Date(t.quote_expires_at)) {
          const { data: px } = await db.rpc('_fresh_usd_rate', { p_asset: t.asset })
          if (px == null) {
            await db.rpc('engine_transfer_progress', { p_id: t.id, p_status: 'confirming', p_confirmations: c.confirmations, p_error: `Confirmed. Waiting for a current ${t.asset} price to credit the quote-expired transfer.` })
            results[t.id] = 'waiting-price'; continue
          }
          rate = Number(px)
        }
        const { error: cErr } = await db.rpc('engine_transfer_credit', { p_id: t.id, p_received: c.received, p_rate: rate, p_confirmations: c.confirmations })
        if (cErr) throw new Error(cErr.message)
      }
      results[t.id] = c.kind
    } catch (e) {
      // Network/RPC problems: leave the transfer pending and say why.
      await db.rpc('engine_transfer_progress', { p_id: t.id, p_status: t.status, p_confirmations: null, p_error: 'The network could not be reached; checking again shortly.' })
      results[t.id] = 'retry:' + (e instanceof Error ? e.message.slice(0, 120) : 'error')
    }
  }
  return json({ ok: true, checked: Object.keys(results).length, results })
})

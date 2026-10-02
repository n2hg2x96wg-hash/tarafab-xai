'use client'

// Browser-wallet access through the standard EIP-1193 provider interface,
// discovered with EIP-6963 (every installed wallet announces itself) and the
// legacy window.ethereum as a fallback. Only public requests are made:
// accounts, chain, balance, network switch and personal_sign of a plain text
// message. The only transaction ever requested is a transfer to Tarafab that
// the user starts, reviews and approves in their own wallet (sendTransfer).
// No key material exists here.

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, fn: (...a: unknown[]) => void) => void
  removeListener?: (event: string, fn: (...a: unknown[]) => void) => void
}
export type WalletInfo = { id: string; name: string; icon?: string; provider: Eip1193 }

export const NETWORKS: { chainId: number; name: string; symbol: string; decimals: number }[] = [
  { chainId: 1, name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  { chainId: 8453, name: 'Base', symbol: 'ETH', decimals: 18 },
  { chainId: 42161, name: 'Arbitrum One', symbol: 'ETH', decimals: 18 },
  { chainId: 10, name: 'OP Mainnet', symbol: 'ETH', decimals: 18 },
  { chainId: 137, name: 'Polygon', symbol: 'POL', decimals: 18 },
  { chainId: 56, name: 'BNB Smart Chain', symbol: 'BNB', decimals: 18 },
]
export const networkOf = (chainId: number | null) => NETWORKS.find(n => n.chainId === chainId) || null

type WinEth = Window & { ethereum?: Eip1193 & { isMetaMask?: boolean; isCoinbaseWallet?: boolean; providers?: Eip1193[] } }

// Wallets announce themselves in response to 'eip6963:requestProvider'.
export function discoverWallets(timeoutMs = 400): Promise<WalletInfo[]> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') return resolve([])
    const found = new Map<string, WalletInfo>()
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent).detail as { info?: { uuid?: string; name?: string; icon?: string; rdns?: string }; provider?: Eip1193 }
      if (!d?.provider || typeof d.provider.request !== 'function') return
      const id = d.info?.rdns || d.info?.uuid || d.info?.name || `wallet-${found.size}`
      // Only data: image URLs are shown, so a wallet cannot load remote content.
      const icon = typeof d.info?.icon === 'string' && d.info.icon.startsWith('data:image/') ? d.info.icon : undefined
      found.set(id, { id, name: (d.info?.name || 'Browser wallet').slice(0, 40), icon, provider: d.provider })
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      const eth = (window as WinEth).ethereum
      if (!found.size && eth && typeof eth.request === 'function') {
        found.set('injected', { id: 'injected', name: eth.isMetaMask ? 'MetaMask' : eth.isCoinbaseWallet ? 'Coinbase Wallet' : 'Browser wallet', provider: eth })
      }
      resolve(Array.from(found.values()))
    }, timeoutMs)
  })
}

export class WalletError extends Error {
  // detail: the wallet's own error text (never secret), shown to help diagnose.
  constructor(message: string, public code: 'rejected' | 'pending' | 'timeout' | 'unsupported_chain' | 'no_account' | 'failed', public detail = '') { super(message) }
}

// Maps provider errors (EIP-1193 / EIP-1474 codes) to plain messages.
export function walletError(e: unknown): WalletError {
  if (e instanceof WalletError) return e
  const code = (e as { code?: number })?.code
  if (code === 4001) return new WalletError('You declined the request in your wallet.', 'rejected')
  if (code === -32002) return new WalletError('Your wallet already has a request open. Open the wallet to finish or dismiss it.', 'pending')
  if (code === 4902) return new WalletError('This network is not added to your wallet yet. Add it in the wallet, then try again.', 'unsupported_chain')
  if (code === 4100) return new WalletError('Your wallet has not authorised this site yet. Connect again.', 'rejected')
  // WalletConnect / SDK rejections and a closed connection modal.
  const msg = String((e as { message?: string })?.message || '')
  if (code === 5000 || code === 5001 || /user (rejected|denied|cancel)|rejected by user|request reset|modal closed|user closed/i.test(msg)) {
    return new WalletError('You declined the request in your wallet.', 'rejected')
  }
  const safeMessage = msg
    .replace(/https?:\/\/\S+/gi, '[provider URL]')
    .replace(/\bwc:[^\s]+/gi, '[WalletConnect request]')
    .replace(/0x[a-f\d]{32,}/gi, '[redacted value]')
    .slice(0, 120)
  const detail = [code != null ? `code ${code}` : '', safeMessage].filter(Boolean).join(': ')
  return new WalletError('The wallet could not complete the request. Try again.', 'failed', detail)
}

export function withTimeout<T>(p: Promise<T>, ms: number, msg = 'The wallet did not respond in time. Open your wallet and try again.'): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new WalletError(msg, 'timeout')), ms))])
}

export async function connect(provider: Eip1193): Promise<{ address: string; chainId: number }> {
  try {
    // Session-based providers (WalletConnect) must connect first: their
    // request() only forwards to an existing session, and enable() opens the
    // wallet selector / deep link and then returns the approved accounts.
    const p = provider as Eip1193 & { enable?: () => Promise<string[]>; session?: unknown }
    const needsEnable = typeof p.enable === 'function' && 'session' in p && !p.session
    const accounts = await withTimeout(
      (needsEnable ? p.enable!() : provider.request({ method: 'eth_requestAccounts' })) as Promise<string[]>, 180_000)
    const address = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0].toLowerCase() : ''
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw new WalletError('The wallet did not share an account.', 'no_account')
    return { address, chainId: await chainIdOf(provider) }
  } catch (e) { throw walletError(e) }
}

export async function chainIdOf(provider: Eip1193) {
  const hex = await withTimeout(provider.request({ method: 'eth_chainId' }) as Promise<string>, 15_000)
  return parseInt(String(hex), 16)
}

export async function switchChain(provider: Eip1193, chainId: number) {
  try {
    await withTimeout(provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + chainId.toString(16) }] }), 120_000)
  } catch (e) { throw walletError(e) }
}

const toHex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('')

// personal_sign of a plain message: proves control of the account, costs
// nothing and authorises nothing.
export async function signMessage(provider: Eip1193, address: string, message: string) {
  try {
    const sig = await withTimeout(provider.request({ method: 'personal_sign', params: [toHex(message), address] }) as Promise<string>, 180_000)
    if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]+$/.test(sig)) throw new WalletError('The wallet returned an unexpected signature.', 'failed')
    return sig
  } catch (e) { throw walletError(e) }
}

// Native-coin balance read through the user's own wallet connection. Returns
// a decimal string, exactly as reported by the network.
export async function nativeBalance(provider: Eip1193, address: string, decimals = 18) {
  const hex = await withTimeout(provider.request({ method: 'eth_getBalance', params: [address, 'latest'] }) as Promise<string>, 20_000, 'The network did not respond in time.')
  const wei = BigInt(String(hex))
  const base = BigInt('1' + '0'.repeat(decimals))
  const whole = wei / base
  const frac = (wei % base).toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

// Exact decimal string <-> integer base units (no floating point).
export function parseUnits(value: string, decimals: number): bigint | null {
  const v = value.trim()
  if (!/^\d+(\.\d+)?$/.test(v)) return null
  const [w, f = ''] = v.split('.')
  if (f.length > decimals) return null
  return BigInt(w) * BigInt('1' + '0'.repeat(decimals)) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0')
}
export function formatUnits(v: bigint, decimals: number, maxFrac = 6) {
  const base = BigInt('1' + '0'.repeat(decimals))
  const frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '')
  return frac ? `${v / base}.${frac}` : (v / base).toString()
}

// ERC-20 balanceOf through the user's wallet connection.
export async function tokenBalance(provider: Eip1193, token: string, address: string): Promise<bigint> {
  const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const hex = await withTimeout(provider.request({ method: 'eth_call', params: [{ to: token, data }, 'latest'] }) as Promise<string>, 20_000, 'The network did not respond in time.')
  return BigInt(hex && hex !== '0x' ? String(hex) : '0x0')
}

export type TransferRequest = { from: string; to: string; token?: string | null; amount: bigint }
const transferTx = (r: TransferRequest) => r.token
  ? { from: r.from, to: r.token, value: '0x0',
      data: '0xa9059cbb' + r.to.toLowerCase().replace(/^0x/, '').padStart(64, '0') + r.amount.toString(16).padStart(64, '0') }
  : { from: r.from, to: r.to, value: '0x' + r.amount.toString(16) }

// Estimated network fee (gas x gas price) in the chain's native coin, as the
// network reports it right now. null when the network cannot estimate it; the
// wallet always shows the final network fee before the user approves.
export async function estimateNetworkFee(provider: Eip1193, r: TransferRequest): Promise<bigint | null> {
  try {
    const [gas, price] = await Promise.all([
      withTimeout(provider.request({ method: 'eth_estimateGas', params: [transferTx(r)] }) as Promise<string>, 20_000),
      withTimeout(provider.request({ method: 'eth_gasPrice' }) as Promise<string>, 20_000),
    ])
    return BigInt(String(gas)) * BigInt(String(price))
  } catch { return null }
}

// Asks the user's wallet to send the transfer. The wallet shows the full
// transaction and the user approves or declines it there.
export async function sendTransfer(provider: Eip1193, r: TransferRequest): Promise<string> {
  try {
    const hash = await withTimeout(provider.request({ method: 'eth_sendTransaction', params: [transferTx(r)] }) as Promise<string>, 300_000)
    if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new WalletError('The wallet did not return a transaction hash.', 'failed')
    return hash.toLowerCase()
  } catch (e) { throw walletError(e) }
}

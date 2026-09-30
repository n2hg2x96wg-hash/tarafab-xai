'use client'

// Browser-wallet access through the standard EIP-1193 provider interface,
// discovered with EIP-6963 (every installed wallet announces itself) and the
// legacy window.ethereum as a fallback. Only public requests are made:
// accounts, chain, balance, network switch and personal_sign of a plain text
// message. No transaction is ever requested, and no key material exists here.

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
  constructor(message: string, public code: 'rejected' | 'pending' | 'timeout' | 'unsupported_chain' | 'no_account' | 'failed') { super(message) }
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
  return new WalletError('The wallet could not complete the request. Try again.', 'failed')
}

export function withTimeout<T>(p: Promise<T>, ms: number, msg = 'The wallet did not respond in time. Open your wallet and try again.'): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new WalletError(msg, 'timeout')), ms))])
}

export async function connect(provider: Eip1193): Promise<{ address: string; chainId: number }> {
  try {
    const accounts = await withTimeout(provider.request({ method: 'eth_requestAccounts' }) as Promise<string[]>, 120_000)
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

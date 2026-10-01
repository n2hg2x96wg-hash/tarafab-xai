'use client'

// Wallet connections that do not depend on a wallet injected into the page,
// so they work in iPhone Safari and other mobile browsers:
//
// - Coinbase Wallet SDK: hands off to the Coinbase Wallet app (deep link) or
//   to Coinbase Smart Wallet (passkey, keys.coinbase.com). Needs no key.
// - WalletConnect (Reown): QR code on desktop, deep/universal links to
//   MetaMask, Trust, Rainbow and other wallets on mobile. Needs a WalletConnect
//   production project ID in NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
//
// Both expose a standard EIP-1193 provider, so the existing connect → sign →
// server-verify flow is unchanged. SDKs load only when chosen.
import type { Eip1193 } from './eip1193'
import { NETWORKS } from './eip1193'

export type SdkKind = 'coinbase' | 'walletconnect'
type Disconnectable = Eip1193 & { disconnect?: () => Promise<void> | void; accounts?: string[]; session?: unknown }

const APP = { name: 'Tarafab.XAi', description: 'Tarafab.XAi wallet ownership verification' }
const cache: Partial<Record<SdkKind, Promise<Disconnectable>>> = {}
// Providers that have finished loading, so a tap can use them synchronously
// (Safari only opens a wallet window if it is opened by the tap itself).
const ready: Partial<Record<SdkKind, Disconnectable>> = {}
export const readyProvider = (kind: SdkKind) => ready[kind] || null

// Project IDs are public identifiers, but the configured project's origin
// allowlist must match the deployed application.
export const walletConnectProjectId = () => (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '').trim()
export const walletConnectAvailable = () => /^[0-9a-f]{32}$/i.test(walletConnectProjectId())

function iconUrl() {
  return typeof window === 'undefined' ? '' : `${window.location.origin}/icon.svg`
}

export function sdkProvider(kind: SdkKind): Promise<Disconnectable> {
  if (!cache[kind]) {
    cache[kind] = (kind === 'coinbase' ? coinbase() : walletConnect())
      .then(p => { ready[kind] = p; return p })
      .catch(e => { delete cache[kind]; throw e })
  }
  return cache[kind]!
}

async function coinbase(): Promise<Disconnectable> {
  const { createCoinbaseWalletSDK } = await import(/* webpackChunkName: "wallet-coinbase" */ '@coinbase/wallet-sdk')
  const sdk = createCoinbaseWalletSDK({
    appName: APP.name,
    appLogoUrl: iconUrl(),
    appChainIds: NETWORKS.map(n => n.chainId),
    // Offer both the Coinbase Wallet app and the passkey-based Smart Wallet.
    preference: { options: 'all' },
  })
  return sdk.getProvider() as unknown as Disconnectable
}

async function walletConnect(): Promise<Disconnectable> {
  if (!walletConnectAvailable()) throw new Error('WalletConnect is not configured')
  const { EthereumProvider } = await import(/* webpackChunkName: "wallet-walletconnect" */ '@walletconnect/ethereum-provider')
  const [first, ...rest] = NETWORKS.map(n => n.chainId)
  const provider = await EthereumProvider.init({
    projectId: walletConnectProjectId(),
    // No chain is required, so wallets that support any of these can connect;
    // the network is then checked and switched in the Wallet Center.
    optionalChains: [first, ...rest] as [number, ...number[]],
    showQrModal: true,
    methods: ['personal_sign', 'eth_chainId', 'eth_accounts', 'eth_requestAccounts', 'wallet_switchEthereumChain', 'eth_getBalance'],
    events: ['accountsChanged', 'chainChanged', 'disconnect'],
    metadata: {
      name: APP.name, description: APP.description, url: window.location.origin, icons: [iconUrl()],
      // After approving in the wallet app on a phone, send the user back here.
      redirect: { universal: `${window.location.origin}/dashboard#wallet` },
    },
  })
  return provider as unknown as Disconnectable
}

// A session the SDK already restored (e.g. the page was reloaded after the
// user approved in the wallet app). Returns the account or null. Never opens
// a wallet or a modal.
export async function restoredAccount(kind: SdkKind): Promise<string | null> {
  try {
    const p = await sdkProvider(kind)
    const accounts = await Promise.race([
      p.request({ method: 'eth_accounts' }) as Promise<string[]>,
      new Promise<string[]>(res => setTimeout(() => res([]), 4000)),
    ])
    const a = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0].toLowerCase() : ''
    return /^0x[0-9a-f]{40}$/.test(a) ? a : null
  } catch { return null }
}

// Ends the SDK session so the wallet app no longer shows Tarafab as connected.
export async function endSdkSession(kind: SdkKind) {
  const p = cache[kind]
  if (!p) return
  try { await (await p).disconnect?.() } catch { /* already gone */ }
  delete cache[kind]; delete ready[kind]
}

// Remembers an in-progress connection across leaving Safari for the wallet
// app. Holds only the chosen method and target network, never an address
// or anything secret; expires after 15 minutes.
const PENDING = 'tarafab.walletPending'
export type Pending = { kind: SdkKind; chainId: number; at: number }
export function savePending(p: Omit<Pending, 'at'>) {
  try { sessionStorage.setItem(PENDING, JSON.stringify({ ...p, at: Date.now() })) } catch { /* private mode */ }
}
export function readPending(): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null') as Pending | null
    if (!p || (p.kind !== 'coinbase' && p.kind !== 'walletconnect') || Date.now() - p.at > 15 * 60_000) { clearPending(); return null }
    return p
  } catch { return null }
}
export function clearPending() {
  try { sessionStorage.removeItem(PENDING) } catch { /* ignore */ }
}

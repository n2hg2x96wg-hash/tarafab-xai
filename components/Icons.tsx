import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Base({ children, ...p }: P) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  )
}

export const IconGrid = (p: P) => <Base {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Base>
export const IconChart = (p: P) => <Base {...p}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></Base>
export const IconList = (p: P) => <Base {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></Base>
export const IconArrowDown = (p: P) => <Base {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Base>
export const IconArrowUp = (p: P) => <Base {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></Base>
export const IconSwap = (p: P) => <Base {...p}><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="m17 20 4-4-4-4" /><path d="M21 16H7" /></Base>
export const IconUser = (p: P) => <Base {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Base>
export const IconLogOut = (p: P) => <Base {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Base>
export const IconCheck = (p: P) => <Base {...p}><path d="M20 6 9 17l-5-5" /></Base>
export const IconAlert = (p: P) => <Base {...p}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></Base>
export const IconInfo = (p: P) => <Base {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Base>
export const IconCopy = (p: P) => <Base {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Base>
export const IconMail = (p: P) => <Base {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></Base>
export const IconMenu = (p: P) => <Base {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Base>
export const IconClose = (p: P) => <Base {...p}><path d="M18 6 6 18M6 6l12 12" /></Base>
export const IconEye = (p: P) => <Base {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Base>
export const IconEyeOff = (p: P) => <Base {...p}><path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.16 3.19" /><path d="M6.61 6.61A17.4 17.4 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="m2 2 20 20" /></Base>
export const IconLock = (p: P) => <Base {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Base>
export const IconFile = (p: P) => <Base {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Base>
export const IconGlobe = (p: P) => <Base {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Base>
export const IconChevronDown = (p: P) => <Base {...p}><path d="m6 9 6 6 6-6" /></Base>
export const IconSun = (p: P) => <Base {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Base>
export const IconMoon = (p: P) => <Base {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Base>
export const IconMonitor = (p: P) => <Base {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></Base>
export const IconBell = (p: P) => <Base {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></Base>
export const IconShield = (p: P) => <Base {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Base>
export const IconSliders = (p: P) => <Base {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Base>
export const IconHelp = (p: P) => <Base {...p}><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Base>
export const IconPie = (p: P) => <Base {...p}><path d="M21.2 15.9A10 10 0 1 1 8 2.8" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></Base>
export const IconWallet = (p: P) => <Base {...p}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3" /><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4z" /></Base>
export const IconHistory = (p: P) => <Base {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Base>
export const IconTrend = (p: P) => <Base {...p}><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></Base>

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="w-7 h-7 rounded-md bg-accent text-ink-950 flex items-center justify-center text-[15px] font-bold leading-none">₿</span>
      <span className="text-[17px] font-semibold tracking-tight text-fg">Tarafab<span className="text-fg-muted">.XAi</span></span>
    </span>
  )
}

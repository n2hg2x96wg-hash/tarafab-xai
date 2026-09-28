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
export const IconLock = (p: P) => <Base {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Base>
export const IconFile = (p: P) => <Base {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></Base>
export const IconGlobe = (p: P) => <Base {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Base>
export const IconChevronDown = (p: P) => <Base {...p}><path d="m6 9 6 6 6-6" /></Base>

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="w-7 h-7 rounded-md bg-accent text-ink-950 flex items-center justify-center text-[15px] font-bold leading-none">₿</span>
      <span className="text-[17px] font-semibold tracking-tight text-fg">Tarafab<span className="text-fg-muted">.XAi</span></span>
    </span>
  )
}

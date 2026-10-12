// The attribution CoinGecko's API terms require wherever its data is shown:
// the text "Powered by CoinGecko", legible (at least size 10) and linked.
// Rendered only next to figures that actually came from CoinGecko, never as
// general branding, and worded so it does not suggest an endorsement or a
// partnership.
export const COINGECKO_URL = 'https://www.coingecko.com/'

export function CoinGeckoCredit({ className = '', as: Tag = 'p' }: { className?: string; as?: 'p' | 'span' }) {
  return (
    <Tag className={`text-[11px] leading-snug text-fg-faint ${className}`} data-coingecko-credit>
      <a href={COINGECKO_URL} target="_blank" rel="noopener noreferrer" className="text-fg-muted underline-offset-2 hover:underline hover:text-fg">
        Powered by CoinGecko
      </a>
    </Tag>
  )
}

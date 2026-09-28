/** @type {import('tailwindcss').Config} */

// Every colour comes from app/tokens.css. Tailwind's named palettes that the
// app already uses (emerald, red, amber, sky, violet, blue, slate) are pointed
// at the same semantic tokens, so each colour name has exactly one meaning
// and one set of values across client and admin screens.
const v = name => `rgb(var(--${name}) / <alpha-value>)`
const scale = (prefix, steps) => Object.fromEntries(steps.map(s => [s, v(`${prefix}-${s}`)]))

const success = { 50: v('success-200'), 100: v('success-200'), ...scale('success', [200, 300, 400, 500, 600]), 700: v('success-600') }
const danger = { 50: v('danger-200'), 100: v('danger-200'), ...scale('danger', [200, 300, 400, 500, 600]), 700: v('danger-600') }
const warning = { 50: v('warning-200'), 100: v('warning-200'), ...scale('warning', [200, 300, 400, 500, 600]), 700: v('warning-600') }
const info = { 200: v('info-300'), ...scale('info', [300, 400, 500]), 600: v('info-500') }
const brand = { 100: v('brand-200'), ...scale('brand', [200, 300, 400, 500, 600, 700]), 800: v('brand-700') }

module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: { ...brand, DEFAULT: v('brand-500'), violet: v('brand-600'), blue: v('brand-blue-500'), accent: v('brand-500') },
        ink: scale('ink', [950, 900, 850, 800, 700, 600, 500]),
        fg: {
          DEFAULT: v('fg'),
          muted: v('fg-muted'),
          faint: v('fg-faint'),
          disabled: v('fg-disabled'),
          label: v('fg-label'),
        },
        accent: {
          DEFAULT: v('accent'),
          hover: v('accent-hover'),
          ink: v('accent-ink'),
        },
        success, danger, warning, info,
        // Semantic aliases for the palettes already used in components
        emerald: success,
        green: success,
        red: danger,
        amber: warning,
        orange: warning,
        sky: info,
        violet: brand,
        purple: brand,
        indigo: brand,
        blue: { 300: v('brand-blue-400'), 400: v('brand-blue-400'), 500: v('brand-blue-500'), 600: v('brand-blue-500') },
        // "white" follows the theme (see --contrast in tokens.css); use
        // text-[#fff] where white must stay white, e.g. on a coloured button.
        white: v('contrast'),
        slate: {
          100: v('fg'), 200: v('fg'), 300: v('fg-label'), 400: v('fg-muted'), 500: v('fg-faint'),
          600: v('fg-faint'), 700: v('ink-600'), 800: v('ink-700'), 900: v('ink-850'),
        },
      },
      // Orange as text uses a deeper shade in light mode to keep contrast.
      textColor: { accent: { DEFAULT: v('accent-text'), hover: v('accent-hover') } },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.6s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}

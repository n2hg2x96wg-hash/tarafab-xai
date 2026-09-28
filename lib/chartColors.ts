// Chart colours follow the active theme through CSS variables. SVG
// presentation attributes cannot read variables, so charts apply these
// through the style prop (style={{ stroke: chartColors.up }}).
export const chartColors = {
  up: 'rgb(var(--success-400))',
  down: 'rgb(var(--danger-400))',
  grid: 'rgb(var(--ink-700))',
  guide: 'rgb(var(--fg-faint))',
} as const

// SVG presentation attributes cannot read CSS variables reliably, so charts
// use these literal values. Keep them in step with app/tokens.css.
export const chartColors = {
  up: '#3DD5A0', // --success-400
  down: '#F67C7C', // --danger-400
  grid: '#222833', // --ink-700
  guide: '#808A99', // --fg-faint
} as const

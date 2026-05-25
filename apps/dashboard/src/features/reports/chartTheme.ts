/* Shared chart styling. A small, theme-agnostic palette picked to read well on
 * both the light paper and dark backgrounds without per-theme swapping, plus
 * neutral grid/axis tokens used across every Recharts surface. */
export const C = {
  indigo: '#6366f1',
  teal: '#14b8a6',
  amber: '#f59e0b',
  rose: '#fb7185',
  violet: '#a78bfa',
  sky: '#38bdf8',
  emerald: '#34d399',
};

export const DONUT = [C.indigo, C.teal, C.amber, C.violet];
export const GRID = 'rgb(125 125 125 / 0.16)';
export const AXIS = 'rgb(125 125 125 / 0.85)';
export const axisTick = { fontSize: 11, fill: AXIS };

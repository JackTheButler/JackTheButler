/**
 * App-id → SVG URL. Drop a new file at `src/assets/apps/<id>.svg` to add
 * one; no code change needed. Shared by the Apps list and per-app pages.
 */
const ICONS = import.meta.glob('@/assets/apps/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const iconFor = (id: string): string | undefined =>
  Object.entries(ICONS).find(([k]) => k.endsWith(`/${id}.svg`))?.[1];

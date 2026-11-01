// Central design tokens (design.md). Single source of truth: applied as CSS variables at startup.
export const colors = {
  brand950: '#171633',
  brand900: '#211F4B',
  brand800: '#302D69',
  brand700: '#433F8F',
  brand600: '#5753B8',
  brand100: '#E9E8FF',
  brand50: '#F5F4FF',
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF0F6',
  textPrimary: '#17182B',
  textSecondary: '#5F6478',
  textInverse: '#FFFFFF',
  border: '#E0E3ED',
  focus: '#7772E5',
  success: '#16794B',
  successBg: '#E7F6EE',
  warning: '#9A5B00',
  warningBg: '#FFF3D8',
  danger: '#B42335',
  dangerBg: '#FDEBED',
  info: '#245BC7',
  infoBg: '#EAF1FF',
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

const kebab = (s: string) => s.replace(/[A-Z0-9]/g, (m) => '-' + m.toLowerCase());

/** Writes tokens onto :root as CSS variables, e.g. --color-brand-900, --space-4, --radius-md. */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--color-${kebab(k)}`, v);
  for (const [k, v] of Object.entries(space)) root.style.setProperty(`--space-${k}`, `${v}px`);
  for (const [k, v] of Object.entries(radius)) root.style.setProperty(`--radius-${k}`, `${v}px`);
}

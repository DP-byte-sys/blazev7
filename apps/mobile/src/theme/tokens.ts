// Central design tokens (design.md). Do not scatter raw colors/sizes in screens.
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
export const minTouch = 44;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const;

// Design tokens — the single source of truth for color/spacing/type across the app.
// Palette leans energetic (warm orange for effort/calories, green for success, blue for trust)
// to match the "năng động, hiện đại, tạo động lực" brief.

export const colors = {
  primary: '#4F8EF7',
  primaryDark: '#3B72D6',
  primaryLight: '#E8F0FE',
  success: '#2E9E4E',
  successLight: '#E8F6EC',
  warning: '#F7A44F',
  warningLight: '#FFF3E0',
  danger: '#E0563A',
  dangerLight: '#FDEDEA',
  info: '#4FC3F7',
  infoLight: '#E1F5FE',
  gold: '#8A5A00',
  goldLight: '#FFF7E6',
  neutral: '#666666',
  neutralLight: '#F0F0F0',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#DDDDDD',
  textPrimary: '#222222',
  textSecondary: '#666666',
  textMuted: '#999999',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '800' as const },
  h2: { fontSize: 22, fontWeight: '800' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  title: { fontSize: 15, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '600' as const },
  small: { fontSize: 11, fontWeight: '500' as const },
};

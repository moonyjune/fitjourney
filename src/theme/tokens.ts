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
  // Ambient screen backgrounds for the Fatty/Client dashboard during the IF eating vs. fasting
  // window — deliberately more saturated than any card/badge tint above so they read as a
  // full-screen mood wash, not as another component color.
  ifEatingBackground: '#DCF3E0',
  ifFastingBackground: '#F8DCE0',
  surface: '#FFFFFF',
  border: '#DDDDDD',
  textPrimary: '#222222',
  textSecondary: '#666666',
  textMuted: '#999999',
  white: '#FFFFFF',
} as const;

// Per-role accent, layered on top of the shared palette above so Coach and the person
// tracking their own weight ("Fatty") each get a visually distinct mode: cool/professional
// blue for Coach, warm/energetic orange for Fatty. Applied via `useAccentColors()`.
export const ROLE_ACCENTS = {
  coach: { primary: '#3B72D6', primaryDark: '#2B559E', primaryLight: '#E4ECFB' },
  client: { primary: '#F2704F', primaryDark: '#D5573A', primaryLight: '#FDEAE3' },
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

// The golden ratio (φ ≈ 1.618). Used to derive the type scale below and for a handful of
// deliberate proportions elsewhere (logo core-to-ring size, hero image aspect ratios).
export const GOLDEN_RATIO = 1.618;

// Type scale grown from `body` in both directions by φ^(1/4) (≈1.128, four steps per octave)
// for the fine text sizes and φ^(1/2) (≈1.272) for headings, so the jump to h1/h2 reads
// as more deliberate than the small text steps.
export const typography = {
  h1: { fontSize: 29, fontWeight: '800' as const },
  h2: { fontSize: 23, fontWeight: '800' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  title: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '600' as const },
  small: { fontSize: 11, fontWeight: '500' as const },
};

// FitQuest (Ver 4) design tokens — the dark game-HUD look from Design/v4-fitquest.
// Kept separate from tokens.ts so the classic light screens keep working unchanged during the
// migration; once every screen is on FitQuest the two can be merged.

export const quest = {
  bg: '#110D22',
  panel: '#1C1636',
  raised: '#241C44',
  raised2: '#2A2150',
  border: '#3A2F6B',
  text: '#F4F1FF',
  textSecondary: '#B3AACF',
  textTertiary: '#D8D2EE',

  /** Primary accent: levels, CTAs, active tab. Text on gold is always `onGold`. */
  gold: '#FFC83D',
  goldLight: '#FFE08A',
  onGold: '#110D22',

  hp: '#FF5470',
  hpText: '#FF8FA3',
  bossPanel: '#2A1A3A',
  bossBorder: '#5A2848',

  mana: '#4CC9F0',
  manaText: '#8EDDF5',
  manaPanel: '#10283A',
  manaBorder: '#1F5A78',

  xp: '#8BFF6B',
} as const;

/** Loaded in app/_layout.tsx. Android needs one family per weight (no fontWeight on custom fonts). */
export const questFonts = {
  medium: 'ChakraPetch_500Medium',
  semibold: 'ChakraPetch_600SemiBold',
  bold: 'ChakraPetch_700Bold',
} as const;

export const questRadius = { row: 12, panel: 16, button: 14 } as const;

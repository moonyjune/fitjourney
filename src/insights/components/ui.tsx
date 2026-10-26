import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { quest, questRadius } from '../../theme/quest';

export function Section({ children }: { children: string }) {
  return (
    <HudText size={17} accessibilityRole="header" style={styles.section}>
      {children}
    </HudText>
  );
}

export function Panel({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.panel, style]} />;
}

export function Line({ children, color = quest.textSecondary, size = 13, style }: { children: ReactNode; color?: string; size?: number; style?: object }) {
  return (
    <HudText size={size} weight="medium" color={color} style={[styles.line, style]}>
      {children}
    </HudText>
  );
}

export type Tone = 'ok' | 'fair' | 'bad' | 'plain';
export const TONE_COLOR: Record<Tone, string> = { ok: quest.xp, fair: quest.gold, bad: quest.hpText, plain: quest.text };

/** Higher is better (deficit, protein). */
export const toneHigh = (v: number, ok: number, fair: number): Tone => (v >= ok ? 'ok' : v >= fair ? 'fair' : 'bad');
/** Lower is better (purine, sugar, sodium). */
export const toneLow = (v: number, ok: number, fair: number): Tone => (v <= ok ? 'ok' : v <= fair ? 'fair' : 'bad');

const styles = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 8 },
  panel: { backgroundColor: quest.panel, borderColor: quest.border, borderWidth: 1.5, borderRadius: questRadius.panel, padding: 14, marginBottom: 10, overflow: 'hidden', gap: 4 },
  line: { lineHeight: 19 },
});

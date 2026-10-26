import { StyleSheet, View } from 'react-native';
import { HudText } from '../../components/quest/HudText';
import { fmtInt } from '../../insights/format';
import { useSettingsStore } from '../../store/useSettingsStore';
import { quest } from '../../theme/quest';
import type { MealLine, MealWarning } from '../meal';
import type { RepeatHit } from '../repeats';
import { useFeedbackText, type FeedbackKey } from '../strings';

const WARNING_KEY: Record<MealWarning['key'], FeedbackKey> = {
  sodium: 'fb.w.sodium',
  purine: 'fb.w.purine',
  sugar: 'fb.w.sugar',
  heavy: 'fb.w.heavy',
  lowProtein: 'fb.w.lowProtein',
};

export const LINE_COLOR = { good: quest.xp, note: quest.gold, replace: quest.hpText } as const;

/** Comments, number warnings and repeat notes about one food. Renders nothing when there is nothing to say. */
export function FeedbackLines({ lines, warnings = [], repeats = [], live = false }: { lines: MealLine[]; warnings?: MealWarning[]; repeats?: RepeatHit[]; live?: boolean }) {
  const f = useFeedbackText();
  const lang = useSettingsStore((s) => s.language);
  if (lines.length === 0 && warnings.length === 0 && repeats.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {lines.map((l) => (
        <HudText key={l.short} size={12} weight="medium" color={LINE_COLOR[l.kind]}>
          {l.kind === 'good' ? f('fb.lineGood', { short: l.short, why: l.why }) : f('fb.lineBad', { short: l.short, why: l.why, to: l.replaceWith })}
        </HudText>
      ))}
      {repeats.map((r) => (
        <HudText key={r.rule.keyword} size={12} weight="medium" color={quest.gold}>
          {live
            ? f('fb.liveRepeat', { short: r.rule.short, n: r.count, hint: r.rule.repeatHint || f('fb.repeatDefault') })
            : f('fb.repeatRow', { short: r.rule.short, n: r.count, hint: r.rule.repeatHint || f('fb.repeatDefault') })}
        </HudText>
      ))}
      {warnings.map((w) => (
        <HudText key={w.key} size={12} weight="medium" color={quest.hpText}>
          {f(WARNING_KEY[w.key], { v: fmtInt(w.value, lang) })}
        </HudText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: 4 } });

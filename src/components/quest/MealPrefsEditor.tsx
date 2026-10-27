import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { cleanPref, MEAL_KCAL_RANGE, MEAL_PROTEIN_RANGE, useMealPrefStore } from '../../store/useMealPrefStore';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestField } from './QuestField';

const textOf = (n: number | null) => (n == null ? '' : String(n));

/** The calories and protein the user wants from each meal, and the "never above the calories" switch. A field saves when it holds a
 *  valid number or is emptied (empty = not set); a half-typed or out-of-range value is left alone until it is fixed. */
export function MealPrefsEditor() {
  const g = useGameText();
  const kcal = useMealPrefStore((s) => s.kcal);
  const proteinG = useMealPrefStore((s) => s.proteinG);
  const strictKcal = useMealPrefStore((s) => s.strictKcal);
  const setPrefs = useMealPrefStore((s) => s.setPrefs);
  const [kcalText, setKcalText] = useState(textOf(kcal));
  const [proteinText, setProteinText] = useState(textOf(proteinG));

  // Another device's choice arriving from the cloud changes the stored value: show it.
  useEffect(() => setKcalText(textOf(kcal)), [kcal]);
  useEffect(() => setProteinText(textOf(proteinG)), [proteinG]);

  function change(text: string, setText: (v: string) => void, key: 'kcal' | 'proteinG', range: { min: number; max: number }) {
    const digits = text.replace(/[^0-9]/g, '');
    setText(digits);
    if (digits === '') setPrefs({ [key]: null });
    else {
      const value = cleanPref(Number(digits), range);
      if (value !== null) setPrefs({ [key]: value });
    }
  }

  return (
    <View style={styles.box} accessibilityLabel={g('meals.prefs.title')}>
      <HudText size={13}>{g('meals.prefs.title')}</HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {g('meals.prefs.hint')}
      </HudText>
      <View style={styles.pair}>
        <View style={styles.cell}>
          <QuestField label={g('meals.prefs.kcal')} unit="kcal" keyboardType="number-pad" value={kcalText} maxLength={4} onChangeText={(v) => change(v, setKcalText, 'kcal', MEAL_KCAL_RANGE)} />
        </View>
        <View style={styles.cell}>
          <QuestField label={g('meals.prefs.protein')} unit="g" keyboardType="number-pad" value={proteinText} maxLength={3} onChangeText={(v) => change(v, setProteinText, 'proteinG', MEAL_PROTEIN_RANGE)} />
        </View>
      </View>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <HudText size={13}>{g('meals.prefs.strict')}</HudText>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('meals.prefs.strictHint')}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={g('meals.prefs.strict')}
          value={strictKcal}
          onValueChange={(v) => setPrefs({ strictKcal: v })}
          trackColor={{ false: quest.raised2, true: quest.gold }}
          thumbColor={quest.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, paddingVertical: 6 },
  pair: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, minWidth: 0 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
});

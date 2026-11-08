import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MEAL_TIMES } from '../../ai/textMeal';
import { useGameText } from '../../game/strings';
import { useTranslation } from '../../i18n/useTranslation';
import type { StringKey } from '../../i18n/strings';
import { quest } from '../../theme/quest';
import type { ExtraMealTime } from '../../types';
import { clockText, MEAL_CLOCK, parseClock, timeTextInvalid, type Clock } from '../../utils/mealClock';
import { MAX_DRINK_ML } from '../../water/drinks';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestChip } from './QuestChip';
import { QuestField } from './QuestField';

export interface MealWhen {
  mealTime: ExtraMealTime | null;
  /** The time it was eaten; null = the meal's usual time. */
  clock: Clock | null;
  /** Millilitres counted as water; 0 = not counted. Absent when the form has no water field. */
  waterMl?: number;
}

interface Props {
  mealTime: ExtraMealTime | null;
  /** "HH:MM" as logged; empty when unknown. */
  time: string;
  /** Show the "Tính vào nước" field (a logged food, not a "Không ăn"). */
  withWater?: boolean;
  waterMl?: number;
  /** What the name says it holds as a drink, offered when nothing is counted yet. */
  suggestedWaterMl?: number;
  onSave: (next: MealWhen) => void;
  onCancel: () => void;
}

/** Changes which meal a logged food belongs to, the time it was eaten and how much of it counts as water, after it was saved. Picking
 *  another meal moves the time to that meal's usual time unless a time was typed here; nothing is saved before "Lưu". */
export function MealWhenForm({ mealTime: initialMeal, time, withWater, waterMl, suggestedWaterMl, onSave, onCancel }: Props) {
  const g = useGameText();
  const { t } = useTranslation();
  const [mealTime, setMealTime] = useState<ExtraMealTime | null>(initialMeal);
  const [timeText, setTimeText] = useState(time);
  const [timeTyped, setTimeTyped] = useState(false);
  const [waterText, setWaterText] = useState(waterMl && waterMl > 0 ? String(Math.round(waterMl)) : '');
  const timeInvalid = timeTextInvalid(timeText);
  const water = waterText.trim() === '' ? 0 : Math.round(Number(waterText.replace(',', '.')));
  const waterInvalid = !!withWater && (!Number.isFinite(water) || water < 0 || water > MAX_DRINK_ML);

  function pick(value: ExtraMealTime) {
    const next = mealTime === value ? null : value;
    setMealTime(next);
    if (next && !timeTyped) setTimeText(clockText(MEAL_CLOCK[next]));
  }

  function save() {
    if (timeInvalid || waterInvalid) return;
    onSave({ mealTime, clock: parseClock(timeText), ...(withWater ? { waterMl: water } : {}) });
  }

  return (
    <View style={styles.wrap}>
      <HudText size={13} color={quest.textSecondary}>
        {g('meal.slotSheet.title')}
      </HudText>
      <View style={styles.chips}>
        {MEAL_TIMES.map((value) => (
          <QuestChip key={value} label={t(`extraMealTime.${value}` as StringKey)} selected={mealTime === value} onPress={() => pick(value)} />
        ))}
      </View>
      <QuestField
        label={g('food.time')}
        keyboardType="numbers-and-punctuation"
        placeholder={mealTime ? clockText(MEAL_CLOCK[mealTime]) : '12:00'}
        value={timeText}
        onChangeText={(v) => {
          setTimeText(v);
          setTimeTyped(true);
        }}
        maxLength={5}
      />
      <HudText size={11} weight="medium" color={timeInvalid ? quest.hpText : quest.textSecondary} accessibilityRole={timeInvalid ? 'alert' : undefined}>
        {timeInvalid ? g('food.timeError') : g('food.timeHint')}
      </HudText>
      {withWater && (
        <>
          <QuestField label={g('meal.water.field')} unit="ml" keyboardType="number-pad" placeholder="0" value={waterText} onChangeText={setWaterText} maxLength={4} />
          {!waterText.trim() && suggestedWaterMl && suggestedWaterMl > 0 ? (
            <QuestButton variant="ghost" icon="drop" title={g('meal.water.useSuggested', { ml: suggestedWaterMl })} onPress={() => setWaterText(String(suggestedWaterMl))} />
          ) : null}
          <HudText size={11} weight="medium" color={waterInvalid ? quest.hpText : quest.textSecondary} accessibilityRole={waterInvalid ? 'alert' : undefined}>
            {waterInvalid ? g('meal.water.invalid', { max: MAX_DRINK_ML.toLocaleString('en-US') }) : g('meal.water.hint')}
          </HudText>
        </>
      )}
      <View style={styles.actions}>
        <View style={styles.flex}>
          <QuestButton variant="ghost" title={g('journal.partCancel')} onPress={onCancel} />
        </View>
        <View style={styles.flex}>
          <QuestButton icon="check" title={g('journal.whenSave')} onPress={save} disabled={timeInvalid || waterInvalid} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
});

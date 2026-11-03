import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WATER_QUICK_ADD_ML, WATER_QUICK_REMOVE_ML } from '../../constants/plan';
import { useGameText } from '../../game/strings';
import { logDayLabel } from '../../game/useLogDate';
import { useNutritionStore } from '../../store/useNutritionStore';
import { showToast } from '../../store/useToastStore';
import { quest, questRadius } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { useWaterPlan } from '../../water/useWaterPlan';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestField } from './QuestField';
import { WaterNextDrink } from './WaterNextDrink';

/** Most water one entry adds (a typo like 25000 is refused). */
export const WATER_ENTRY_MAX_ML = 3000;

const fmt = (ml: number) => ml.toLocaleString('en-US');

/** Adds (or, negative, takes off) water on a day, never below 0, and shows the toast whose "Hoàn tác" puts the day back exactly. */
export function changeWater(dateKey: string, ml: number, texts: { added: (ml: number, total: string) => string; removed: (ml: number, total: string) => string }): void {
  const store = useNutritionStore.getState();
  const before = store.logs[dateKey]?.waterMl ?? 0;
  const change = Math.max(-before, ml);
  if (change === 0) return;
  store.addWater(dateKey, change);
  const total = fmt(before + change);
  showToast({
    text: change > 0 ? texts.added(change, total) : texts.removed(-change, total),
    tone: 'mana',
    undo: () => useNutritionStore.getState().addWater(dateKey, -change),
  });
}

interface Props {
  visible: boolean;
  onClose: () => void;
  dateKey: string;
  now: Date;
}

/** "Nước" (Design/uiux-proposal/html/dialogs/04-water-undo.html), opened by a long press on a water chip or a tap on the water bar:
 *  the day's total, another amount to add, the quick amounts, and "Sửa tổng" (−250 ml, reset to 0), each with a "Hoàn tác" toast
 *  instead of a confirmation. Replaces the −250 / −500 chips of the old quick-add sheet. */
export function WaterAmountSheet({ visible, onClose, dateKey, now }: Props) {
  const g = useGameText();
  const water = useWaterPlan(dateKey);
  const waterMl = useNutritionStore((s) => s.logs[dateKey]?.waterMl ?? 0);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (visible) {
      setText('');
      setInvalid(false);
    }
  }, [visible]);

  const isToday = dateKey === toDateKey(now);
  const day = logDayLabel(dateKey, now, g);
  const pct = water.targetMl > 0 ? Math.min(100, (waterMl / water.targetMl) * 100) : 0;
  const done = water.schedule.filter((c) => waterMl >= c.cumulativeTargetMl).length;
  const texts = {
    added: (ml: number, total: string) => g('quick.waterAdded', { ml, total }),
    removed: (ml: number, total: string) => g('quick.waterRemoved', { ml, total }),
  };

  function add(ml: number) {
    changeWater(dateKey, ml, texts);
    onClose();
  }

  function addTyped() {
    const ml = Math.round(Number(text.replace(',', '.')));
    if (!Number.isFinite(ml) || ml <= 0 || ml > WATER_ENTRY_MAX_ML) {
      setInvalid(true);
      return;
    }
    add(ml);
  }

  function reset() {
    const before = waterMl;
    if (before <= 0) return;
    useNutritionStore.getState().resetWater(dateKey);
    onClose();
    showToast({ text: g('water.sheet.resetDone', { day }), tone: 'mana', undo: () => useNutritionStore.getState().addWater(dateKey, before) });
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} tone="mana" title={g('water.sheet.title', { day })} testID="water-sheet">
      <View style={styles.totalRow}>
        <HudText size={28}>
          {`${(waterMl / 1000).toFixed(2).replace(/0$/, '')} `}
          <HudText size={15} color={quest.textSecondary}>{`/ ${(water.targetMl / 1000).toFixed(1)} L`}</HudText>
        </HudText>
        {water.schedule.length > 0 ? (
          <HudText size={12} weight="medium" color={quest.manaText}>
            {g('water.sheet.count', { n: done, t: water.schedule.length })}
          </HudText>
        ) : null}
      </View>
      <View style={styles.track} accessibilityLabel={g('quick.waterTotalMl', { cur: fmt(waterMl), target: fmt(water.targetMl) })}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      {isToday ? <WaterNextDrink schedule={water.schedule} waterMl={waterMl} now={now} /> : null}

      <HudText size={13} color={quest.textSecondary} style={styles.label}>
        {g('water.sheet.add')}
      </HudText>
      <View style={styles.addRow}>
        <View style={styles.flex}>
          <QuestField
            label={g('water.sheet.field')}
            unit="ml"
            keyboardType="number-pad"
            value={text}
            onChangeText={(v) => {
              setText(v);
              setInvalid(false);
            }}
            onSubmitEditing={addTyped}
            placeholder="350"
          />
        </View>
        <View style={styles.addBtn}>
          <QuestButton variant="mana" title={g('water.sheet.addBtn')} onPress={addTyped} />
        </View>
      </View>
      {invalid ? (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityLiveRegion="polite">
          {g('water.sheet.invalid', { max: fmt(WATER_ENTRY_MAX_ML) })}
        </HudText>
      ) : null}
      <View style={styles.chips}>
        {WATER_QUICK_ADD_ML.map((ml) => (
          <Pressable
            key={ml}
            accessibilityRole="button"
            accessibilityLabel={g('quick.waterAdd', { ml })}
            onPress={() => add(ml)}
            style={({ pressed }) => [styles.chip, styles.chipMana, pressed && styles.pressed]}
          >
            <HudText size={14} color={quest.manaText}>{`+${ml}`}</HudText>
          </Pressable>
        ))}
      </View>

      <HudText size={13} color={quest.textSecondary} style={styles.label}>
        {g('water.sheet.fix')}
      </HudText>
      <View style={styles.chips}>
        {WATER_QUICK_REMOVE_ML.slice(0, 1).map((ml) => (
          <Pressable
            key={ml}
            accessibilityRole="button"
            accessibilityLabel={g('quick.waterRemove', { ml })}
            accessibilityState={{ disabled: waterMl <= 0 }}
            disabled={waterMl <= 0}
            onPress={() => add(-ml)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed, waterMl <= 0 && styles.off]}
          >
            <HudText size={14}>{`−${ml} ml`}</HudText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={g('water.sheet.reset')}
          accessibilityState={{ disabled: waterMl <= 0 }}
          disabled={waterMl <= 0}
          onPress={reset}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed, waterMl <= 0 && styles.off]}
        >
          <HudText size={14}>{g('water.sheet.reset')}</HudText>
        </Pressable>
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.note}>
        {g('water.sheet.note')}
      </HudText>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: quest.bg, overflow: 'hidden', marginTop: 8, marginBottom: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: quest.mana },
  label: { marginTop: 14, marginBottom: 6 },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  flex: { flex: 1 },
  addBtn: { width: 110 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  chipMana: { borderColor: quest.manaBorder, backgroundColor: quest.bg },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.4 },
  note: { marginTop: 10 },
});

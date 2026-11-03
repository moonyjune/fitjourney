import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { showToast } from '../../store/useToastStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWeightStore } from '../../store/useWeightStore';
import { quest } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { momentOnDay } from '../../utils/logDate';
import { BottomSheet } from './BottomSheet';
import { DateChip } from './DateChip';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { Stepper } from './Stepper';

export const WEIGHT_MIN_KG = 20;
export const WEIGHT_MAX_KG = 300;


interface Props {
  visible: boolean;
  onClose: () => void;
  /** The day the weighing is for (the shared selected day). */
  dateKey: string;
  now: Date;
  /** Opens the weight screen (chart and every weighing, where one can be deleted). */
  onOpenHistory: () => void;
}

/** "Cân nặng" (Design/uiux-proposal/html/dialogs/02-weight-sheet.html): the phase-0 Stepper ±0.1 (the number can be typed),
 *  what is left to the goal, the change since the last weighing, and "Lưu x kg" for the chosen day. Saving closes the sheet and shows
 *  a toast with "Hoàn tác". No delete here (dialogs.md decision 4): weighings are deleted on the weight screen. */
export function WeightSheet({ visible, onClose, dateKey, now, onOpenHistory }: Props) {
  const g = useGameText();
  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const latest = useWeightStore((s) => s.latest());
  const addEntry = useWeightStore((s) => s.addEntry);
  const lastKg = latest?.weightKg ?? startWeightKg;
  const [kg, setKg] = useState(() => Math.round(lastKg * 10) / 10);
  const [valid, setValid] = useState(true);
  const [error, setError] = useState(false);

  // Each opening starts from the last weighing.
  useEffect(() => {
    if (!visible) return;
    setKg(Math.round(lastKg * 10) / 10);
    setValid(true);
    setError(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = dateKey === toDateKey(now);
  const left = Math.max(0, (valid ? kg : lastKg) - goalWeightKg);
  const diff = Math.round((kg - lastKg) * 10) / 10;

  function save() {
    if (!valid) {
      setError(true);
      return;
    }
    const label = kg.toFixed(1);
    const id = addEntry(kg, undefined, momentOnDay(dateKey, now).toISOString());
    onClose();
    AccessibilityInfo.announceForAccessibility(g('quick.weightSaved', { kg: label }));
    showToast({ text: g('quick.weightSaved', { kg: label }), undo: () => useWeightStore.getState().removeEntry(id) });
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={g('quick.weight')}
      subtitle={g('quick.weightLeft', { kg: left.toFixed(1), goal: goalWeightKg })}
      headerRight={<DateChip size="small" hint={g('quick.dateHintAll')} />}
      testID="weight-sheet"
      footer={<QuestButton icon="check" title={g('quick.weightSave', { kg: (valid ? kg : lastKg).toFixed(1) })} onPress={save} />}
    >
      <View style={styles.stepper}>
        <Stepper
          value={kg}
          onChange={(v) => {
            setKg(v);
            setError(false);
          }}
          onValidChange={(ok) => {
            setValid(ok);
            if (ok) setError(false);
          }}
          invalid={error}
          step={0.1}
          min={WEIGHT_MIN_KG}
          max={WEIGHT_MAX_KG}
          decimals={1}
          caption={g('weight.sheet.caption', { kg: lastKg.toFixed(1) })}
          label={isToday ? g('quick.weightField') : g('weight.sheet.field')}
          lessLabel={g('quick.weightDown')}
          moreLabel={g('quick.weightUp')}
        />
      </View>
      {error ? (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityLiveRegion="polite" style={styles.center}>
          {g('quick.weightInvalid')}
        </HudText>
      ) : diff !== 0 && valid ? (
        <HudText size={12} weight="medium" color={diff < 0 ? quest.xp : quest.textSecondary} style={styles.center}>
          {g('weight.sheet.diff', { d: `${diff > 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)}` })}
        </HudText>
      ) : null}
      <Pressable accessibilityRole="link" accessibilityLabel={g('weight.sheet.history')} onPress={onOpenHistory} style={styles.link}>
        <HudText size={13} color={quest.manaText}>
          {g('weight.sheet.history')}
        </HudText>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stepper: { marginTop: 8, marginBottom: 8 },
  center: { textAlign: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { scheduleAllReminders } from '../../notifications/schedule';
import { usePlanStore } from '../../store/usePlanStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useWaterWindowStore } from '../../store/useWaterWindowStore';
import { quest, questRadius } from '../../theme/quest';
import {
  clockText,
  WATER_START_RANGE,
  WATER_END_RANGE,
  WATER_TARGET_PRESETS_ML,
  WATER_TARGET_RANGE,
  WATER_TARGET_STEP_ML,
  waterDrinkAmounts,
} from '../../water/schedule';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

const WINDOW_STEP_MIN = 30;
const litres = (ml: number) => String(Math.round(ml / 50) / 20);

/** The daily reminders follow the plan in force: re-schedule them after a change (no-op where notifications are unavailable). */
function refreshReminders() {
  if (!useSettingsStore.getState().remindersEnabled) return;
  scheduleAllReminders(usePlanStore.getState().plan).catch((error) => console.warn('[notifications] unavailable in this runtime:', error));
}

function Stepper({ label, value, lessLabel, moreLabel, canLess, canMore, onLess, onMore }: {
  label: string;
  value: string;
  lessLabel: string;
  moreLabel: string;
  canLess: boolean;
  canMore: boolean;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <View style={styles.row}>
      <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
        {label}
      </HudText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        accessibilityState={{ disabled: !canLess }}
        disabled={!canLess}
        onPress={() => {
          onLess();
        }}
        style={[styles.step, !canLess && styles.off]}
      >
        <QuestIcon name="minus" size={16} color={quest.text} strokeWidth={2.6} />
      </Pressable>
      <HudText size={15} color={quest.gold} style={styles.value} accessibilityLabel={`${label} ${value}`}>
        {value}
      </HudText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        accessibilityState={{ disabled: !canMore }}
        disabled={!canMore}
        onPress={() => {
          onMore();
        }}
        style={[styles.step, !canMore && styles.off]}
      >
        <QuestIcon name="plus" size={16} color={quest.text} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

/** Profile section of the water plan: the daily target (presets and ± 250 ml) and the drinking window the drinks are spread over.
 *  A change applies to today and the days after; past days keep their own target. */
export function WaterSettings() {
  const g = useGameText();
  const target = useSettingsStore((s) => s.waterTargetMl);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const start = useWaterWindowStore((s) => s.startMinutes);
  const end = useWaterWindowStore((s) => s.endMinutes);
  const setWindow = useWaterWindowStore((s) => s.setWindow);
  const [min, max] = WATER_TARGET_RANGE;

  function setTarget(ml: number) {
    const next = Math.min(max, Math.max(min, Math.round(ml)));
    if (next === target) return;
    updateSettings({ waterTargetMl: next });
    refreshReminders();
  }
  function moveWindow(nextStart: number, nextEnd: number) {
    setWindow(nextStart, nextEnd);
    refreshReminders();
  }

  const startLabel = g('water.setting.start');
  const endLabel = g('water.setting.end');
  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <QuestIcon name="drop" size={20} color={quest.mana} />
        <View style={styles.flex}>
          <HudText size={15}>{g('water.setting.title')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('water.setting.hint')}
          </HudText>
        </View>
      </View>

      <Stepper
        label={g('water.setting.title')}
        value={g('water.setting.value', { l: litres(target), n: waterDrinkAmounts(target).length })}
        lessLabel={g('water.setting.less')}
        moreLabel={g('water.setting.more')}
        canLess={target > min}
        canMore={target < max}
        onLess={() => setTarget(target - WATER_TARGET_STEP_ML)}
        onMore={() => setTarget(target + WATER_TARGET_STEP_ML)}
      />
      <View style={styles.presets}>
        {WATER_TARGET_PRESETS_ML.map((ml) => {
          const on = ml === target;
          return (
            <Pressable
              key={ml}
              accessibilityRole="button"
              accessibilityLabel={g('water.setting.preset', { l: litres(ml) })}
              accessibilityState={{ selected: on }}
              onPress={() => {
                setTarget(ml);
              }}
              style={[styles.preset, on && styles.presetOn]}
            >
              <HudText size={13} color={on ? quest.onGold : quest.manaText}>
                {`${litres(ml)} L`}
              </HudText>
            </Pressable>
          );
        })}
      </View>

      <Stepper
        label={startLabel}
        value={clockText(Math.floor(start / 60), start % 60)}
        lessLabel={g('water.setting.earlier', { what: startLabel })}
        moreLabel={g('water.setting.later', { what: startLabel })}
        canLess={start > WATER_START_RANGE[0]}
        canMore={start < WATER_START_RANGE[1]}
        onLess={() => moveWindow(start - WINDOW_STEP_MIN, end)}
        onMore={() => moveWindow(start + WINDOW_STEP_MIN, end)}
      />
      <Stepper
        label={endLabel}
        value={clockText(Math.floor(end / 60), end % 60)}
        lessLabel={g('water.setting.earlier', { what: endLabel })}
        moreLabel={g('water.setting.later', { what: endLabel })}
        canLess={end > Math.max(WATER_END_RANGE[0], start + 180)}
        canMore={end < WATER_END_RANGE[1]}
        onLess={() => moveWindow(start, end - WINDOW_STEP_MIN)}
        onMore={() => moveWindow(start, end + WINDOW_STEP_MIN)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, marginTop: 12, padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  value: { minWidth: 96, textAlign: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel, alignItems: 'center', justifyContent: 'center' },
  presetOn: { backgroundColor: quest.gold, borderColor: quest.gold },
});

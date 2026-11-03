import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../../src/components/quest/HudText';
import { InfoButton } from '../../src/components/quest/InfoButton';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { SettingsGroup, SettingsGroupTitle, SettingsLinkRow, SettingsSwitchRow } from '../../src/components/quest/SettingsRows';
import { useGameText, type GameKey } from '../../src/game/strings';
import { LIMIT_RANGE, useLimitsStore, type LimitKey } from '../../src/store/useLimitsStore';
import { useMealModeStore } from '../../src/store/useMealModeStore';
import { useUricStore } from '../../src/store/useUricStore';
import { quest, questRadius } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { useUricText } from '../../src/uric/strings';
import { backToProfile } from '../../src/utils/backToProfile';
import { formatDateVi } from '../../src/utils/date';

function LimitRow({ limitKey, name, value, moreLabel, lessLabel }: { limitKey: LimitKey; name: string; value: string; moreLabel: string; lessLabel: string }) {
  const nudge = useLimitsStore((s) => s.nudge);
  const current = useLimitsStore((s) => s[limitKey]);
  const { min, max } = LIMIT_RANGE[limitKey];
  return (
    <View style={styles.limitRow}>
      <HudText size={14} style={styles.flex}>
        {name}
      </HudText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lessLabel}
        accessibilityState={{ disabled: current <= min }}
        disabled={current <= min}
        onPress={() => nudge(limitKey, -1)}
        style={[styles.step, current <= min && styles.off]}
      >
        <QuestIcon name="minus" size={18} color={quest.text} strokeWidth={2.6} />
      </Pressable>
      <HudText size={15} color={quest.gold} style={styles.limitValue} accessibilityLabel={`${name} ${value}`}>
        {value}
      </HudText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreLabel}
        accessibilityState={{ disabled: current >= max }}
        disabled={current >= max}
        onPress={() => nudge(limitKey, 1)}
        style={[styles.step, current >= max && styles.off]}
      >
        <QuestIcon name="plus" size={18} color={quest.text} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

/** Hồ sơ › Giới hạn & 16:8 (dialogs 35): the daily purine / salt / sugar limits, intermittent fasting, "Tôi không ăn sáng" (only on
 *  three-meal days) and the way to the uric acid page. The long explanations are behind ⓘ. */
export default function LimitsSettingsScreen() {
  const g = useGameText();
  const tu = useUricText();
  useLightStatusBar();
  const limits = useLimitsStore();
  const resetLimits = useLimitsStore((s) => s.reset);
  const fasting = useMealModeStore((s) => s.fasting);
  const setFasting = useMealModeStore((s) => s.setFasting);
  const skipBreakfast = useMealModeStore((s) => s.skipBreakfast);
  const setSkipBreakfast = useMealModeStore((s) => s.setSkipBreakfast);
  const readings = useUricStore((s) => s.readings);
  const latestUric = readings.reduce<(typeof readings)[number] | null>((best, r) => (!best || r.dateKey > best.dateKey ? r : best), null);

  const rows: [LimitKey, GameKey, string][] = [
    ['purineMg', 'limits.purine', g('limits.unitMg', { n: limits.purineMg })],
    ['saltG', 'limits.salt', g('limits.unitG', { n: limits.saltG })],
    ['sugarG', 'limits.sugar', g('limits.unitG', { n: limits.sugarG })],
  ];

  return (
    <ScreenTemplate title={g('rd6.set.limits')} eyebrow={g('profile.title')} onBack={backToProfile}>
      <SettingsGroupTitle>{g('limits.title')}</SettingsGroupTitle>
      <View style={styles.panel}>
        {rows.map(([key, nameKey, value]) => (
          <LimitRow
            key={key}
            limitKey={key}
            name={g(nameKey)}
            value={value}
            moreLabel={g('limits.more', { name: g(nameKey) })}
            lessLabel={g('limits.less', { name: g(nameKey) })}
          />
        ))}
        <View style={styles.hintRow}>
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {g('limits.hint')}
          </HudText>
          <InfoButton about={g('limits.title')} body={[g('rd6.info.limits')]} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={g('limits.reset')} onPress={resetLimits} style={styles.reset}>
          <HudText size={13} color={quest.textSecondary}>
            {g('limits.reset')}
          </HudText>
        </Pressable>
      </View>

      <SettingsGroupTitle>{g('fasting.title')}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsSwitchRow
          first
          icon="clock"
          color={quest.gold}
          label={g('fasting.title')}
          hint={g('fasting.hint')}
          info={<InfoButton about={g('fasting.title')} title={g('rd6.info.fastingTitle')} body={[g('fasting.what'), g('rd6.info.fasting')]} />}
          value={fasting}
          onChange={setFasting}
        />
        {/* Normal (three-meal) days only: breakfast is then not an expected meal. */}
        {!fasting && (
          <SettingsSwitchRow
            icon="clock"
            color={quest.goldLight}
            label={g('fasting.skipBreakfast')}
            hint={g('fasting.skipBreakfastHint')}
            info={<InfoButton about={g('fasting.skipBreakfast')} body={[g('rd6.info.skipBreakfast')]} />}
            value={!!skipBreakfast}
            onChange={setSkipBreakfast}
          />
        )}
      </SettingsGroup>

      <SettingsGroupTitle>{tu('ur.profileRow')}</SettingsGroupTitle>
      <SettingsGroup>
        <SettingsLinkRow
          first
          icon="drop"
          color={quest.hp}
          label={tu('ur.profileRow')}
          value={latestUric ? `${latestUric.valueUmol} µmol/L · ${formatDateVi(latestUric.dateKey).slice(0, 5)}` : g('rd6.limits.uricNone')}
          onPress={() => router.push('/uric')}
        />
      </SettingsGroup>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  panel: { gap: 4, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  limitValue: { minWidth: 72, textAlign: 'center' },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.4 },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  reset: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
});

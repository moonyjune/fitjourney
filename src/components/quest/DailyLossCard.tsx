import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { explainDailyLoss, type Lang, type LossExplanation, type LossLine } from '../../game/dailyLossExplain';
import { useGameText } from '../../game/strings';
import { useDailyLoss, type DailyLoss } from '../../game/useDailyLoss';
import { useSettingsStore } from '../../store/useSettingsStore';
import { quest, questRadius } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

export interface DailyLossCardProps {
  dayKey: string;
  isToday: boolean;
  /** "T4 12/11": how the headline names a day that is not today. */
  dayLabel: string;
  testID?: string;
}

/** "Ước tính hôm nay: −120 g mỡ · cân có thể −300…−500 g ⓘ" (Camp and Journal › Ngày), opening the sheet that explains it. Nothing
 *  when the day has no food logged. */
export function DailyLossCard({ dayKey, isToday, dayLabel, testID = 'daily-loss' }: DailyLossCardProps) {
  const loss = useDailyLoss(dayKey);
  if (!loss) return null;
  return <DailyLossLine loss={loss} isToday={isToday} dayLabel={dayLabel} testID={testID} />;
}

/** The line and its sheet for a computed estimate (split out so tests can give it fixed numbers). */
export function DailyLossLine({ loss, isToday, dayLabel, testID = 'daily-loss' }: { loss: DailyLoss; isToday: boolean; dayLabel: string; testID?: string }) {
  const g = useGameText();
  const lang: Lang = useSettingsStore((s) => s.language) === 'en' ? 'en' : 'vi';
  const [open, setOpen] = useState(false);
  const e = explainDailyLoss({ ...loss, isToday, dayLabel, lang });
  const text = (l: LossLine) => g(l.key, l.params);
  const gain = loss.estimate.fatG < 0;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${text(e.headline)}. ${g('loss.a11y')}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        testID={testID}
      >
        <HudText size={13} weight="medium" color={gain ? quest.hpText : quest.xp} style={styles.flex}>
          {text(e.headline)}
        </HudText>
        <HudText size={16} color={quest.manaText}>
          ⓘ
        </HudText>
      </Pressable>
      {open && <DailyLossSheet explanation={e} isToday={isToday} dayLabel={dayLabel} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DailyLossSheet({ explanation: e, isToday, dayLabel, onClose }: { explanation: LossExplanation; isToday: boolean; dayLabel: string; onClose: () => void }) {
  const g = useGameText();
  const text = (l: LossLine) => g(l.key, l.params);
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={g('loss.title')}
      subtitle={g(e.confidence)}
      footer={<QuestButton title={g('loss.ok')} variant="ghost" onPress={onClose} />}
      testID="daily-loss-sheet"
    >
      <View style={styles.body}>
        <HudText size={14} color={quest.text}>
          {text(e.headline)}
        </HudText>
        {e.week && (
          <HudText size={13} weight="medium" color={e.week.key === 'loss.weekBurned' ? quest.gold : quest.hpText}>
            {text(e.week)}
          </HudText>
        )}
        {e.weighIn && (
          <HudText size={12} weight="medium" color={quest.manaText}>
            {text(e.weighIn)}
          </HudText>
        )}

        <Section title={isToday ? g('loss.vars') : g('loss.varsDay', { day: dayLabel })}>
          <View style={styles.table}>
            {e.vars.map((row) => (
              <View key={row.label} style={styles.row} accessible accessibilityLabel={`${g(row.label)} ${row.value} ${row.unit}`}>
                <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
                  {g(row.label)}
                </HudText>
                <HudText size={13} color={quest.text}>
                  {row.value}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.unit}>
                  {row.unit}
                </HudText>
              </View>
            ))}
          </View>
        </Section>

        <Section title={g('loss.why')}>
          {e.why.map((l, i) => (
            <Bullet key={`w${i}`} mark="•" color={quest.gold} text={text(l)} />
          ))}
        </Section>

        <Section title={g('loss.order')}>
          {e.order.map((l, i) => (
            <Bullet key={`o${i}`} mark={`${i + 1}.`} color={quest.manaText} text={text(l)} />
          ))}
        </Section>

        <Section title={g('loss.tips')}>
          {e.tips.map((l, i) => (
            <Bullet key={`t${i}`} mark="✓" color={quest.xp} text={text(l)} />
          ))}
        </Section>

        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('loss.disclaimer')}
        </HudText>
      </View>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <HudText size={13} color={quest.text}>
        {title}
      </HudText>
      {children}
    </View>
  );
}

function Bullet({ mark, color, text }: { mark: string; color: string; text: string }) {
  return (
    <View style={styles.bullet}>
      <HudText size={13} color={color} style={styles.mark}>
        {mark}
      </HudText>
      <HudText size={13} weight="medium" color={quest.textTertiary} style={styles.flex}>
        {text}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    borderRadius: questRadius.row,
    borderWidth: 1,
    borderColor: quest.border,
    backgroundColor: quest.panel,
  },
  flex: { flex: 1, minWidth: 0 },
  body: { gap: 16 },
  section: { gap: 6 },
  table: { borderRadius: questRadius.row, borderWidth: 1, borderColor: quest.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: quest.border },
  unit: { minWidth: 32 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  mark: { minWidth: 16 },
});

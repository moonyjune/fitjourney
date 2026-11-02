import { useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { TEMPTATION_RESIST_XP } from '../../game/constants';
import { useGameText } from '../../game/strings';
import { useMealModeStore } from '../../store/useMealModeStore';
import { useTemptationStore } from '../../store/useTemptationStore';
import type { TemptFrequency, TemptLevel } from '../../temptation/schedule';
import { temptationXp } from '../../temptation/stats';
import { summonTemptation } from '../../temptation/summon';
import { quest, questFonts, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';
import { QuestSegment } from './QuestSegment';

const pad = (n: number) => String(n).padStart(2, '0');
const wrap = (h: number) => (h + 24) % 24;

function HourStepper({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  const g = useGameText();
  return (
    <View style={styles.hourRow}>
      <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
        {label}
      </HudText>
      <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.earlier', { what: label })} onPress={() => onChange(wrap(value - 1))} style={styles.step}>
        <QuestIcon name="minus" size={16} color={quest.text} strokeWidth={2.6} />
      </Pressable>
      <HudText size={15} color={quest.gold} style={styles.hourValue}>
        {`${pad(value)}:00`}
      </HudText>
      <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.later', { what: label })} onPress={() => onChange(wrap(value + 1))} style={styles.step}>
        <QuestIcon name="plus" size={16} color={quest.text} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

/** Profile section of the temptation challenge: on/off, level, frequency, quiet hours, city (Hard), the record and recent answers, and
 *  a practice pop-up. Compact: only the switch shows while it is off. */
export function TemptationSettings() {
  const g = useGameText();
  const settings = useTemptationStore((s) => s.settings);
  const stats = useTemptationStore((s) => s.stats);
  const history = useTemptationStore((s) => s.history);
  const busy = useTemptationStore((s) => s.busy);
  const setSettings = useTemptationStore((s) => s.setSettings);
  const fasting = useMealModeStore((s) => s.fasting);
  const [city, setCity] = useState(settings.city);

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <HudText size={20}>😈</HudText>
        <View style={styles.flex}>
          <HudText size={15}>{g('tempt.title')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('tempt.hint', { xp: TEMPTATION_RESIST_XP })}
          </HudText>
        </View>
        <Switch
          accessibilityLabel={g('tempt.title')}
          value={settings.enabled}
          onValueChange={(enabled) => setSettings({ enabled })}
          trackColor={{ false: quest.raised2, true: quest.gold }}
          thumbColor={quest.text}
        />
      </View>

      {settings.enabled && (
        <>
          <HudText size={13}>{g('tempt.level')}</HudText>
          <QuestSegment<TemptLevel>
            accessibilityLabel={g('tempt.level')}
            value={settings.level}
            onChange={(level) => setSettings({ level })}
            options={[
              { value: 'easy', label: g('tempt.easy') },
              { value: 'hard', label: g('tempt.hard') },
            ]}
          />
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {settings.level === 'easy' ? g('tempt.levelHintEasy') : g('tempt.levelHintHard')}
          </HudText>

          <HudText size={13}>{g('tempt.freq')}</HudText>
          <QuestSegment<TemptFrequency>
            accessibilityLabel={g('tempt.freq')}
            value={settings.frequency}
            onChange={(frequency) => setSettings({ frequency })}
            options={[
              { value: 'low', label: g('tempt.freqLow') },
              { value: 'mid', label: g('tempt.freqMid') },
              { value: 'high', label: g('tempt.freqHigh') },
            ]}
          />

          <HudText size={13}>
            {g('tempt.quiet')} · {g('tempt.quietValue', { from: pad(settings.quietStartHour), to: pad(settings.quietEndHour) })}
          </HudText>
          <HourStepper label={g('tempt.quietFrom')} value={settings.quietStartHour} onChange={(quietStartHour) => setSettings({ quietStartHour })} />
          <HourStepper label={g('tempt.quietTo')} value={settings.quietEndHour} onChange={(quietEndHour) => setSettings({ quietEndHour })} />
          {fasting && (
            <HudText size={12} weight="medium" color={quest.manaText}>
              {g('tempt.fastingNote')}
            </HudText>
          )}

          {settings.level === 'hard' && (
            <>
              <TextInput
                accessibilityLabel={g('tempt.city')}
                placeholder={g('tempt.cityPlaceholder')}
                placeholderTextColor={quest.textSecondary}
                value={city}
                onChangeText={setCity}
                onBlur={() => city !== settings.city && setSettings({ city })}
                onSubmitEditing={() => city !== settings.city && setSettings({ city })}
                style={styles.input}
              />
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('tempt.cityHint')}
              </HudText>
            </>
          )}

          <HudText size={13} color={quest.gold} accessibilityLiveRegion="polite">
            {g('tempt.stats', { r: stats.resisted, g: stats.gaveIn, s: stats.streak, b: stats.bestStreak, xp: temptationXp(stats) })}
          </HudText>

          {history.length > 0 && (
            <View style={styles.history}>
              <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
                {g('tempt.history').toUpperCase()}
              </HudText>
              {history.slice(0, 5).map((h) => (
                <View key={h.at} style={styles.histRow} accessible accessibilityLabel={`${h.name}, ${g(h.outcome === 'resisted' ? 'tempt.histResisted' : 'tempt.histGaveIn')}`}>
                  <HudText size={16}>{h.emoji}</HudText>
                  <HudText size={13} weight="medium" style={styles.flex} numberOfLines={1}>
                    {h.name}
                  </HudText>
                  <HudText size={12} color={h.outcome === 'resisted' ? quest.xp : quest.hpText}>
                    {h.outcome === 'resisted' ? '💪' : '😅'} {new Date(h.at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} {pad(new Date(h.at).getHours())}:{pad(new Date(h.at).getMinutes())}
                  </HudText>
                </View>
              ))}
            </View>
          )}

          <QuestButton variant="ghost" title={busy ? g('tempt.preparing') : g('tempt.tryNow')} loading={busy} onPress={() => void summonTemptation(new Date(), true)} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 10, marginTop: 12, padding: 14, borderRadius: questRadius.panel, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.bossBorder },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  hourValue: { minWidth: 60, textAlign: 'center' },
  step: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg, color: quest.text, fontSize: 16, fontFamily: questFonts.semibold },
  history: { gap: 6 },
  eyebrow: { letterSpacing: 1.6 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MISSION_XP, PERFECT_DAY_BONUS_XP, type MissionId } from '../../game/constants';
import { describeMission, MISSION_COOKBOOK, MISSION_SHORT, missionRingRatio, missionRingValue } from '../../game/missionCopy';
import type { DayEvaluation, MissionResult, MissionStatus } from '../../game/missions';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { MissionRow } from './MissionRow';
import { ProgressRing } from './ProgressRing';
import { QuestIcon } from './QuestIcon';

const RING_COLOR: Record<MissionStatus, string> = {
  done: quest.xp,
  holding: quest.mana,
  open: quest.gold,
  // "Not met" is neutral grey, never red: the game never shames the player.
  missed: quest.textSecondary,
};

export function missionCounts(missions: MissionResult[]) {
  return {
    done: missions.filter((m) => m.status === 'done').length,
    holding: missions.filter((m) => m.status === 'holding').length,
    open: missions.filter((m) => m.status === 'open').length,
  };
}

function Ring({ m, day }: { m: MissionResult; day: DayEvaluation }) {
  const value = missionRingValue(m, day);
  const color = RING_COLOR[m.status];
  return (
    <ProgressRing ratio={missionRingRatio(m)} size={40} stroke={3.5} color={color} fill={m.status === 'done' ? 'transparent' : undefined}>
      {m.status === 'done' ? (
        <QuestIcon name="check" size={16} color={quest.xp} strokeWidth={3} />
      ) : value == null ? (
        <QuestIcon name="dumbbell" size={16} color={color} strokeWidth={2.4} />
      ) : (
        <HudText size={value.length > 4 ? 10 : 11} color={color} numberOfLines={1}>
          {value}
        </HudText>
      )}
    </ProgressRing>
  );
}

/** Camp's "Nhiệm vụ" row: the 7 missions as small rings with their figure; one tap opens the full list (`MissionsSheet`). */
export function MissionRings({ day, onOpen }: { day: DayEvaluation; onOpen: () => void }) {
  const g = useGameText();
  const counts = missionCounts(day.missions);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${g('missions.title')}. ${g('missions.summary', counts)}`}
      accessibilityHint={g('camp.missionsOpen')}
      onPress={onOpen}
      style={({ pressed }) => [styles.ringsWrap, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.ringsHead}>
        <HudText size={17} accessibilityRole="header">
          {g('camp.missions')}
        </HudText>
        <View style={styles.headRight}>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('camp.missionsDone', { done: counts.done, n: day.missions.length })}
          </HudText>
          <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
        </View>
      </View>
      <View style={styles.rings}>
        {day.missions.map((m) => (
          <View key={m.id} style={styles.ringCell}>
            <Ring m={m} day={day} />
            <HudText size={10} weight="medium" color={quest.textSecondary} numberOfLines={1}>
              {g(MISSION_SHORT[m.id])}
            </HudText>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

interface MissionsSheetProps {
  visible: boolean;
  onClose: () => void;
  day: DayEvaluation;
}

/** "Nhiệm vụ hôm nay" (dialog 17): every mission with its status, progress and XP; the Perfect Day line and the estimate note.
 *  Tapping Tập opens the Train tab; a mission about what was eaten opens the day's journal, with a link to the cook book filtered. */
export function MissionsSheet({ visible, onClose, day }: MissionsSheetProps) {
  const g = useGameText();
  const counts = missionCounts(day.missions);
  const go = (to: Parameters<typeof router.push>[0]) => {
    onClose();
    router.push(to);
  };
  const targetOf = (id: MissionId): (() => void) | undefined => {
    if (id === 'workout') return () => go('/(tabs)/workout');
    if (MISSION_COOKBOOK[id]) return () => go('/journal');
    return undefined;
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={g('missions.title')} testID="missions-sheet">
      <View style={styles.chips}>
        <View style={[styles.count, { backgroundColor: 'rgba(139,255,107,0.14)' }]}>
          <HudText size={12} color={quest.xp}>
            {g('camp.countDone', { n: counts.done })}
          </HudText>
        </View>
        <View style={[styles.count, { backgroundColor: quest.manaPanel }]}>
          <HudText size={12} color={quest.manaText}>
            {g('camp.countHolding', { n: counts.holding })}
          </HudText>
        </View>
        <View style={[styles.count, { backgroundColor: quest.raised2 }]}>
          <HudText size={12} color={quest.textTertiary}>
            {g('camp.countOpen', { n: counts.open })}
          </HudText>
        </View>
      </View>
      <View style={styles.list}>
        {day.missions.map((m) => {
          const copy = describeMission(m, day, g);
          const cook = MISSION_COOKBOOK[m.id];
          return (
            <View key={m.id}>
              <MissionRow
                title={copy.title}
                subtitle={copy.subtitle}
                statusLabel={copy.statusLabel}
                status={m.status}
                xp={MISSION_XP[m.id]} // the reward on offer; the row styles itself as earned once done
                progress={copy.progress}
                onPress={targetOf(m.id)}
              />
              {cook && (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={g(cook.label)}
                  onPress={() => go({ pathname: '/cookbook', params: { quick: cook.quick } })}
                  hitSlop={4}
                  style={styles.cookLink}
                >
                  <HudText size={12} weight="medium" color={quest.manaText}>
                    {g(cook.label)}
                  </HudText>
                  <QuestIcon name="chevron" size={12} color={quest.manaText} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
      <View style={[styles.perfect, day.perfect && { borderColor: quest.gold }]}>
        <HudText size={13} weight="medium" color={day.perfect ? quest.gold : quest.textTertiary} style={styles.flex}>
          {day.perfect ? g('missions.perfectDone', { n: PERFECT_DAY_BONUS_XP }) : g('missions.perfect', { n: PERFECT_DAY_BONUS_XP })}
        </HudText>
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.note}>
        {g('missions.estimateNote')}
      </HudText>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  ringsWrap: { marginTop: 20, gap: 10 },
  ringsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rings: { flexDirection: 'row', justifyContent: 'space-between' },
  ringCell: { alignItems: 'center', gap: 4, minWidth: 44 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  count: { paddingHorizontal: 10, minHeight: 26, borderRadius: 13, justifyContent: 'center' },
  list: { gap: 8 },
  cookLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2, minHeight: 44, paddingHorizontal: 4 },
  perfect: { marginTop: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, flexDirection: 'row' },
  note: { marginTop: 10 },
});

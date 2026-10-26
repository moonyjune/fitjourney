import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { STATUS_ORDER, type ClientStatus } from '../../ai/coachDigest';
import { aiFlags } from '../../ai/featureFlags';
import { useCoachDigest } from '../../ai/useCoachDigest';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { useGameText, type GameKey } from '../../game/strings';
import { useAiDigestStore } from '../../store/useAiDigestStore';
import { quest, questRadius } from '../../theme/quest';
import { weekStartKey } from '../../utils/weekKey';
import type { CoachClientSummary } from '../../types';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

const STATUS_KEY: Record<ClientStatus, GameKey> = {
  nudge: 'digest.status.nudge',
  no_data: 'digest.status.no_data',
  watch: 'digest.status.watch',
  good: 'digest.status.good',
};
const STATUS_COLOR: Record<ClientStatus, string> = { nudge: quest.hpText, no_data: quest.goldLight, watch: quest.goldLight, good: quest.xp };

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Coach > Clients: this week's digest, one short paragraph per client, the ones to reach out to first. Statuses are worked out on
 *  the device; the AI writes the summary and a message the coach could send. */
export function CoachDigestCard({ clients }: { clients: CoachClientSummary[] }) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const { run, busy, failure, last } = useCoachDigest(clients);
  const period = weekStartKey(new Date());
  const entries = useAiDigestStore((s) => s.weeks[period]);

  const rows = useMemo(() => {
    const list = clients
      .map((c) => ({ client: c, entry: entries?.[c.id] }))
      .filter((r): r is { client: CoachClientSummary; entry: NonNullable<typeof r.entry> } => !!r.entry);
    return list.sort((a, b) => STATUS_ORDER.indexOf(a.entry.status) - STATUS_ORDER.indexOf(b.entry.status));
  }, [clients, entries]);

  if (!aiFlags.aiForCoach || clients.length === 0) return null;

  return (
    <View style={styles.card} accessibilityLabel={g('digest.title')}>
      <HudText size={15}>{g('digest.title')}</HudText>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('digest.hint')}
      </HudText>
      <QuestButton
        variant="ghost"
        icon="chart"
        title={busy ? g('digest.running') : rows.length > 0 ? g('digest.refresh') : g('digest.run')}
        onPress={() => {
          void run();
        }}
        loading={busy}
      />
      {failure && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {aiErrorText(failure)}
        </HudText>
      )}
      {last && last.unreadable > 0 && (
        <HudText size={12} weight="medium" color={quest.goldLight}>
          {g('digest.unreadable', { n: last.unreadable })}
        </HudText>
      )}
      {rows.map(({ client, entry }) => (
        <View key={client.id} style={styles.row} accessible accessibilityLabel={`${client.displayName ?? client.email ?? ''}. ${g(STATUS_KEY[entry.status])}`}>
          <View style={styles.rowHead}>
            <HudText size={13} numberOfLines={1} style={styles.flex}>
              {client.displayName ?? client.email ?? g('digest.unnamed')}
            </HudText>
            <HudText size={11} color={STATUS_COLOR[entry.status]}>
              {g(STATUS_KEY[entry.status])}
            </HudText>
          </View>
          {entry.status === 'no_data' ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('digest.noData')}
            </HudText>
          ) : entry.summary ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {entry.summary}
            </HudText>
          ) : (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('digest.noSummary')}
            </HudText>
          )}
          {entry.nudge ? (
            <View style={styles.nudge}>
              <HudText size={11} color={quest.manaText}>
                {g('digest.nudge')}
              </HudText>
              <HudText size={12} weight="medium" color={quest.text} selectable>
                {entry.nudge}
              </HudText>
            </View>
          ) : null}
          <HudText size={10} weight="medium" color={quest.textSecondary}>
            {g('digest.stamp', { at: stamp(entry.generatedAtISO) })}
          </HudText>
        </View>
      ))}
      {rows.length > 0 && (
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('ai.advice.disclaimer')}
        </HudText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  row: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  nudge: { gap: 2, padding: 8, borderRadius: questRadius.row, backgroundColor: quest.bg },
});

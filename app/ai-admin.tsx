import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayKey } from '../supabase/functions/_shared/usage';
import { useIsAiAdmin } from '../src/ai/useIsAiAdmin';
import { AiModelCard } from '../src/components/quest/AiModelCard';
import { AiUsageCard, tokensText, usdText } from '../src/components/quest/AiUsageCard';
import { HudText } from '../src/components/quest/HudText';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { useGameText } from '../src/game/strings';
import { fetchAiAdminByDay, fetchAiAdminByDayModel, fetchAiAdminByUser, type AiDayModelTotal, type AiDayTotal, type AiUserTotal } from '../src/sync/cloudSync';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

const DAYS = 14;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

/** Calls, tokens and cost of several rows added up per model, the most expensive model first. */
function totalsByModel(rows: AiDayModelTotal[]): { model: string; calls: number; tokens: number; cost: number }[] {
  const byModel = new Map<string, { model: string; calls: number; tokens: number; cost: number }>();
  for (const r of rows) {
    const t = byModel.get(r.model) ?? { model: r.model, calls: 0, tokens: 0, cost: 0 };
    byModel.set(r.model, { model: r.model, calls: t.calls + r.calls, tokens: t.tokens + r.tokensIn + r.tokensOut, cost: t.cost + r.costUsd });
  }
  return [...byModel.values()].sort((a, b) => b.cost - a.cost);
}

/** Profile > AI & cost. Only for the accounts on the server's `ai_admins` list: this account's use today, then the whole
 *  app's calls / tokens / estimated cost per day (split by model) and, for a tapped day, per user. Every cost shown is the one
 *  recorded when the call was made, with that call's model and price: choosing another model only changes later calls. */
export default function AiAdminScreen() {
  const g = useGameText();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const admin = useIsAiAdmin();
  const today = dayKey();
  const [days, setDays] = useState<AiDayTotal[] | null | undefined>(undefined);
  const [selected, setSelected] = useState<string>(today);
  const [users, setUsers] = useState<AiUserTotal[] | null | undefined>(undefined);
  // Null when the per-model figures cannot be read (e.g. the new SQL has not been run): the day rows are then shown without the split.
  const [models, setModels] = useState<AiDayModelTotal[] | null>(null);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    fetchAiAdminByDay(today, DAYS).then((r) => !cancelled && setDays(r));
    fetchAiAdminByDayModel(today, DAYS).then((r) => !cancelled && setModels(r));
    return () => {
      cancelled = true;
    };
  }, [admin, today]);

  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    setUsers(undefined);
    fetchAiAdminByUser(selected).then((r) => !cancelled && setUsers(r));
    return () => {
      cancelled = true;
    };
  }, [admin, selected]);

  if (!admin) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
          <QuestHeader title={g('aiAdmin.title')} onBack={goBack} backLabel={g('common.back')} />
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.gap}>
            {g('aiAdmin.denied')}
          </HudText>
        </ScrollView>
      </View>
    );
  }

  const total = (days ?? []).reduce((t, d) => ({ calls: t.calls + d.calls, tokens: t.tokens + d.tokensIn + d.tokensOut, cost: t.cost + d.costUsd }), { calls: 0, tokens: 0, cost: 0 });
  const modelTotals = models ? totalsByModel(models) : [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={g('aiAdmin.title')} onBack={goBack} backLabel={g('common.back')} />

        <View style={styles.gap}>
          <AiUsageCard />
        </View>

        <View style={styles.gap}>
          <AiModelCard usage={days} />
        </View>

        <HudText size={17} accessibilityRole="header" style={styles.gap}>
          {g('aiAdmin.byDay', { n: DAYS })}
        </HudText>
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('aiAdmin.recordedCost')}
        </HudText>
        {days === undefined ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('aiAdmin.loading')}
          </HudText>
        ) : days === null ? (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
            {g('aiAdmin.error')}
          </HudText>
        ) : days.length === 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('aiAdmin.empty')}
          </HudText>
        ) : (
          <>
            <HudText size={13} color={quest.manaText}>
              {g('aiAdmin.sum', { calls: total.calls, tokens: tokensText(total.tokens), usd: usdText(total.cost) })}
            </HudText>
            {modelTotals.map((m) => (
              <HudText key={m.model} size={12} weight="medium" color={quest.manaText}>
                {g('aiAdmin.modelRow', { model: m.model, calls: m.calls, tokens: tokensText(m.tokens), usd: usdText(m.cost) })}
              </HudText>
            ))}
            {days.map((d) => {
              const dayModels = (models ?? []).filter((m) => m.day === d.day);
              return (
              <Pressable
                key={d.day}
                accessibilityRole="button"
                accessibilityLabel={`${d.day}. ${g('aiAdmin.dayRow', { users: d.users, calls: d.calls, tokens: tokensText(d.tokensIn + d.tokensOut), usd: usdText(d.costUsd) })}`}
                accessibilityState={{ selected: selected === d.day }}
                onPress={() => setSelected(d.day)}
                style={[styles.row, selected === d.day && styles.rowSelected]}
              >
                <HudText size={13}>{d.day}</HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('aiAdmin.dayRow', { users: d.users, calls: d.calls, tokens: tokensText(d.tokensIn + d.tokensOut), usd: usdText(d.costUsd) })}
                </HudText>
                {dayModels.map((m) => (
                  <HudText key={m.model} size={11} weight="medium" color={quest.manaText}>
                    {g('aiAdmin.modelRow', { model: m.model, calls: m.calls, tokens: tokensText(m.tokensIn + m.tokensOut), usd: usdText(m.costUsd) })}
                  </HudText>
                ))}
              </Pressable>
              );
            })}
          </>
        )}

        <HudText size={17} accessibilityRole="header" style={styles.gap}>
          {g('aiAdmin.byUser', { day: selected })}
        </HudText>
        {users === undefined ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('aiAdmin.loading')}
          </HudText>
        ) : users === null ? (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
            {g('aiAdmin.error')}
          </HudText>
        ) : users.length === 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('aiAdmin.empty')}
          </HudText>
        ) : (
          users.map((u) => (
            <View key={u.userId} style={styles.row} accessible accessibilityLabel={`${u.email ?? u.userId}`}>
              <HudText size={13} numberOfLines={1}>
                {u.email ?? u.userId.slice(0, 8)}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('aiAdmin.userRow', { calls: u.calls, tokens: tokensText(u.tokensIn + u.tokensOut), usd: usdText(u.costUsd) })}
              </HudText>
            </View>
          ))
        )}

        <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.gap}>
          {g('aiUsage.note')}
        </HudText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  gap: { marginTop: 16, marginBottom: 6 },
  row: { gap: 2, padding: 12, marginTop: 6, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  rowSelected: { borderColor: quest.gold },
});

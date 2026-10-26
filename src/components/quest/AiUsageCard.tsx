import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DAILY_QUOTA, dayKey, type AiFeature } from '../../../supabase/functions/_shared/usage';
import { useGameText, type GameKey } from '../../game/strings';
import { fetchAiUsageToday, type AiUsageRow } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

const FEATURE_LABEL: Record<AiFeature, GameKey> = {
  photo: 'aiUsage.photo',
  text: 'aiUsage.text',
  label: 'aiUsage.label',
  recipe: 'aiUsage.recipe',
  report: 'aiUsage.report',
  swap: 'aiUsage.swap',
  dinner: 'aiUsage.dinner',
  digest: 'aiUsage.digest',
};

/** Tokens as "950" or "12.4k". */
export function tokensText(n: number): string {
  return n >= 1000 ? `${(Math.round(n / 100) / 10).toFixed(1)}k` : String(Math.round(n));
}

/** Dollars with 2 decimals, or 3 under a cent so a tiny cost does not show as $0.00. */
export function usdText(n: number): string {
  return `$${n > 0 && n < 0.01 ? n.toFixed(3) : n.toFixed(2)}`;
}

/** "AI today": the signed-in account's own calls, tokens and estimated cost per feature, against the daily quota. */
export function AiUsageCard() {
  const g = useGameText();
  const [rows, setRows] = useState<AiUsageRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAiUsageToday(dayKey()).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) return null; // unreadable (offline, dev account): show nothing rather than zeros
  const byFeature = new Map(rows.map((r) => [r.feature, r]));
  const used = (Object.keys(DAILY_QUOTA) as AiFeature[]).filter((f) => (byFeature.get(f)?.calls ?? 0) > 0);
  const total = rows.reduce((t, r) => ({ calls: t.calls + r.calls, tokens: t.tokens + r.tokensIn + r.tokensOut, cost: t.cost + r.costUsd }), { calls: 0, tokens: 0, cost: 0 });

  return (
    <View style={styles.card} accessible accessibilityLabel={g('aiUsage.title')}>
      <HudText size={15}>{g('aiUsage.title')}</HudText>
      {used.length === 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('aiUsage.none')}
        </HudText>
      ) : (
        used.map((f) => {
          const r = byFeature.get(f)!;
          return (
            <HudText key={f} size={12} weight="medium" color={quest.textSecondary}>
              {`${g(FEATURE_LABEL[f])}: ${r.calls}/${DAILY_QUOTA[f]} · ${tokensText(r.tokensIn + r.tokensOut)} token · ${usdText(r.costUsd)}`}
            </HudText>
          );
        })
      )}
      {total.calls > 0 && (
        <HudText size={13} color={quest.manaText}>
          {g('aiUsage.total', { calls: total.calls, tokens: tokensText(total.tokens), usd: usdText(total.cost) })}
        </HudText>
      )}
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {g('aiUsage.note')}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
});

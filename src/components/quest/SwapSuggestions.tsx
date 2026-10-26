import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildTasteProfile } from '../../ai/tasteProfile';
import { useAiErrorText } from '../../ai/usePhotoAnalysis';
import { cleanAiSwaps, MIN_DB_SWAPS, swapsFromFoods, type SwapContext, type SwapItem, type SwapNutrient, type SwapOption } from '../../food/swaps';
import { useGameText, type GameKey } from '../../game/strings';
import { useAllFoods } from '../../store/useFoodDbStore';
import { requestSwaps, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

interface Props {
  item: SwapItem;
  context: SwapContext;
  limits: { purine: number; salt: number; sugar: number };
  mealTime: string | null;
  disabled?: boolean;
  /** The user picked a swap: the form takes its name and figures (nothing is saved here). */
  onUse: (option: SwapOption) => void;
}

const WHAT: Record<SwapNutrient, GameKey> = { purine: 'swap.n.purine', salt: 'swap.n.salt', sugar: 'swap.n.sugar' };

/** "This food breaks a limit: here is what to eat instead". Swaps come from the user's own food database first (no AI); the AI
 *  is asked only when that finds too few, and every AI swap is re-checked with the same rules before it is shown. */
export function SwapSuggestions({ item, context, limits, mealTime, disabled, onUse }: Props) {
  const g = useGameText();
  const aiErrorText = useAiErrorText();
  const foods = useAllFoods();
  const signature = `${item.name}|${item.calories}|${item.proteinG}|${item.purineMg}|${item.saltG}|${item.sugarG}|${context.exceeded.join()}|${Object.values(context.headroom).join()}`;
  const dbOptions = useMemo(() => swapsFromFoods(item, context, foods), [signature, foods]); // eslint-disable-line react-hooks/exhaustive-deps
  const [aiOptions, setAiOptions] = useState<SwapOption[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AiErrorKind | null>(null);

  // A different item or different room left makes earlier AI answers stale.
  useEffect(() => {
    setAiOptions([]);
    setAsked(false);
    setFailure(null);
  }, [signature]);

  async function askAi() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const outcome = await requestSwaps({ item, context, limits, mealTime, favorites: buildTasteProfile().favorites });
    setBusy(false);
    if (!outcome.ok) {
      setFailure(outcome.kind);
      return;
    }
    const have = new Set(dbOptions.map((o) => o.name));
    setAiOptions(cleanAiSwaps(outcome.result, item, context).filter((o) => !have.has(o.name)));
    setAsked(true);
  }

  const what = context.exceeded.map((n) => g(WHAT[n])).join(', ');
  const options = [...dbOptions, ...aiOptions];
  const canAsk = dbOptions.length < MIN_DB_SWAPS && !asked;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <HudText size={13} color={quest.manaText}>
        {g('swap.title', { what })}
      </HudText>
      {options.map((o) => (
        <View key={`${o.source}-${o.name}`} style={styles.option}>
          <HudText size={13}>{o.name}</HudText>
          <HudText size={11} color={o.source === 'db' ? quest.manaText : quest.goldLight}>
            {o.source === 'db' ? g('swap.fromDb') : g('swap.fromAi')}
            {o.source === 'ai' && o.accuracy !== undefined ? ` · ${g('ai.accuracy', { pct: o.accuracy })}` : ''}
          </HudText>
          {o.amount ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('swap.amount', { amount: o.amount })}
            </HudText>
          ) : null}
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('swap.figures', { kcal: o.calories, p: o.proteinG, purine: o.purineMg, salt: o.saltG, sugar: o.sugarG })}
          </HudText>
          {o.reductions.length > 0 && (
            <HudText size={12} weight="medium" color={quest.xp}>
              {o.reductions.map((r) => g('swap.reduce', { what: g(WHAT[r.nutrient]), pct: r.pct })).join(' · ')}
            </HudText>
          )}
          {o.how ? (
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {o.how}
            </HudText>
          ) : null}
          <QuestButton variant="mana" title={g('swap.use')} accessibilityLabel={g('swap.useLabel', { name: o.name })} onPress={() => onUse(o)} disabled={disabled} />
        </View>
      ))}
      {options.length === 0 && !canAsk && (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('swap.none')}
        </HudText>
      )}
      {canAsk && (
        <QuestButton variant="ghost" icon="chart" title={busy ? g('swap.asking') : g('swap.askAi')} onPress={() => { void askAi(); }} loading={busy} disabled={disabled} />
      )}
      {failure && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
          {aiErrorText(failure)}
        </HudText>
      )}
      {options.some((o) => o.source === 'ai') && (
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('swap.disclaimer')}
        </HudText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  option: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
});

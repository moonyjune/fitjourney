import { StyleSheet, View } from 'react-native';
import { cheatDayPlan, cheatMealKcal, CHEAT_MEAL_BUFFER, RECOVERY_MAX_PER_DAY } from '../../game/cheatPlan';
import { bossClock } from '../../game/boss';
import { useGameText } from '../../game/strings';
import { useGameState, useTdeeKcal } from '../../game/useGameState';
import { useCheatDayStore } from '../../store/useCheatDayStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { quest, questRadius } from '../../theme/quest';
import { weekStartKey } from '../../utils/weekKey';
import { HudText } from './HudText';
import { QuestChip } from './QuestChip';

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const factor = String(CHEAT_MEAL_BUFFER).replace('.', ',');

/** The weekly boss's line, only for a day of the boss's current week. */
function BossLine({ dateKey, now, hitKcal }: { dateKey: string; now: Date; hitKcal: number }) {
  const g = useGameText();
  const boss = useGameState(now).boss;
  if (weekStartKey(new Date(`${dateKey}T12:00:00`)) !== weekStartKey(bossClock(now))) return null;
  return (
    <HudText size={12} weight="medium" color={quest.textSecondary}>
      {boss.defeated ? g('cheatX.bossDown') : g('cheatX.boss2', { hp: n(boss.hpLeft), need: n(boss.neededPerRemainingDay), deficit: n(hitKcal) })}
    </HudText>
  );
}

/** "Cheat" in Ghi bữa (1.5): marks the meal as a cheat meal (its kcal saved ×1.3) and / or the day as a cheat day (the existing mark,
 *  the same as in the Journal), each with how to count the kcal, worked out with the player's own TDEE, deficit target, what was eaten
 *  that day (this meal included) and the weekly boss (src/game/cheatPlan.ts). */
export function CheatGuide({
  dateKey,
  now,
  mealKcal,
  eatenKcal,
  cheatMeal,
  onCheatMeal,
}: {
  dateKey: string;
  now: Date;
  /** The meal's kcal before the buffer. */
  mealKcal: number;
  /** The day's kcal with this meal (buffered when it is a cheat meal). */
  eatenKcal: number;
  cheatMeal: boolean;
  onCheatMeal: (on: boolean) => void;
}) {
  const g = useGameText();
  const tdeeKcal = useTdeeKcal();
  const targetDeficitKcal = useSettingsStore((s) => s.targetDailyDeficitKcal);
  const cheatDay = useCheatDayStore((s) => s.days.includes(dateKey));
  const toggleDay = useCheatDayStore((s) => s.toggle);
  const meal = cheatMealKcal(mealKcal);
  const plan = cheatDayPlan({ tdeeKcal, targetDeficitKcal, eatenKcal });
  const r = plan.recovery;

  return (
    <View style={styles.wrap}>
      <View style={styles.box} testID="cheat-meal-guide">
        <HudText size={15}>{g('cheatX.mealTitle')}</HudText>
        <QuestChip label={cheatMeal ? g('cheatX.mealOn') : g('cheatX.mealOff')} selected={cheatMeal} onPress={() => onCheatMeal(!cheatMeal)} />
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheatX.mealRule', { f: factor })}
        </HudText>
        {meal.base > 0 && (
          <HudText size={13} color={quest.goldLight}>
            {g('cheatX.mealCalc', { base: n(meal.base), f: factor, total: n(meal.buffered), extra: n(meal.extra) })}
          </HudText>
        )}
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheatX.mealDrinks')}
        </HudText>
      </View>

      <View style={styles.box} testID="cheat-day-guide">
        <HudText size={15}>{g('cheatX.dayTitle')}</HudText>
        <QuestChip label={cheatDay ? g('cheatX.dayOn') : g('cheatX.dayOff')} selected={cheatDay} onPress={() => toggleDay(dateKey)} />
        <HudText size={13} color={quest.goldLight}>
          {g('cheatX.dayBudget', { tdee: n(plan.tdeeKcal), deficit: n(plan.targetDeficitKcal), normal: n(plan.normalBudgetKcal) })}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {plan.overKcal > 0
            ? g('cheatX.dayOver', { eaten: n(plan.eatenKcal), over: n(plan.overKcal), fat: n(plan.overFatG) })
            : g('cheatX.dayLeft', { eaten: n(plan.eatenKcal), left: n(plan.leftKcal) })}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheatX.bossHit', { deficit: n(plan.bossHitKcal), pct: plan.bossHitPct })}
        </HudText>
        {plan.overKcal > 0 && (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cheatX.overRisk', { over: n(plan.overKcal), fat: n(plan.overFatG) })}
          </HudText>
        )}
        <BossLine dateKey={dateKey} now={now} hitKcal={plan.bossHitKcal} />
        {r.days > 0 && (
          <HudText size={12} weight="medium" color={quest.text}>
            {g('cheatX.recovery2', { days: r.days, per: n(r.perDayKcal), budget: n(r.dayBudgetKcal), max: RECOVERY_MAX_PER_DAY })}
          </HudText>
        )}
        {r.leftKcal > 0 && (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cheatX.recoveryLeft2', { left: n(r.leftKcal) })}
          </HudText>
        )}
        <HudText size={11} weight="medium" color={quest.textTertiary}>
          {g('cheatX.dayRules2', { deficit: n(plan.bossHitKcal) })}
        </HudText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingBottom: 8 },
  box: { gap: 8, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
});

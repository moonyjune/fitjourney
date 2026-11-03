import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { QuestPlanPreview } from '../src/components/quest/QuestPlanPreview';
import { QuestShoppingList } from '../src/components/quest/QuestShoppingList';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { SettingsGroupTitle } from '../src/components/quest/SettingsRows';
import { CARB_SWAP_OPTIONS, PROTEIN_SWAP_OPTIONS } from '../src/constants/plan';
import { useGameText } from '../src/game/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { usePlanStore } from '../src/store/usePlanStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { toDateKey } from '../src/utils/date';
import { useWaterPlan } from '../src/water/useWaterPlan';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/plan');
}

/** Mục tiêu & kế hoạch › Thực đơn & lịch tập (dialogs 34): the plan in force (meals, times, dishes, workouts, today's water), the
 *  swaps that keep kcal and protein, and the shopping list. The AI assistant that edits the plan stays on the plan page. */
export default function PlanMenuScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  useLightStatusBar();
  const plan = usePlanStore((s) => s.plan);
  const todayWater = useWaterPlan(toDateKey(new Date()));

  return (
    <ScreenTemplate title={g('rd6.plan.menu')} eyebrow={g('rd6.set.goals')} onBack={goBack}>
      <SettingsGroupTitle>{t('plan.currentPlanTitle')}</SettingsGroupTitle>
      <QuestPlanPreview plan={plan} hideShoppingList waterSchedule={todayWater.schedule} />

      <SettingsGroupTitle>{t('plan.swapTitle')}</SettingsGroupTitle>
      <View style={styles.card}>
        <HudText size={14}>{t('plan.swapCarbGroup')}</HudText>
        {CARB_SWAP_OPTIONS.map((item) => (
          <HudText key={item} size={13} weight="medium" color={quest.textTertiary}>
            • {item}
          </HudText>
        ))}
        <HudText size={14} style={styles.group}>
          {t('plan.swapProteinGroup')}
        </HudText>
        {PROTEIN_SWAP_OPTIONS.map((item) => (
          <HudText key={item} size={13} weight="medium" color={quest.textTertiary}>
            • {item}
          </HudText>
        ))}
      </View>

      <SettingsGroupTitle>{g('rd6.plan.shopping')}</SettingsGroupTitle>
      <QuestShoppingList plan={plan} />
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  group: { marginTop: 8 },
});

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { DateChip } from '../src/components/quest/DateChip';
import { EatAgainRow } from '../src/components/quest/EatAgainRow';
import { HudText } from '../src/components/quest/HudText';
import { QuestIcon, type QuestIconName } from '../src/components/quest/QuestIcon';
import { QuestSheet } from '../src/components/quest/QuestSheet';
import { SavedFoodsSheet } from '../src/components/quest/SavedFoodsSheet';
import { changeWater, WaterAmountSheet } from '../src/components/quest/WaterAmountSheet';
import { WeightSheet } from '../src/components/quest/WeightSheet';
import { WATER_QUICK_ADD_ML } from '../src/constants/plan';
import type { RecentDish } from '../src/food/eatAgain';
import { setPendingMealPhoto } from '../src/food/pendingPhoto';
import { useGameText } from '../src/game/strings';
import { useNow } from '../src/game/useGameState';
import { useAiPhotoStore } from '../src/store/useAiPhotoStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useSelectedDayStore, workingDayKey } from '../src/store/useSelectedDayStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { ExtraMealTime } from '../src/types';
import { toDateKey } from '../src/utils/date';
import { pickPhoto } from '../src/utils/pickPhoto';
import { useWaterPlan } from '../src/water/useWaterPlan';

/** The two water chips of the sheet (README §3.2); other amounts with a long press. */
const WATER_CHIPS_ML = WATER_QUICK_ADD_ML.slice(0, 2);

function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

const litres = (ml: number) => (ml / 1000).toFixed(1);

interface SmallChipProps {
  icon: QuestIconName;
  tint: string;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}

function SmallChip({ icon, tint, label, accessibilityLabel, onPress }: SmallChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.smallChip, pressed && styles.pressed]}
    >
      <QuestIcon name={icon} size={18} color={tint} strokeWidth={2.2} />
      <HudText size={14} numberOfLines={1}>
        {label}
      </HudText>
    </Pressable>
  );
}

type Sheet = 'water' | 'weight' | 'saved' | null;

/** "Ghi nhanh" (+) (Design/uiux-proposal/html/02-quickadd-after.html): the date chip, "Chụp món ăn" first (the camera opens at once,
 *  then the photo goes to the AI in Add food), "Nói / gõ món" and "Món đã lưu", "Ăn lại" (1 tap logs a recent dish, with undo), water
 *  (+250 / +500, long press for another amount or to fix the total), and small chips for weight, feeling and another workout.
 *  Everything is logged on the shared selected day (README §2.1). */
export default function QuickAddScreen() {
  const g = useGameText();
  useLightStatusBar();
  const now = useNow();
  const todayKey = toDateKey(now);
  const selectedKey = useSelectedDayStore((s) => s.selectedKey);
  const dateKey = workingDayKey(selectedKey, now);
  const isToday = dateKey === todayKey;
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);
  const water = useWaterPlan(dateKey);
  const waterMl = useNutritionStore((s) => s.logs[dateKey]?.waterMl ?? 0);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const latest = useWeightStore((s) => s.latest());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [photoError, setPhotoError] = useState<'denied' | 'failed' | null>(null);

  /** Route params that carry the picked day; none for today, so the screens keep their usual "today" behaviour. */
  const dateParams: Record<string, string> = isToday ? {} : { date: dateKey };

  // Called straight from the tap: on web the file input (capture="environment") only opens from a user gesture (Expo SDK 57 docs).
  async function takePhoto(source: 'camera' | 'library') {
    setPhotoError(null);
    const picked = await pickPhoto(source);
    if (!picked) return;
    if ('error' in picked) {
      setPhotoError(picked.error === 'failed' ? 'failed' : 'denied');
      return;
    }
    setPendingMealPhoto(picked.uri);
    router.replace({ pathname: '/add-food', params: { ...dateParams, photo: '1' } });
  }

  function addWater(ml: number) {
    changeWater(dateKey, ml, {
      added: (n, total) => g('quick.waterAdded', { ml: n, total }),
      removed: (n, total) => g('quick.waterRemoved', { ml: n, total }),
    });
  }

  function editPortion(dish: RecentDish, mealTime: ExtraMealTime | null) {
    const params: Record<string, string> = { ...dateParams, name: dish.name, calories: String(dish.calories), protein: String(dish.proteinG) };
    if (dish.purineMg) params.purine = String(dish.purineMg);
    if (dish.saltG) params.salt = String(dish.saltG);
    if (dish.sugarG) params.sugar = String(dish.sugarG);
    if (mealTime) params.mealTime = mealTime;
    router.replace({ pathname: '/add-food', params });
  }

  const lastKg = (latest?.weightKg ?? startWeightKg).toFixed(1);
  const pct = water.targetMl > 0 ? Math.min(100, (waterMl / water.targetMl) * 100) : 0;
  const fmt = (ml: number) => ml.toLocaleString('en-US');

  return (
    <QuestSheet onClose={closeSheet} closeLabel={g('common.close')}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <HudText size={22} accessibilityRole="header" style={styles.flex}>
            {g('quick.title')}
          </HudText>
          <DateChip hint={g('quick.dateHintAll')} />
          <Pressable accessibilityRole="button" accessibilityLabel={g('common.close')} onPress={closeSheet} style={styles.close}>
            <QuestIcon name="x" size={20} color={quest.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.photo}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${g('quick.photo')}. ${g(aiEnabled ? 'quick.photoHint' : 'quick.photoHintNoAi')}`}
            onPress={() => {
              void takePhoto('camera');
            }}
            style={({ pressed }) => [styles.photoMain, pressed && styles.pressed]}
          >
            <QuestIcon name="camera" size={32} color={quest.onGold} strokeWidth={2.2} />
            <View style={styles.flex}>
              <HudText size={18} color={quest.onGold}>
                {g('quick.photo')}
              </HudText>
              <HudText size={12} weight="medium" color={quest.onGold}>
                {g(aiEnabled ? 'quick.photoHint' : 'quick.photoHintNoAi')}
              </HudText>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('quick.photoLibrary')}
            onPress={() => {
              void takePhoto('library');
            }}
            style={({ pressed }) => [styles.photoLib, pressed && styles.pressed]}
          >
            <QuestIcon name="photos" size={22} color={quest.onGold} strokeWidth={2.2} />
          </Pressable>
        </View>
        {photoError ? (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" style={styles.error}>
            {g(photoError === 'denied' ? 'quick.photoDenied' : 'quick.photoFailed')}
          </HudText>
        ) : null}

        <View style={styles.pair}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('quick.typeMeal')}
            onPress={() => router.replace({ pathname: '/add-food', params: dateParams })}
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          >
            <QuestIcon name="mic" size={18} color={quest.gold} strokeWidth={2.2} />
            <HudText size={14}>{g('quick.typeMeal')}</HudText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('quick.savedFoods')}
            onPress={() => setSheet('saved')}
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          >
            <QuestIcon name="search" size={18} color={quest.gold} strokeWidth={2.2} />
            <HudText size={14}>{g('quick.savedFoods')}</HudText>
          </Pressable>
        </View>

        <EatAgainRow dateKey={dateKey} now={now} onEditPortion={editPortion} />

        <View style={styles.water}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('quick.waterOpenA11y', { cur: fmt(waterMl), target: fmt(water.targetMl) })}
            onPress={() => setSheet('water')}
            style={styles.waterInfo}
          >
            <QuestIcon name="drop" size={24} color={quest.mana} strokeWidth={2.2} />
            <View style={styles.flex}>
              <HudText size={15}>{g('quick.waterLitres', { cur: litres(waterMl), target: litres(water.targetMl) })}</HudText>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
            </View>
          </Pressable>
          {WATER_CHIPS_ML.map((ml) => (
            <Pressable
              key={ml}
              accessibilityRole="button"
              accessibilityLabel={g('quick.waterAdd', { ml })}
              accessibilityHint={g('quick.waterChipHint')}
              accessibilityActions={[{ name: 'longpress', label: g('quick.waterChipHint') }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'longpress') setSheet('water');
              }}
              onPress={() => addWater(ml)}
              onLongPress={() => setSheet('water')}
              delayLongPress={450}
              style={({ pressed }) => [styles.waterChip, pressed && styles.pressed]}
            >
              <HudText size={15} color={quest.manaText}>{`+${ml}`}</HudText>
            </Pressable>
          ))}
        </View>

        <View style={styles.smallRow}>
          <SmallChip icon="scale" tint={quest.textSecondary} label={`${lastKg} kg`} accessibilityLabel={g('quick.weightChipA11y', { kg: lastKg })} onPress={() => setSheet('weight')} />
          <SmallChip icon="smile" tint={quest.gold} label={g('quick.tileCheckin')} onPress={() => router.replace('/checkin')} />
          <SmallChip icon="dumbbell" tint={quest.xp} label={g('quick.otherWorkout')} onPress={() => router.replace('/workout-classic')} />
        </View>
      </ScrollView>

      <WaterAmountSheet visible={sheet === 'water'} onClose={() => setSheet(null)} dateKey={dateKey} now={now} />
      <WeightSheet
        visible={sheet === 'weight'}
        onClose={() => setSheet(null)}
        dateKey={dateKey}
        now={now}
        onOpenHistory={() => {
          setSheet(null);
          router.replace('/weight');
        }}
      />
      <SavedFoodsSheet
        visible={sheet === 'saved'}
        onClose={() => setSheet(null)}
        onUse={(r) => {
          setSheet(null);
          router.replace({
            pathname: '/add-food',
            params: {
              ...dateParams,
              name: r.name,
              calories: String(r.calories),
              protein: String(r.proteinG),
              purine: String(r.purineMg),
              salt: String(r.saltG),
              sugar: String(r.sugarG),
              from: 'db',
            },
          });
        }}
        onOpenDb={() => {
          setSheet(null);
          router.replace('/food-db');
        }}
        onOpenCookbook={() => {
          setSheet(null);
          router.replace('/cookbook');
        }}
      />
    </QuestSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 99,
    backgroundColor: quest.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { flexDirection: 'row', gap: 1, marginTop: 12, borderRadius: questRadius.panel, overflow: 'hidden', backgroundColor: '#B88A14' },
  photoMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72, backgroundColor: quest.gold },
  photoLib: { width: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.gold },
  error: { marginTop: 8 },
  pair: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ghost: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: questRadius.button,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    paddingHorizontal: 10,
  },
  water: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 10,
    borderRadius: questRadius.panel,
    borderWidth: 1.5,
    borderColor: quest.manaBorder,
    backgroundColor: quest.manaPanel,
  },
  waterInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  track: { height: 6, borderRadius: 3, backgroundColor: quest.bg, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, borderRadius: 3, backgroundColor: quest.mana },
  waterChip: {
    minWidth: 64,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.manaBorder,
    backgroundColor: quest.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  smallRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallChip: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.panel,
    paddingHorizontal: 8,
  },
  pressed: { opacity: 0.85 },
});

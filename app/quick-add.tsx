import { useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestIcon, type QuestIconName } from '../src/components/quest/QuestIcon';
import { QuestSheet } from '../src/components/quest/QuestSheet';
import { WATER_QUICK_ADD_ML, getDayType } from '../src/constants/plan';
import { MISSION_XP } from '../src/game/constants';
import { evaluateDay } from '../src/game/missions';
import { useGameText } from '../src/game/strings';
import { useNow, useTodayInput } from '../src/game/useGameState';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useWeightStore } from '../src/store/useWeightStore';
import { quest, questFonts, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

const MIN_KG = 20;
const MAX_KG = 300;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function parseKg(text: string): number | null {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value >= MIN_KG && value <= MAX_KG ? value : null;
}

function closeSheet() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

interface ActionTileProps {
  icon: QuestIconName;
  tint: string;
  title: string;
  hint: string;
  onPress: () => void;
}

function ActionTile({ icon, tint, title, hint, onPress }: ActionTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        <QuestIcon name={icon} size={22} color={quest.onGold} strokeWidth={2.2} />
      </View>
      <HudText size={14} style={styles.tileText}>
        {title}
      </HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.tileText}>
        {hint}
      </HudText>
    </Pressable>
  );
}

export default function QuickAddScreen() {
  const g = useGameText();
  useLightStatusBar();
  const now = useNow();
  const input = useTodayInput(now);
  const dateKey = input.dateKey;

  const goalWeightKg = useSettingsStore((s) => s.goalWeightKg);
  const waterTargetMl = useSettingsStore((s) => s.waterTargetMl);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const latest = useWeightStore((s) => s.latest());
  const addWeight = useWeightStore((s) => s.addEntry);
  const addWater = useNutritionStore((s) => s.addWater);

  const meals = input.mealTemplatesByDayType[getDayType(now)];
  const nextMeal = meals.find((m) => !input.log?.mealsEaten[m.slot]);
  const workout = useMemo(() => evaluateDay(input).missions.find((m) => m.id === 'workout'), [input]);
  const waterMl = input.log?.waterMl ?? 0;

  const currentKg = latest?.weightKg ?? startWeightKg;
  const [weightText, setWeightText] = useState(currentKg.toFixed(1));
  const [savedKg, setSavedKg] = useState<string | null>(null);
  const [weightError, setWeightError] = useState(false);
  const [lastWaterMl, setLastWaterMl] = useState<number | null>(null);

  function stepWeight(delta: number) {
    const base = parseKg(weightText) ?? currentKg;
    const next = Math.min(MAX_KG, Math.max(MIN_KG, Math.round((base + delta) * 10) / 10));
    setWeightText(next.toFixed(1));
    setSavedKg(null);
    setWeightError(false);
  }

  function saveWeight() {
    const kg = parseKg(weightText);
    if (kg == null) {
      setWeightError(true);
      return;
    }
    addWeight(kg);
    setWeightError(false);
    const label = kg.toFixed(1);
    setSavedKg(label);
    AccessibilityInfo.announceForAccessibility(g('quick.weightSaved', { kg: label }));
  }

  function addWaterMl(ml: number) {
    addWater(dateKey, ml);
    setLastWaterMl(ml);
  }

  const parsedKg = parseKg(weightText);
  const kgLeft = Math.max(0, (parsedKg ?? currentKg) - goalWeightKg);
  const mealTime = nextMeal ? `${pad(nextMeal.startHour)}:${pad(nextMeal.startMinute)}` : '';

  return (
    <QuestSheet onClose={closeSheet} closeLabel={g('common.close')}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <HudText size={26} accessibilityRole="header">
              {g('quick.title')}
            </HudText>
            <HudText size={13} weight="medium" color={quest.textSecondary}>
              {g('quick.subtitle')}
            </HudText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={g('common.close')} onPress={closeSheet} style={styles.close}>
            <QuestIcon name="x" size={20} color={quest.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.tiles}>
          <ActionTile
            icon="bowl"
            tint={quest.gold}
            title={g('quick.tileMeal')}
            hint={nextMeal ? g('quick.tileMealNext', { time: mealTime }) : g('quick.tileMealAllDone')}
            onPress={() => router.replace(`/meal/${(nextMeal ?? meals[meals.length - 1]).slot}`)}
          />
          <ActionTile
            icon="plus"
            tint={quest.mana}
            title={g('quick.tileExtra')}
            hint={g('quick.tileExtraHint')}
            onPress={() => router.replace('/add-food')}
          />
          <ActionTile
            icon="smile"
            tint={quest.gold}
            title={g('quick.tileCheckin')}
            hint={g('quick.tileCheckinHint')}
            onPress={() => router.replace('/checkin')}
          />
          <ActionTile
            icon="dumbbell"
            tint={quest.xp}
            title={g('quick.tileWorkout')}
            hint={workout?.status === 'done' ? g('quick.tileWorkoutDone') : g('quick.tileWorkoutXp', { xp: MISSION_XP.workout })}
            onPress={() => router.dismissTo('/(tabs)/workout')}
          />
        </View>

        <View style={styles.sectionHead}>
          <HudText size={15}>{g('quick.water')}</HudText>
          <HudText size={13} weight="medium" color={quest.manaText}>
            {g('quick.waterTotal', { cur: (waterMl / 1000).toFixed(1), target: (waterTargetMl / 1000).toFixed(1) })}
          </HudText>
        </View>
        <View style={styles.chipRow}>
          {WATER_QUICK_ADD_ML.map((ml) => (
            <View key={ml} style={styles.chipCell}>
              <QuestChip tone="mana" label={`+${ml} ml`} accessibilityLabel={g('quick.waterAdd', { ml })} onPress={() => addWaterMl(ml)} />
            </View>
          ))}
        </View>
        {lastWaterMl != null && (
          <HudText size={12} weight="medium" color={quest.manaText} accessibilityLiveRegion="polite" style={styles.feedback}>
            +{lastWaterMl} ml
          </HudText>
        )}

        <View style={styles.sectionHead}>
          <HudText size={15}>{g('quick.weight')}</HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('quick.weightLeft', { kg: kgLeft.toFixed(1), goal: goalWeightKg })}
          </HudText>
        </View>
        <View style={styles.stepper}>
          <Pressable accessibilityRole="button" accessibilityLabel={g('quick.weightDown')} onPress={() => stepWeight(-0.1)} style={styles.stepBtn}>
            <QuestIcon name="minus" size={20} color={quest.text} strokeWidth={2.6} />
          </Pressable>
          <TextInput
            accessibilityLabel={g('quick.weightField')}
            keyboardType="decimal-pad"
            value={weightText}
            onChangeText={(text) => {
              setWeightText(text);
              setSavedKg(null);
              setWeightError(false);
            }}
            style={[styles.weightInput, weightError && { borderColor: quest.gold }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={g('quick.weightUp')} onPress={() => stepWeight(0.1)} style={styles.stepBtn}>
            <QuestIcon name="plus" size={20} color={quest.text} strokeWidth={2.6} />
          </Pressable>
        </View>
        {weightError && (
          <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite" style={styles.feedback}>
            {g('quick.weightInvalid')}
          </HudText>
        )}
        {savedKg && (
          <HudText size={12} weight="medium" color={quest.xp} accessibilityLiveRegion="polite" style={styles.feedback}>
            {g('quick.weightSaved', { kg: savedKg })}
          </HudText>
        )}
        <View style={styles.cta}>
          <QuestButton title={g('quick.weightSave', { kg: (parsedKg ?? currentKg).toFixed(1) })} onPress={saveWeight} />
        </View>
      </ScrollView>
    </QuestSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleText: { flex: 1 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 99,
    backgroundColor: quest.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  tile: {
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 104,
    padding: 10,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileText: { textAlign: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20, marginBottom: 8, gap: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipCell: { flex: 1 },
  feedback: { marginTop: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 99,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightInput: {
    flex: 1,
    minWidth: 0, // lets the field shrink so the + button is never pushed off the row
    minHeight: 56,
    textAlign: 'center',
    fontSize: 30,
    fontFamily: questFonts.bold,
    color: quest.text,
    backgroundColor: quest.panel,
    borderRadius: questRadius.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  cta: { marginTop: 14 },
});

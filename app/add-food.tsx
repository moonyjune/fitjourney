import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../src/components/quest/HudText';
import { ImpactNote } from '../src/components/quest/ImpactNote';
import { NutrientTiles } from '../src/components/quest/NutrientTiles';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { logWithExtra, previewDayChange } from '../src/game/preview';
import { useGameText } from '../src/game/strings';
import { useNow, useTodayInput } from '../src/game/useGameState';
import type { StringKey } from '../src/i18n/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import type { ExtraFoodItem, ExtraMealTime } from '../src/types';

const MEAL_TIMES: ExtraMealTime[] = [
  'breakfast',
  'morning_snack',
  'lunch',
  'afternoon_snack',
  'late_afternoon_snack',
  'dinner',
  'evening_snack',
];

/** Non-negative number from a text field; empty or invalid input counts as 0. */
function num(text: string): number {
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function AddFoodScreen() {
  const g = useGameText();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const now = useNow();
  const input = useTodayInput(now);
  const addExtra = useNutritionStore((s) => s.addExtra);

  const [name, setName] = useState('');
  const [mealTime, setMealTime] = useState<ExtraMealTime | null>(null);
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [purine, setPurine] = useState('');
  const [salt, setSalt] = useState('');
  const [sugar, setSugar] = useState('');
  const [junk, setJunk] = useState(false);
  const [error, setError] = useState(false);

  const draft: ExtraFoodItem = useMemo(
    () => ({
      id: 'draft',
      name: name.trim(),
      calories: num(calories),
      proteinG: num(protein),
      mealTime,
      loggedAtISO: now.toISOString(),
      purineMg: num(purine) || undefined,
      saltG: num(salt) || undefined,
      sugarG: num(sugar) || undefined,
      junk: junk || undefined,
    }),
    [name, mealTime, calories, protein, purine, salt, sugar, junk, now]
  );

  // How the day's missions would change if this exact item were saved right now.
  const preview = useMemo(
    () => previewDayChange(input, logWithExtra(input.log, input.dateKey, draft)),
    [input, draft]
  );
  const hasValue = draft.calories > 0 || draft.proteinG > 0;

  function save() {
    if (!hasValue) {
      setError(true);
      return;
    }
    addExtra(input.dateKey, draft.name, draft.calories, draft.proteinG, mealTime, {
      purineMg: draft.purineMg,
      saltG: draft.saltG,
      sugarG: draft.sugarG,
      junk: draft.junk,
    });
    goBack();
  }

  const exceeded = {
    purine: preview.newlyMissed.includes('purine'),
    salt: preview.newlyMissed.includes('salt'),
    sugar: preview.newlyMissed.includes('sugar'),
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}
      >
        <QuestHeader title={g('food.title')} onBack={goBack} backLabel={g('common.back')} />
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.subtitle}>
          {g('food.subtitle')}
        </HudText>

        <View style={styles.form}>
          <QuestField label={g('food.name')} value={name} onChangeText={setName} placeholder={g('food.namePlaceholder')} />

          <View style={styles.group}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('food.mealTime')}
            </HudText>
            <View style={styles.chips}>
              {MEAL_TIMES.map((value) => (
                <QuestChip
                  key={value}
                  label={t(`extraMealTime.${value}` as StringKey)}
                  selected={mealTime === value}
                  onPress={() => setMealTime(mealTime === value ? null : value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <QuestField label={g('food.calories')} keyboardType="decimal-pad" value={calories} onChangeText={(v) => { setCalories(v); setError(false); }} />
            </View>
            <View style={styles.pairCell}>
              <QuestField label={g('food.protein')} keyboardType="decimal-pad" value={protein} onChangeText={(v) => { setProtein(v); setError(false); }} />
            </View>
          </View>
          {error && (
            <HudText size={12} weight="medium" color={quest.goldLight} accessibilityLiveRegion="polite">
              {g('food.errorValue')}
            </HudText>
          )}

          <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
            {g('food.optional').toUpperCase()}
          </HudText>
          <View style={styles.pair}>
            <View style={styles.pairCell}>
              <QuestField label={g('food.purine')} keyboardType="decimal-pad" value={purine} onChangeText={setPurine} />
            </View>
            <View style={styles.pairCell}>
              <QuestField label={g('food.salt')} keyboardType="decimal-pad" value={salt} onChangeText={setSalt} />
            </View>
            <View style={styles.pairCell}>
              <QuestField label={g('food.sugar')} keyboardType="decimal-pad" value={sugar} onChangeText={setSugar} />
            </View>
          </View>

          <View style={styles.junkRow}>
            <View style={styles.junkText}>
              <HudText size={14}>{g('food.junk')}</HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('food.junkHint')}
              </HudText>
            </View>
            <Switch
              accessibilityLabel={g('food.junk')}
              value={junk}
              onValueChange={setJunk}
              trackColor={{ false: quest.raised2, true: quest.gold }}
              thumbColor={quest.text}
            />
          </View>

          <View style={styles.group}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('food.impact').toUpperCase()}
            </HudText>
            <NutrientTiles
              nutrients={{ purineMg: draft.purineMg ?? 0, saltG: draft.saltG ?? 0, sugarG: draft.sugarG ?? 0 }}
              exceeded={exceeded}
            />
            <ImpactNote newlyDone={preview.newlyDone} newlyMissed={preview.newlyMissed} />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={screenMaxWidthStyle}>
          <QuestButton icon="plus" title={g('food.save')} onPress={save} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  subtitle: { marginTop: 10 },
  form: { marginTop: 16, gap: 14 },
  group: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pair: { flexDirection: 'row', gap: 10 },
  pairCell: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6, marginTop: 4 },
  junkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    padding: 12,
    borderRadius: questRadius.panel,
    backgroundColor: quest.panel,
    borderWidth: 1.5,
    borderColor: quest.border,
  },
  junkText: { flex: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: quest.bg, borderTopWidth: 1.5, borderTopColor: quest.border, alignItems: 'center' },
});

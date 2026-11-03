import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { eatAgainMealTime, recentDishes, type RecentDish } from '../../food/eatAgain';
import { useGameText } from '../../game/strings';
import { useTranslation } from '../../i18n/useTranslation';
import type { StringKey } from '../../i18n/strings';
import { useEatAgainStore } from '../../store/useEatAgainStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { showToast } from '../../store/useToastStore';
import { quest } from '../../theme/quest';
import { extraProofRef, type ExtraMealTime } from '../../types';
import { toDateKey } from '../../utils/date';
import { sortedPhotos } from '../../utils/photoOrder';
import { BottomSheet } from './BottomSheet';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

/** Logs a dish again on `dateKey` (same figures and parts, no photo: the old photo file stays with the old entry) and shows the toast
 *  whose "Hoàn tác" removes exactly the new entry. Returns the new entry's id. */
export function logDishAgain(dish: RecentDish, dateKey: string, mealTime: ExtraMealTime | null, toastText: string): string {
  const id = useNutritionStore.getState().addExtra(dateKey, dish.name, dish.calories, dish.proteinG, mealTime, {
    purineMg: dish.purineMg,
    saltG: dish.saltG,
    sugarG: dish.sugarG,
    junk: dish.junk,
    fromFoodDb: true,
    parts: dish.item.parts,
  });
  showToast({ text: toastText, undo: () => useNutritionStore.getState().removeExtraItem(dateKey, id) });
  return id;
}

interface Props {
  dateKey: string;
  now: Date;
  /** "Ghi với khẩu phần khác": opens Add food filled with the dish. */
  onEditPortion: (dish: RecentDish, mealTime: ExtraMealTime | null) => void;
}

/** "Ăn lại" in the quick-add sheet: the latest distinct dishes (3–6) with their photo. One tap logs the dish again for the chosen day
 *  with a "Hoàn tác" toast; a long press opens a menu (log now, another portion, hide from the row). Hidden when nothing was logged yet. */
export function EatAgainRow({ dateKey, now, onEditPortion }: Props) {
  const g = useGameText();
  const { t } = useTranslation();
  const logs = useNutritionStore((s) => s.logs);
  const hidden = useEatAgainStore((s) => s.hidden);
  const proofs = useProofStore((s) => s.photos);
  const dishes = useMemo(() => recentDishes(logs, hidden), [logs, hidden]);
  const [menu, setMenu] = useState<RecentDish | null>(null);
  if (dishes.length === 0) return null;

  const isToday = dateKey === toDateKey(now);
  const mealName = (mt: ExtraMealTime | null) => (mt ? t(`extraMealTime.${mt}` as StringKey) : '');
  const photoOf = (dish: RecentDish): string | null => {
    if (dish.item.photoUri) return dish.item.photoUri;
    const linked = sortedPhotos(proofs.filter((p) => p.taskType === 'meal' && p.taskRefId === extraProofRef(dish.item.id)));
    return linked[0]?.photoUri ?? null;
  };
  const kcal = (dish: RecentDish) => Math.round(dish.calories).toLocaleString('en-US');

  function logNow(dish: RecentDish) {
    const mt = eatAgainMealTime(dish, isToday, now);
    const text = mt
      ? g('quick.againLoggedMeal', { name: dish.name, kcal: kcal(dish), meal: mealName(mt) })
      : g('quick.againLogged', { name: dish.name, kcal: kcal(dish) });
    logDishAgain(dish, dateKey, mt, text);
  }

  function hide(dish: RecentDish) {
    useEatAgainStore.getState().hide(dish.key);
    showToast({ text: g('quick.againHidden', { name: dish.name }), tone: 'neutral', undo: () => useEatAgainStore.getState().unhide(dish.key) });
  }

  const menuMeal = menu ? eatAgainMealTime(menu, isToday, now) : null;
  const [, mm, dd] = (menu?.dateKey ?? '--').split('-');
  const actions: { icon: QuestIconName; label: string; run: (d: RecentDish) => void; muted?: boolean }[] = [
    { icon: 'check', label: menuMeal ? g('quick.againNow', { meal: mealName(menuMeal) }) : g('quick.againNowPlain'), run: logNow },
    { icon: 'edit', label: g('quick.againEdit'), run: (d) => onEditPortion(d, eatAgainMealTime(d, isToday, now)) },
    { icon: 'x', label: g('quick.againHide'), run: hide, muted: true },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <HudText size={15}>{g('quick.again')}</HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('quick.againHint')}
        </HudText>
      </View>
      <View style={styles.row}>
        {dishes.slice(0, 3).map((dish) => (
          <Pressable
            key={dish.key}
            accessibilityRole="button"
            accessibilityLabel={g('quick.againA11y', { name: dish.name, kcal: kcal(dish) })}
            accessibilityHint={g('quick.againA11yHint')}
            accessibilityActions={[{ name: 'longpress', label: g('quick.againA11yHint') }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') setMenu(dish);
            }}
            onPress={() => logNow(dish)}
            onLongPress={() => setMenu(dish)}
            delayLongPress={450}
            style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
          >
            <DishThumb name={dish.name} photoUri={photoOf(dish)} size={72} radius={12} />
            <HudText size={12} numberOfLines={1}>
              {dish.name}
            </HudText>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {`${kcal(dish)} kcal`}
            </HudText>
          </Pressable>
        ))}
      </View>
      {dishes.length > 3 && (
        <View style={styles.row}>
          {dishes.slice(3).map((dish) => (
            <Pressable
              key={dish.key}
              accessibilityRole="button"
              accessibilityLabel={g('quick.againA11y', { name: dish.name, kcal: kcal(dish) })}
              accessibilityHint={g('quick.againA11yHint')}
              accessibilityActions={[{ name: 'longpress', label: g('quick.againA11yHint') }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'longpress') setMenu(dish);
              }}
              onPress={() => logNow(dish)}
              onLongPress={() => setMenu(dish)}
              delayLongPress={450}
              style={({ pressed }) => [styles.small, pressed && styles.pressed]}
            >
              <DishThumb name={dish.name} photoUri={photoOf(dish)} size={32} radius={8} />
              <View style={styles.flex}>
                <HudText size={12} numberOfLines={1}>
                  {dish.name}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {`${kcal(dish)} kcal`}
                </HudText>
              </View>
            </Pressable>
          ))}
          {Array.from({ length: 6 - dishes.length }, (_, i) => (
            <View key={`gap${i}`} style={styles.flex} />
          ))}
        </View>
      )}

      <BottomSheet visible={menu != null} onClose={() => setMenu(null)} testID="eat-again-menu">
        {menu ? (
          <>
            <View style={styles.menuHead}>
              <DishThumb name={menu.name} photoUri={photoOf(menu)} size={52} />
              <View style={styles.flex}>
                <HudText size={15} accessibilityRole="header">
                  {menu.name}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {g('quick.againMeta', { kcal: kcal(menu), p: Math.round(menu.proteinG), date: `${Number(dd)}/${Number(mm)}` })}
                </HudText>
              </View>
            </View>
            {actions.map((a) => (
              <Pressable
                key={a.icon}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                onPress={() => {
                  const dish = menu;
                  setMenu(null);
                  a.run(dish);
                }}
                style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              >
                <QuestIcon name={a.icon} size={20} color={a.muted ? quest.textSecondary : quest.gold} />
                <HudText size={14} color={a.muted ? quest.textSecondary : quest.text} style={styles.flex}>
                  {a.label}
                </HudText>
              </Pressable>
            ))}
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cell: { flex: 1, minWidth: 0, gap: 2, alignItems: 'center' },
  small: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.85 },
  menuHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
});

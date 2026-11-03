import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { emptyRow, num, rowAmount, scaleRow, type MealRow } from '../../food/mealRows';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { DishThumb } from './DishThumb';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestField } from './QuestField';
import { Stepper } from './Stepper';

type Figure = 'calories' | 'protein' | 'purine' | 'salt' | 'sugar';
const FIGURES: { key: Figure; label: 'food.calories' | 'food.protein' | 'food.purine' | 'food.salt' | 'food.sugar' }[] = [
  { key: 'calories', label: 'food.calories' },
  { key: 'protein', label: 'food.protein' },
  { key: 'purine', label: 'food.purine' },
  { key: 'salt', label: 'food.salt' },
  { key: 'sugar', label: 'food.sugar' },
];

/** A typed figure that cannot be saved: not a number, or below 0 (empty is fine: it counts as 0). */
function badFigure(text: string): boolean {
  const t = text.trim().replace(',', '.');
  if (!t) return false;
  const v = Number(t);
  return !Number.isFinite(v) || v < 0;
}

/** Where a line's figures come from, in a few words: "AI ~85% · đã sửa tay", "CSDL của bạn", "Tự nhập". */
export function useRowSourceText() {
  const g = useGameText();
  return (row: MealRow): string => {
    const base = row.fromDb ? g('meal.src.db') : row.accuracy !== null ? g('meal.src.ai', { pct: row.accuracy }) : row.aiCalories > 0 ? g('meal.src.aiNoPct') : g('meal.src.hand');
    const edited = !!row.baseline && row.baseline !== `${row.name}|${row.calories}`;
    return edited ? `${base} · ${g('meal.src.edited')}` : base;
  };
}

interface Props {
  /** The line being edited; null closes the sheet. */
  row: MealRow | null;
  /** The line's photo (the meal's main photo for a lone food). */
  photoUri?: string | null;
  onClose: () => void;
  onSave: (row: MealRow) => void;
  onRemove: () => void;
}

/** "Sửa từng số" (Design/uiux-proposal/html/dialogs/08-item-edit-sheet.html): one food of the meal being logged, with its name, its
 *  amount (a stepper; the figures follow in proportion, offline) and all five figures. Nothing changes in the list until "Lưu";
 *  "Xoá món" takes the line out (the screen offers Hoàn tác). */
export function MealItemSheet({ row, photoUri, onClose, onSave, onRemove }: Props) {
  const g = useGameText();
  const source = useRowSourceText();
  const [draft, setDraft] = useState<MealRow>(() => row ?? emptyRow('none'));
  const [qtyOk, setQtyOk] = useState(true);
  const [tried, setTried] = useState(false);
  // The stepper's step and digits are chosen once per opening, from the amount it starts at (1 bát → 0.5; 150 g → 10).
  const [shape, setShape] = useState({ step: 0.5, decimals: 1 });

  useEffect(() => {
    if (!row) return;
    setDraft(row);
    setQtyOk(true);
    setTried(false);
    const start = parseFloat(rowAmount(row).qty.replace(',', '.')) || 1;
    setShape(start >= 20 ? { step: 10, decimals: 0 } : { step: 0.5, decimals: 1 });
  }, [row]);

  const amount = rowAmount(draft);
  const qty = parseFloat(amount.qty.replace(',', '.'));
  const invalid = !qtyOk || !(qty > 0) || FIGURES.some((f) => badFigure(draft[f.key]));
  const typed = (change: Partial<MealRow>) => setDraft((d) => ({ ...d, ...change, qty: undefined, base: undefined }));

  function save() {
    setTried(true);
    if (invalid) return;
    onSave(draft);
  }

  const name = draft.name.trim();
  return (
    <BottomSheet
      visible={row != null}
      onClose={onClose}
      eyebrow={g('meal.item.eyebrow')}
      title={name || g('meal.item.newTitle')}
      testID="meal-item-sheet"
      footer={
        <View style={styles.footer}>
          <View style={styles.footerSide}>
            <QuestButton variant="danger" title={g('meal.item.remove')} onPress={onRemove} />
          </View>
          <View style={styles.footerMain}>
            <QuestButton title={g('meal.item.save', { kcal: Math.round(num(draft.calories)) })} accessibilityLabel={g('meal.item.saveA11y')} onPress={save} />
          </View>
        </View>
      }
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <DishThumb name={name || '?'} photoUri={photoUri} size={52} />
          <View style={styles.flex}>
            <QuestField label={g('food.name')} value={draft.name} onChangeText={(v) => typed({ name: v })} placeholder={g('food.namePlaceholder')} />
          </View>
        </View>

        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('food.qty')}
          {amount.unit ? ` (${amount.unit})` : ''}
        </HudText>
        <Stepper
          size="small"
          label={g('food.qty')}
          value={qty > 0 ? qty : 1}
          step={shape.step}
          decimals={shape.decimals}
          min={shape.step}
          max={5000}
          unit={amount.unit || undefined}
          onValidChange={setQtyOk}
          invalid={tried && !qtyOk}
          onChange={(v) => setDraft((d) => scaleRow(d, String(v)))}
        />
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('meal.item.qtyHint')}
        </HudText>

        <View style={styles.grid}>
          {FIGURES.map((f) => (
            <View key={f.key} style={styles.cell}>
              <QuestField label={g(f.label)} keyboardType="decimal-pad" value={draft[f.key]} onChangeText={(v) => typed({ [f.key]: v })} selectTextOnFocus />
            </View>
          ))}
          <View style={[styles.cell, styles.source]}>
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('meal.item.source')}
            </HudText>
            <HudText size={13} color={quest.manaText}>
              {source(draft)}
            </HudText>
          </View>
        </View>

        {tried && invalid ? (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {g('meal.item.invalid')}
          </HudText>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexBasis: '46%', flexGrow: 1, minWidth: 0 },
  source: { justifyContent: 'center', gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderStyle: 'dashed', borderColor: quest.border },
  footer: { flexDirection: 'row', gap: 10 },
  footerSide: { flex: 1 },
  footerMain: { flex: 1.6 },
});

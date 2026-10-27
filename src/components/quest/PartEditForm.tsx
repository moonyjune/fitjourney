import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { formatQty, partFromFields, partQuantity, scalePart } from '../../food/partScale';
import { useGameText } from '../../game/strings';
import { quest, questFonts, questRadius } from '../../theme/quest';
import type { MealPart } from '../../types';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

const t1 = (n: number | undefined) => (n ? String(Math.round(n * 100) / 100) : '');

/** Edits one food of a logged meal: its amount and every figure. Changing the amount works the other figures out again in proportion, on
 *  the spot and offline; each figure can then still be typed over by hand. Nothing is saved until the tick is pressed. */
export function PartEditForm({ part, onSave, onCancel }: { part: MealPart; onSave: (next: MealPart) => void; onCancel: () => void }) {
  const g = useGameText();
  const [f, setF] = useState({
    qty: formatQty(partQuantity(part.name).qty),
    kcal: t1(part.calories),
    protein: t1(part.proteinG),
    purine: t1(part.purineMg),
    salt: t1(part.saltG),
    sugar: t1(part.sugarG),
  });
  const next = partFromFields(part, f);

  function changeQty(text: string) {
    const scaled = scalePart(part, parseFloat(text.replace(',', '.')));
    setF(scaled ? { qty: text, kcal: t1(scaled.calories), protein: t1(scaled.proteinG), purine: t1(scaled.purineMg), salt: t1(scaled.saltG), sugar: t1(scaled.sugarG) } : { ...f, qty: text });
  }
  const field = (key: keyof typeof f, label: string, unit: string, onChange?: (t: string) => void) => (
    <View style={styles.field} key={key}>
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {label}
      </HudText>
      <View style={styles.box}>
        <TextInput
          accessibilityLabel={label}
          value={f[key]}
          onChangeText={onChange ?? ((text) => setF({ ...f, [key]: text }))}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholderTextColor={quest.textSecondary}
          style={styles.input}
        />
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {unit}
        </HudText>
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {part.name}
      </HudText>
      <View style={styles.row}>
        {field('qty', g('journal.partQty'), '', changeQty)}
        {field('kcal', g('journal.partKcal'), 'kcal')}
        {field('protein', g('journal.partProtein'), 'g')}
      </View>
      <View style={styles.row}>
        {field('purine', g('journal.partPurine'), 'mg')}
        {field('salt', g('journal.partSalt'), 'g')}
        {field('sugar', g('journal.partSugar'), 'g')}
      </View>
      <View style={styles.actions}>
        <HudText size={11} weight="medium" color={next ? quest.textSecondary : quest.hpText} style={styles.hint}>
          {next ? g('journal.partOfflineHint') : g('journal.partInvalid')}
        </HudText>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.partSave')} accessibilityState={{ disabled: !next }} disabled={!next} onPress={() => next && onSave(next)} style={[styles.btn, styles.save, !next && { opacity: 0.4 }]}>
          <QuestIcon name="check" size={18} color={quest.onGold} strokeWidth={2.6} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={g('journal.partCancel')} onPress={onCancel} style={styles.btn}>
          <QuestIcon name="x" size={18} color={quest.textSecondary} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, padding: 8, borderRadius: questRadius.row, backgroundColor: quest.raised },
  row: { flexDirection: 'row', gap: 6 },
  field: { flex: 1, minWidth: 0, gap: 2 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 8, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
  input: { flex: 1, minWidth: 0, color: quest.text, fontSize: 15, fontFamily: questFonts.semibold, paddingVertical: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { flex: 1 },
  btn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  save: { backgroundColor: quest.gold },
});

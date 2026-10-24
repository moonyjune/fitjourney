import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useShoppingListStore } from '../../store/useShoppingListStore';
import { useTranslation } from '../../i18n/useTranslation';
import { quest, questFonts, questRadius } from '../../theme/quest';
import type { PlanData } from '../../types';
import { formatVnd } from '../PlanPreview';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';

interface Row {
  key: string;
  category: string;
  name: string;
  quantityToBuy: string;
  estimatedPriceVnd: number;
  isCustom: boolean;
}

/** Dark FitQuest twin of ShoppingListEditor — same store and rules (weekly reset, check-off, actual qty/price, custom items). */
export function QuestShoppingList({ plan }: { plan: PlanData }) {
  const { t } = useTranslation();
  const ensureCurrentWeek = useShoppingListStore((s) => s.ensureCurrentWeek);
  const checkedItems = useShoppingListStore((s) => s.checkedItems);
  const actualPrices = useShoppingListStore((s) => s.actualPrices);
  const actualQuantities = useShoppingListStore((s) => s.actualQuantities);
  const customItems = useShoppingListStore((s) => s.customItems);
  const toggleChecked = useShoppingListStore((s) => s.toggleChecked);
  const setActualPrice = useShoppingListStore((s) => s.setActualPrice);
  const clearActualPrice = useShoppingListStore((s) => s.clearActualPrice);
  const setActualQuantity = useShoppingListStore((s) => s.setActualQuantity);
  const addCustomItem = useShoppingListStore((s) => s.addCustomItem);
  const removeCustomItem = useShoppingListStore((s) => s.removeCustomItem);

  useEffect(() => {
    ensureCurrentWeek();
  }, [ensureCurrentWeek]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  const rows: Row[] = [
    ...plan.shoppingList.map((item) => ({
      key: item.name,
      category: item.category,
      name: item.name,
      quantityToBuy: actualQuantities[item.name] ?? item.quantityToBuy,
      estimatedPriceVnd: actualPrices[item.name] ?? item.estimatedPriceVnd,
      isCustom: false,
    })),
    ...customItems.map((item) => ({
      key: item.id,
      category: item.category,
      name: item.name,
      quantityToBuy: item.quantityToBuy,
      estimatedPriceVnd: item.estimatedPriceVnd,
      isCustom: true,
    })),
  ];
  const totalVnd = rows.reduce((sum, r) => sum + r.estimatedPriceVnd, 0);

  function handleAddCustom() {
    const priceVnd = parseFloat(price.replace(',', '.')) || 0;
    if (!name.trim() || !quantity.trim()) return;
    addCustomItem({
      category: category.trim() || t('shoppingEditor.categoryPlaceholder'),
      name: name.trim(),
      quantityToBuy: quantity.trim(),
      estimatedPriceVnd: priceVnd,
    });
    setName('');
    setCategory('');
    setQuantity('');
    setPrice('');
  }

  const input = (props: React.ComponentProps<typeof TextInput>) => (
    <TextInput placeholderTextColor={quest.textSecondary} {...props} style={[styles.input, props.style]} />
  );

  return (
    <View>
      <HudText size={16} accessibilityRole="header" style={styles.title}>
        {t('planPreview.shoppingTitle', { price: formatVnd(totalVnd) })}
      </HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
        {t('shoppingEditor.weekNote')}
      </HudText>
      <View style={styles.panel}>
        {rows.map((row) => {
          const checked = !!checkedItems[row.key];
          return (
            <View key={row.key} style={styles.row}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={row.name}
                accessibilityState={{ checked }}
                onPress={() => toggleChecked(row.key)}
                style={styles.hit}
              >
                <View style={[styles.box, checked && { backgroundColor: quest.xp, borderColor: quest.xp }]}>
                  {checked && <QuestIcon name="check" size={14} color={quest.onGold} strokeWidth={3} />}
                </View>
              </Pressable>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <HudText
                    size={13}
                    color={checked ? quest.textSecondary : quest.text}
                    style={[styles.flex, checked && { textDecorationLine: 'line-through' }]}
                  >
                    {row.name}
                  </HudText>
                  {row.isCustom && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('common.delete')} ${row.name}`}
                      onPress={() => removeCustomItem(row.key)}
                      style={styles.hit}
                    >
                      <HudText size={12} color={quest.hpText}>
                        {t('common.delete')}
                      </HudText>
                    </Pressable>
                  )}
                </View>
                <HudText size={11} weight="medium" color={quest.textSecondary}>
                  {row.category}
                </HudText>
                {row.isCustom ? (
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {t('planPreview.buyPrefix')}
                    {row.quantityToBuy} · {formatVnd(row.estimatedPriceVnd)}
                  </HudText>
                ) : (
                  <View style={styles.editRow}>
                    {input({
                      accessibilityLabel: `${row.name} – ${t('planPreview.buyPrefix')}`,
                      placeholder: row.quantityToBuy,
                      value: actualQuantities[row.name] ?? '',
                      onChangeText: (v) => setActualQuantity(row.name, v),
                      style: styles.flex,
                    })}
                    {input({
                      accessibilityLabel: `${row.name} – ${t('shoppingEditor.pricePlaceholder')}`,
                      placeholder: t('shoppingEditor.pricePlaceholder'),
                      keyboardType: 'decimal-pad',
                      value: row.estimatedPriceVnd > 0 ? String(row.estimatedPriceVnd) : '',
                      onChangeText: (v) => {
                        const trimmed = v.trim();
                        if (!trimmed) {
                          clearActualPrice(row.name);
                          return;
                        }
                        const parsed = parseFloat(trimmed.replace(',', '.'));
                        if (!Number.isNaN(parsed)) setActualPrice(row.name, parsed);
                      },
                      style: styles.flex,
                    })}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <HudText size={16} accessibilityRole="header" style={styles.title}>
        {t('shoppingEditor.addCustomTitle')}
      </HudText>
      <View style={[styles.panel, { gap: 8 }]}>
        {input({ accessibilityLabel: t('shoppingEditor.namePlaceholder'), placeholder: t('shoppingEditor.namePlaceholder'), value: name, onChangeText: setName })}
        {input({ accessibilityLabel: t('shoppingEditor.categoryPlaceholder'), placeholder: t('shoppingEditor.categoryPlaceholder'), value: category, onChangeText: setCategory })}
        <View style={styles.editRow}>
          {input({
            accessibilityLabel: t('shoppingEditor.quantityToBuyPlaceholder'),
            placeholder: t('shoppingEditor.quantityToBuyPlaceholder'),
            value: quantity,
            onChangeText: setQuantity,
            style: styles.flex,
          })}
          {input({
            accessibilityLabel: t('shoppingEditor.priceEstimatePlaceholder'),
            placeholder: t('shoppingEditor.priceEstimatePlaceholder'),
            keyboardType: 'decimal-pad',
            value: price,
            onChangeText: setPrice,
            style: styles.flex,
          })}
        </View>
        <QuestButton title={t('shoppingEditor.addButton')} onPress={handleAddCustom} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  title: { marginTop: 12, marginBottom: 6 },
  note: { marginBottom: 8 },
  panel: { backgroundColor: quest.panel, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, padding: 14, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: quest.border },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: questRadius.row,
    borderWidth: 1.5,
    borderColor: quest.border,
    backgroundColor: quest.bg,
    color: quest.text,
    fontSize: 14,
    fontFamily: questFonts.semibold,
  },
});

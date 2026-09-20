import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from './Card';
import { Button } from './Button';
import { formatVnd } from './PlanPreview';
import { useShoppingListStore } from '../store/useShoppingListStore';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PlanData } from '../types';

interface Row {
  key: string;
  category: string;
  name: string;
  quantityToBuy: string;
  estimatedPriceVnd: number;
  isCustom: boolean;
}

/** Interactive weekly shopping checklist: check off prepared items, edit actual quantity/price,
 *  and add/remove custom ingredients on top of the plan's base list. Resets every week. */
export function ShoppingListEditor({ plan }: { plan: PlanData }) {
  const { t } = useTranslation();
  const ensureCurrentWeek = useShoppingListStore((s) => s.ensureCurrentWeek);
  const checkedItems = useShoppingListStore((s) => s.checkedItems);
  const actualPrices = useShoppingListStore((s) => s.actualPrices);
  const actualQuantities = useShoppingListStore((s) => s.actualQuantities);
  const customItems = useShoppingListStore((s) => s.customItems);
  const toggleChecked = useShoppingListStore((s) => s.toggleChecked);
  const setActualPrice = useShoppingListStore((s) => s.setActualPrice);
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
    addCustomItem({ category: category.trim() || t('shoppingEditor.categoryPlaceholder'), name: name.trim(), quantityToBuy: quantity.trim(), estimatedPriceVnd: priceVnd });
    setName('');
    setCategory('');
    setQuantity('');
    setPrice('');
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>{t('planPreview.shoppingTitle', { price: formatVnd(totalVnd) })}</Text>
      <Text style={styles.weekNote}>{t('shoppingEditor.weekNote')}</Text>
      <Card>
        {rows.map((row) => {
          const checked = !!checkedItems[row.key];
          return (
            <View key={row.key} style={styles.row}>
              <TouchableOpacity style={styles.checkboxWrap} onPress={() => toggleChecked(row.key)}>
                <View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked && <Text style={styles.checkboxTick}>✓</Text>}</View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, checked && styles.nameChecked]}>{row.name}</Text>
                  {row.isCustom && (
                    <TouchableOpacity onPress={() => removeCustomItem(row.key)}>
                      <Text style={styles.deleteText}>{t('common.delete')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.meta}>{row.category}</Text>
                {row.isCustom ? (
                  <Text style={styles.meta}>
                    {t('planPreview.buyPrefix')}
                    {row.quantityToBuy} · {formatVnd(row.estimatedPriceVnd)}
                  </Text>
                ) : (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.editInput}
                      placeholder={row.quantityToBuy}
                      value={actualQuantities[row.name] ?? ''}
                      onChangeText={(v) => setActualQuantity(row.name, v)}
                    />
                    <TextInput
                      style={styles.editInput}
                      placeholder={t('shoppingEditor.pricePlaceholder')}
                      keyboardType="decimal-pad"
                      value={actualPrices[row.name] != null ? String(actualPrices[row.name]) : ''}
                      onChangeText={(v) => setActualPrice(row.name, parseFloat(v.replace(',', '.')) || 0)}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </Card>

      <Text style={styles.subTitle}>{t('shoppingEditor.addCustomTitle')}</Text>
      <Card>
        <TextInput style={styles.input} placeholder={t('shoppingEditor.namePlaceholder')} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder={t('shoppingEditor.categoryPlaceholder')} value={category} onChangeText={setCategory} />
        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, styles.formRowInput]}
            placeholder={t('shoppingEditor.quantityToBuyPlaceholder')}
            value={quantity}
            onChangeText={setQuantity}
          />
          <TextInput
            style={[styles.input, styles.formRowInput]}
            placeholder={t('shoppingEditor.priceEstimatePlaceholder')}
            keyboardType="decimal-pad"
            value={price}
            onChangeText={setPrice}
          />
        </View>
        <Button title={t('shoppingEditor.addButton')} onPress={handleAddCustom} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...typography.title, marginTop: spacing.sm, marginBottom: spacing.xs, color: colors.textPrimary },
  subTitle: { ...typography.title, marginTop: spacing.md, marginBottom: spacing.sm, color: colors.textPrimary },
  weekNote: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  checkboxWrap: { paddingTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkboxTick: { color: colors.white, fontWeight: '900', fontSize: 13 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  nameChecked: { textDecorationLine: 'line-through', color: colors.textMuted },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  deleteText: { color: colors.danger, fontSize: 12 },
  editRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm - 2 },
  editInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  formRowInput: { flex: 1 },
});

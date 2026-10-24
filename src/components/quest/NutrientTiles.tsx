import { StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import type { Nutrients } from '../../game/nutrients';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';

interface NutrientTilesProps {
  nutrients: Nutrients;
  /** Which daily limits this change would push over; those tiles get the gold warning border. */
  exceeded?: Partial<Record<'purine' | 'salt' | 'sugar', boolean>>;
}

/** Purine / salt / sugar for one meal or food, shown as three compact tiles. */
export function NutrientTiles({ nutrients, exceeded = {} }: NutrientTilesProps) {
  const g = useGameText();
  const tiles = [
    { key: 'purine' as const, label: g('nutr.purine'), value: g('nutr.purineValue', { n: Math.round(nutrients.purineMg) }) },
    { key: 'salt' as const, label: g('nutr.salt'), value: g('nutr.saltValue', { n: nutrients.saltG.toFixed(1) }) },
    { key: 'sugar' as const, label: g('nutr.sugar'), value: g('nutr.sugarValue', { n: Math.round(nutrients.sugarG) }) },
  ];
  const anyExceeded = Object.values(exceeded).some(Boolean);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {tiles.map((t) => (
          <View
            key={t.key}
            accessible
            accessibilityLabel={`${t.label} ${t.value}`}
            style={[styles.tile, exceeded[t.key] ? { borderColor: quest.gold } : { borderColor: quest.border }]}
          >
            <HudText size={11} weight="medium" color={quest.textSecondary}>
              {t.label}
            </HudText>
            <HudText size={14} color={exceeded[t.key] ? quest.goldLight : quest.text}>
              {t.value}
            </HudText>
          </View>
        ))}
      </View>
      {anyExceeded && (
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {g('nutr.legend')}
        </HudText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, backgroundColor: quest.panel, gap: 2 },
});

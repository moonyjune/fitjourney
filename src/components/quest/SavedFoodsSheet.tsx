import { Pressable, StyleSheet } from 'react-native';
import { FoodLookup, type LookupResult } from '../../food/components/FoodLookup';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The foods picked, with their total: the screen opens Add food filled with them. */
  onUse: (result: LookupResult) => void;
  onOpenDb: () => void;
  onOpenCookbook: () => void;
}

/** "Món đã lưu" (Design/uiux-proposal/html/dialogs/06-saved-foods-sheet.html): search the food database, recent foods, a basket with
 *  amounts and the total (FoodLookup, open), links to the food database screen and the cook book. "Dùng cho món này" hands the total
 *  to Add food, where it is checked and saved. */
export function SavedFoodsSheet({ visible, onClose, onUse, onOpenDb, onOpenCookbook }: Props) {
  const g = useGameText();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={g('quick.savedFoods')} testID="saved-foods-sheet">
      <FoodLookup alwaysOpen onApply={onUse} onOpenDb={onOpenDb} />
      <Pressable accessibilityRole="link" accessibilityLabel={g('saved.cookbook')} onPress={onOpenCookbook} style={styles.link}>
        <HudText size={13} color={quest.manaText}>
          {g('saved.cookbook')}
        </HudText>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center' },
});

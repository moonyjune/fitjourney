import { useTranslation } from '../../i18n/useTranslation';
import type { StringKey } from '../../i18n/strings';
import { mealTimeAt } from '../../food/eatAgain';
import { deleteExtraWithUndo, logExtraAgain } from '../../food/mealActions';
import { editListedPartPatch, partsOrSelf } from '../../food/singlePart';
import { useGameText } from '../../game/strings';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useProofStore } from '../../store/useProofStore';
import { toDateKey } from '../../utils/date';
import { addExtraPhoto, removeExtraPhoto } from '../../utils/mealPhotos';
import { extraPhotoRefs } from '../../utils/photoOrder';
import { MealDetailDialog } from './MealDetailDialog';

const pad = (n: number) => String(n).padStart(2, '0');

/** The meal detail sheet for one food of the own diary, wired to the stores: amounts, photos, "Ăn lại" and "Xoá bữa" (with Hoàn tác). */
export function LoggedFoodSheet({ dateKey, itemId, now, onClose }: { dateKey: string; itemId: string | null; now: Date; onClose: () => void }) {
  const g = useGameText();
  const { t } = useTranslation();
  const item = useNutritionStore((s) => (itemId ? s.logs[dateKey]?.extraItems?.find((i) => i.id === itemId) : undefined));
  const proofs = useProofStore((s) => s.photos);
  if (!item) return null;
  const at = new Date(item.loggedAtISO);
  const detail = {
    title: item.name || g('journal.extra'),
    time: Number.isNaN(at.getTime()) ? '' : `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    meal: item.mealTime ? t(`extraMealTime.${item.mealTime}` as StringKey) : undefined,
    kcal: Math.round(item.calories),
    proteinG: item.proteinG,
    purineMg: item.purineMg ?? 0,
    sugarG: item.sugarG ?? 0,
    saltG: item.saltG ?? 0,
    parts: partsOrSelf(item),
    photos: extraPhotoRefs(proofs, { id: item.id, photoUri: item.photoUri }),
  };

  function eatAgain() {
    if (!item) return;
    const mealTime = mealTimeAt(now);
    logExtraAgain(toDateKey(now), item, mealTime, g('quick.againLoggedMeal', { name: item.name, kcal: Math.round(item.calories).toLocaleString('en-US'), meal: t(`extraMealTime.${mealTime}` as StringKey) }));
  }

  return (
    <MealDetailDialog
      detail={detail}
      onClose={onClose}
      canEditParts
      onEditPart={(index, part) => {
        const patch = editListedPartPatch(item, index, part);
        if (patch) useNutritionStore.getState().updateExtra(dateKey, item.id, patch);
      }}
      onAddPhoto={(uri) => addExtraPhoto(dateKey, item.id, uri)}
      onRemovePhoto={async (photo) => removeExtraPhoto(dateKey, item.id, photo)}
      onEatAgain={item.calories > 0 ? eatAgain : undefined}
      onDelete={() => deleteExtraWithUndo(dateKey, item.id, g('journal.mealDeleted', { name: detail.title }))}
    />
  );
}

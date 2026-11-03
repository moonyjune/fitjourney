import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { mapsSearchUrl, placeNameKey } from '../../../supabase/functions/_shared/places';
import type { PlacesSearch, SavedPlace } from '../../cookbook/placesHistory';
import { useGameText } from '../../game/strings';
import { useCheatPlacesStore } from '../../store/useCheatPlacesStore';
import { showToast } from '../../store/useToastStore';
import { quest, questRadius } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { DirectionsButton, DishCarousel, PlacePhotoView, SaveStar } from './CheatPlacesList';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

const pad = (n: number) => String(n).padStart(2, '0');
const isToday = (d: Date) => new Date().toDateString() === d.toDateString();

/** "Hôm nay" or "25/10". */
function useWhen() {
  const g = useGameText();
  return (atISO: string): string => {
    const d = new Date(atISO);
    return isToday(d) ? g('rd4.today') : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  };
}

/** Where a kept place's "Chỉ đường" goes: its own link when it is a Maps page, else a Maps search for it. */
const placeUrl = (p: SavedPlace): string => (p.link && p.link.includes('google.') ? p.link : mapsSearchUrl(p.name, p.address, p.near ?? ''));

/** One kept place as a short row: name, dish · km, "Chỉ đường", and a star (history) or ✕ (saved list). */
function PlaceRow({ p, saved, onStar, onRemove, photo }: { p: SavedPlace; saved: boolean; onStar?: () => void; onRemove?: () => void; photo?: boolean }) {
  const g = useGameText();
  return (
    <View style={styles.place} accessibilityLabel={p.name}>
      {photo ? <PlacePhotoView photo={p.photo} name={p.name} height={110} /> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <HudText size={14} numberOfLines={1}>
            {p.name}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
            {[p.dish, p.distanceKm !== null ? g('cheat.distance', { km: p.distanceKm }) : null, p.address].filter(Boolean).join(' · ')}
          </HudText>
          {p.notes ? (
            <HudText size={12} weight="medium" color={quest.text} numberOfLines={2}>
              {p.notes}
            </HudText>
          ) : null}
        </View>
        {onRemove ? (
          <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.removeA11y', { name: p.name })} onPress={onRemove} style={styles.round}>
            <QuestIcon name="x" size={16} color={quest.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.row}>
        <DirectionsButton url={placeUrl(p)} name={p.name} />
        {onStar ? <SaveStar name={p.name} saved={saved} onPress={onStar} /> : null}
      </View>
    </View>
  );
}

/** "Xem lại" of one search (dialog 26): how the AI read the wish, the area, its dishes (kept photos only) and places with a star. */
function SearchSheet({ s, savedKeys, onClose }: { s: PlacesSearch | null; savedKeys: Set<string>; onClose: () => void }) {
  const g = useGameText();
  const when = useWhen();
  if (!s) return null;
  const store = useCheatPlacesStore.getState;
  return (
    <BottomSheet visible onClose={onClose} title={s.wish || g('cheat.historyNoWish')} subtitle={`${when(s.atISO)} · ${g('rd4.history.places', { n: s.places.length })}`}>
      <View style={styles.list}>
        {s.readWish ? (
          <HudText size={13} weight="medium" color={quest.manaText}>
            {g('cheat.readWish', { text: s.readWish })}
          </HudText>
        ) : null}
        {s.near ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cheat.placesNear', { where: s.near })}
          </HudText>
        ) : null}
        {s.dishes.length > 0 ? (
          <DishCarousel
            a11y={g('cheat.wishDishes', { n: s.dishes.length })}
            onPress={() => undefined}
            dishes={s.dishes.map((d) => {
              const fallback = s.places.find((p) => p.photo && placeNameKey(p.dish) === placeNameKey(d.name))?.photo ?? null;
              return { name: d.name, emoji: d.emoji, kcal: d.kcal, known: d.photo ?? fallback ?? null };
            })}
          />
        ) : null}
        {s.places.map((p) => (
          <PlaceRow key={p.key} p={p} saved={savedKeys.has(p.key)} onStar={() => store().toggleSaved(p)} />
        ))}
      </View>
    </BottomSheet>
  );
}

/** Cheat day > the places kept (06b): "Quán đã lưu" (starred places; ✕ removes with "Hoàn tác") and "Lịch sử tìm quán" (each search:
 *  the wish or "AI tự chọn", day · dishes · n places, "Xem lại" in a sheet, ✕ with "Hoàn tác"; "Xoá lịch sử" asks a second tap). */
export function CheatPlacesSaved() {
  const g = useGameText();
  const when = useWhen();
  const saved = useCheatPlacesStore((s) => s.saved);
  const history = useCheatPlacesStore((s) => s.history);
  const [viewing, setViewing] = useState<PlacesSearch | null>(null);
  const savedKeys = new Set(saved.map((p) => p.key));
  const store = useCheatPlacesStore.getState;

  const removeSaved = (p: SavedPlace) => {
    store().removeSaved(p.key);
    showToast({ text: g('rd4.saved.removed', { name: p.name }), undo: () => store().restoreSaved(p) });
  };
  // Done at once with "Hoàn tác" (decision 3: only the diary purge and sign-out still ask).
  const clearHistory = () => {
    const { history: before, clearedAtISO } = store();
    store().clearHistory();
    showToast({ text: g('rd7.history.cleared', { n: before.length }), undo: () => store().restoreHistory(before, clearedAtISO) });
  };
  const removeSearch = (s: PlacesSearch) => {
    store().removeSearch(s.id);
    showToast({ text: g('rd4.history.removed'), undo: () => store().restoreSearch(s) });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <HudText size={15} accessibilityRole="header" style={styles.flex}>
          {g('cheat.savedTitle', { n: saved.length })}
        </HudText>
      </View>
      {saved.length === 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.savedEmpty')}
        </HudText>
      ) : (
        saved.map((p) => <PlaceRow key={p.key} p={p} saved photo onRemove={() => removeSaved(p)} />)
      )}

      <View style={styles.head}>
        <HudText size={15} accessibilityRole="header" style={styles.flex}>
          {g('cheat.historyTitle', { n: history.length })}
        </HudText>
      </View>
      {history.length === 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.historyEmpty')}
        </HudText>
      ) : (
        <>
          {history.map((s) => (
            <View key={s.id} style={styles.search}>
              <View style={styles.flex}>
                <HudText size={14} numberOfLines={1}>
                  {s.wish || g('cheat.historyNoWish')}
                </HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                  {[when(s.atISO), s.dishes.map((d) => d.name).slice(0, 3).join(', '), g('rd4.history.places', { n: s.places.length })].filter(Boolean).join(' · ')}
                </HudText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={g('rd4.history.openA11y', { wish: s.wish || g('cheat.historyNoWish') })} onPress={() => setViewing(s)} style={styles.chip}>
                <HudText size={12} color={quest.manaText}>
                  {g('cheat.openSearch')}
                </HudText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.removeA11y', { name: `${s.wish || g('cheat.historyNoWish')} · ${when(s.atISO)}` })} onPress={() => removeSearch(s)} style={styles.round}>
                <QuestIcon name="x" size={16} color={quest.textSecondary} />
              </Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.clearHistory')} onPress={clearHistory} style={styles.chip}>
            <HudText size={12} color={quest.textSecondary}>
              {g('cheat.clearHistory')}
            </HudText>
          </Pressable>
        </>
      )}
      <SearchSheet s={viewing ? (history.find((h) => h.id === viewing.id) ?? viewing) : null} savedKeys={savedKeys} onClose={() => setViewing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  list: { gap: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  place: { gap: 6, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chip: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: quest.border },
});

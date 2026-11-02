import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { placeNameKey } from '../../../supabase/functions/_shared/places';
import type { PlacesSearch, SavedPlace } from '../../cookbook/placesHistory';
import { useGameText } from '../../game/strings';
import { useCheatPlacesStore } from '../../store/useCheatPlacesStore';
import { quest, questRadius } from '../../theme/quest';
import { PlacePhotoView, SaveStar } from './CheatPlacesList';
import { DishPhoto, DishPhotoCredit } from './DishPhoto';
import { HudText } from './HudText';

const pad = (n: number) => String(n).padStart(2, '0');
const when = (atISO: string): string => {
  const d = new Date(atISO);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** One kept place: its photo, name, dish, address, the short note, its link; a star (history) or ✕ (saved list). */
function PlaceRow({ p, saved, onStar, onRemove }: { p: SavedPlace; saved: boolean; onStar?: () => void; onRemove?: () => void }) {
  const g = useGameText();
  return (
    <View style={styles.place} accessibilityLabel={p.name}>
      <PlacePhotoView photo={p.photo} name={p.name} height={110} />
      <View style={styles.row}>
        <HudText size={13} style={styles.flex}>
          {`📍 ${p.name}${p.distanceKm !== null ? ` · ${g('cheat.distance', { km: p.distanceKm })}` : ''}`}
        </HudText>
        {onStar ? <SaveStar name={p.name} saved={saved} onPress={onStar} /> : null}
        {onRemove ? (
          <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.removeA11y', { name: p.name })} onPress={onRemove} hitSlop={8} style={styles.round}>
            <HudText size={12} color={quest.textSecondary}>
              ✕
            </HudText>
          </Pressable>
        ) : null}
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {[p.dish ? g('cheat.dish', { dish: p.dish }) : '', p.address ?? ''].filter(Boolean).join(' · ')}
      </HudText>
      {p.notes ? (
        <HudText size={12} weight="medium" color={quest.text}>
          {p.notes}
        </HudText>
      ) : null}
      {p.link ? (
        <Pressable accessibilityRole="link" accessibilityLabel={g('cheat.openLink', { name: p.name })} onPress={() => void Linking.openURL(p.link!).catch(() => undefined)} hitSlop={6}>
          <HudText size={12} weight="medium" color={quest.manaText} style={styles.link}>
            {`🔗 ${p.link.includes('google.') ? g('cheat.mapsPage') : p.link.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}`}
          </HudText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One search of the history: when, the wish (or "AI picked"), how many places; opened, its dishes (with their photos) and places. */
function SearchRow({ s, savedKeys }: { s: PlacesSearch; savedKeys: Set<string> }) {
  const g = useGameText();
  const [open, setOpen] = useState(false);
  const store = useCheatPlacesStore.getState;
  return (
    <View style={styles.search}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} hitSlop={4} style={styles.flex}>
          <HudText size={12} weight="semibold" color={quest.text}>
            {g('cheat.historyRow', { date: when(s.atISO), wish: s.wish || g('cheat.historyNoWish'), n: s.places.length })}
          </HudText>
          {s.near ? (
            <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={1}>
              {g('cheat.placesNear', { where: s.near })}
            </HudText>
          ) : null}
          <HudText size={11} weight="medium" color={quest.manaText}>
            {open ? g('cheat.closeSearch') : g('cheat.openSearch')}
          </HudText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.removeA11y', { name: s.wish || when(s.atISO) })} onPress={() => store().removeSearch(s.id)} hitSlop={8} style={styles.round}>
          <HudText size={12} color={quest.textSecondary}>
            ✕
          </HudText>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.list}>
          {s.readWish ? (
            <HudText size={12} weight="medium" color={quest.manaText}>
              {g('cheat.readWish', { text: s.readWish })}
            </HudText>
          ) : null}
          {s.dishes.map((d) => {
            const fallback = s.places.find((p) => p.photo && placeNameKey(p.dish) === placeNameKey(d.name))?.photo ?? null;
            return (
              <View key={d.name} style={styles.dish}>
                {/* Kept photos only: an old search asks for nothing again. */}
                <DishPhoto name={d.name} emoji={d.emoji ?? '🍽'} size={44} off={!d.photo && !fallback} known={d.photo ?? fallback} />
                <View style={styles.flex}>
                  <HudText size={12}>{`${d.name}${d.kcal !== null ? ` · ${g('cheat.dishKcal', { kcal: d.kcal })}` : ''}`}</HudText>
                  <DishPhotoCredit name={d.name} off={!d.photo && !fallback} known={d.photo ?? fallback} />
                </View>
              </View>
            );
          })}
          {s.places.map((p) => (
            <PlaceRow key={p.key} p={p} saved={savedKeys.has(p.key)} onStar={() => store().toggleSaved(p)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Cheat day > the places kept: "Quán đã lưu" (starred places, ✕ to remove) and "Lịch sử tìm quán" (every search, newest first,
 *  ✕ per search, "clear history" with a second tap to confirm). Both collapsed until opened. */
export function CheatPlacesSaved() {
  const g = useGameText();
  const saved = useCheatPlacesStore((s) => s.saved);
  const history = useCheatPlacesStore((s) => s.history);
  const [show, setShow] = useState<'saved' | 'history' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const savedKeys = new Set(saved.map((p) => p.key));
  const store = useCheatPlacesStore.getState;
  const tab = (id: 'saved' | 'history', label: string) => (
    <Pressable
      key={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: show === id }}
      onPress={() => {
        setShow(show === id ? null : id);
        setConfirm(false);
      }}
      hitSlop={4}
      style={[styles.chip, show === id && styles.chipOn]}
    >
      <HudText size={12} color={show === id ? quest.onGold : quest.text}>{`${label} ${show === id ? '▴' : '▾'}`}</HudText>
    </Pressable>
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {tab('saved', g('cheat.savedTitle', { n: saved.length }))}
        {tab('history', g('cheat.historyTitle', { n: history.length }))}
      </View>
      {show === 'saved' ? (
        saved.length === 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cheat.savedEmpty')}
          </HudText>
        ) : (
          saved.map((p) => <PlaceRow key={p.key} p={p} saved onRemove={() => store().removeSaved(p.key)} />)
        )
      ) : null}
      {show === 'history' ? (
        history.length === 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cheat.historyEmpty')}
          </HudText>
        ) : (
          <>
            {history.map((s) => (
              <SearchRow key={s.id} s={s} savedKeys={savedKeys} />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirm ? g('cheat.clearConfirm') : g('cheat.clearHistory')}
              onPress={() => {
                if (!confirm) return setConfirm(true);
                store().clearHistory();
                setConfirm(false);
              }}
              hitSlop={6}
              style={[styles.chip, confirm && styles.chipDanger]}
            >
              <HudText size={12} color={confirm ? quest.onGold : quest.textSecondary}>
                {confirm ? g('cheat.clearConfirm') : g('cheat.clearHistory')}
              </HudText>
            </Pressable>
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  chipDanger: { backgroundColor: quest.hp, borderColor: quest.hp },
  search: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
  place: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
  list: { gap: 6 },
  dish: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  round: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: quest.border },
  link: { textDecorationLine: 'underline' },
});

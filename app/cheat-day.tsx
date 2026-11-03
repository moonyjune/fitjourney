import { useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CHEAT_WHERE, dishesToLocate, type CheatWhere } from '../src/cookbook/cheat';
import { osmUrl } from '../src/cookbook/geocode';
import { canLocate, useCheatSearch } from '../src/cookbook/useCheatSearch';
import { useSpeechInput } from '../src/food/useSpeechInput';
import { BottomSheet } from '../src/components/quest/BottomSheet';
import { CheatPlacesList, DishCarousel } from '../src/components/quest/CheatPlacesList';
import { CheatPlacesSaved } from '../src/components/quest/CheatPlacesSaved';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestIcon } from '../src/components/quest/QuestIcon';
import { ScreenTemplate } from '../src/components/quest/ScreenTemplate';
import { useGameText, type GameKey } from '../src/game/strings';
import { useCookbookFinderStore } from '../src/store/useCookbookFinderStore';
import { openRecipe } from '../src/store/useRecipeViewStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest, questRadius } from '../src/theme/quest';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { WISH_MAX_CHARS } from '../supabase/functions/_shared/places';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/cookbook');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Cheat day > location chip (dialog 26): "my location" (coordinates ± m, see it on the map, drop them), or an address typed, and
 *  where to eat (cook / out / both). */
function LocationSheet({ visible, onClose, search }: { visible: boolean; onClose: () => void; search: ReturnType<typeof useCheatSearch> }) {
  const g = useGameText();
  const { location, coords, cheatWhere, busy, accuracyM, notice } = search;
  const store = () => useCookbookFinderStore.getState();
  const posNotice = notice && ['cheat.locationDenied', 'cheat.locationTimeout', 'cheat.locationFailed', 'cheat.locationUnsupported', 'cheat.addressFailed'].includes(notice) ? notice : null;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={g('rd4.cheat.whereTitle')}
      footer={<QuestButton variant="gold" title={location ? g('rd4.cheat.useArea', { area: location }) : g('common.close')} onPress={onClose} />}
    >
      <View style={styles.sheetBody}>
        {canLocate() ? (
          <QuestButton variant="mana" icon="map" title={busy === 'locate' ? g('cheat.locating') : g('rd4.cheat.useHere')} accessibilityLabel={g('cheat.useLocation')} loading={busy === 'locate'} disabled={!!busy} onPress={search.useMyLocation} />
        ) : null}
        {coords ? (
          <View style={styles.coords}>
            <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.flex}>
              {`${g('cheat.coords', { lat: coords.lat, lon: coords.lon })}${accuracyM !== null ? ` · ${g('cheat.accuracy', { m: accuracyM })}` : ''}`}
            </HudText>
            <Pressable accessibilityRole="link" accessibilityLabel={g('cheat.viewMap')} onPress={() => void Linking.openURL(osmUrl(coords.lat, coords.lon)).catch(() => undefined)} style={styles.smallBtn}>
              <HudText size={12} weight="medium" color={quest.manaText}>
                {g('cheat.viewMap')}
              </HudText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.clearCoords')} onPress={search.clearCoords} style={styles.smallBtn}>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {g('cheat.clearCoords')}
              </HudText>
            </Pressable>
          </View>
        ) : null}
        {posNotice ? (
          <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
            {g(posNotice as GameKey)}
          </HudText>
        ) : null}
        <HudText size={13} color={quest.goldLight}>
          {g('rd4.cheat.orType')}
        </HudText>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={(t) => store().setLocation(t)}
          placeholder={g('cheat.locationPlaceholder')}
          placeholderTextColor={quest.textSecondary}
          accessibilityLabel={g('cheat.location')}
          maxLength={160}
          returnKeyType="done"
        />
        <HudText size={13} color={quest.goldLight}>
          {g('cheat.where')}
        </HudText>
        <View style={styles.wrap}>
          {CHEAT_WHERE.map((w: CheatWhere) => (
            <WhereChip key={w} w={w} on={cheatWhere === w} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

function WhereChip({ w, on }: { w: CheatWhere; on: boolean }) {
  const g = useGameText();
  const label = g(`cheat.where.${w}` as GameKey);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={() => useCookbookFinderStore.getState().setCheatWhere(w)} style={[styles.chip, on && styles.chipOn]}>
      <HudText size={13} color={on ? quest.onGold : quest.text}>
        {label}
      </HudText>
    </Pressable>
  );
}

/** Cook book > 🎉 Cheat day (README §3.7, mockup 06b): one "thèm gì?" box (type or speak) and Tìm; the location chip (filled from the
 *  position when allowed, editable) and Ăn ngoài / Tự nấu; then how the AI read the wish, the dishes with photos (choose one to narrow
 *  the places), the places as short cards with a trust badge, "Chỉ đường" and ⓘ, "Gợi ý tiếp", the AI's cheat dishes (kept in the cook
 *  book), the saved places and the search history. A cheat day has no rules: no limits, no purine warnings; kcal is information only. */
export default function CheatDayScreen() {
  const g = useGameText();
  useLightStatusBar();
  const language = useSettingsStore((s) => s.language);
  const want = useCookbookFinderStore((s) => s.query);
  const cheatAiAtISO = useCookbookFinderStore((s) => s.cheatAiAtISO);
  const cheatAiReadWish = useCookbookFinderStore((s) => s.cheatAiReadWish);
  const search = useCheatSearch();
  const { busy, cheatWhere, location, coords, cheatAi, shownPlaces } = search;
  const [whereOpen, setWhereOpen] = useState(false);
  const speech = useSpeechInput(language, (t) => useCookbookFinderStore.getState().setQuery(t));
  const home = cheatWhere === 'home';
  const area = location || (coords ? g('cheat.here') : '');
  const aiAt = cheatAiAtISO ? new Date(cheatAiAtISO) : null;
  const outDishes = dishesToLocate(cheatAi, cheatWhere);
  const message = search.placesError ?? search.failure;

  return (
    <ScreenTemplate
      title={g('rd4.cheat.title')}
      eyebrow={g('rd4.cheat.eyebrow')}
      onBack={goBack}
      backLabel={g('common.back')}
      contentStyle={styles.content}
    >
      <View style={styles.wishRow}>
        <TextInput
          style={[styles.input, styles.flex]}
          value={want}
          onChangeText={(t) => useCookbookFinderStore.getState().setQuery(t)}
          onSubmitEditing={() => (home ? search.askCheat() : search.searchWish())}
          placeholder={g('rd4.cheat.wishPlaceholder')}
          placeholderTextColor={quest.textSecondary}
          accessibilityLabel={g('cheat.want')}
          maxLength={WISH_MAX_CHARS}
          returnKeyType="search"
        />
        {speech.available ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={speech.listening ? g('rd4.cheat.stopVoice') : g('rd4.cheat.voice')}
            accessibilityState={{ selected: speech.listening }}
            onPress={() => (speech.listening ? speech.stop() : speech.start(want))}
            style={[styles.iconBtn, speech.listening && styles.iconBtnOn]}
          >
            <QuestIcon name="mic" size={20} color={speech.listening ? quest.gold : quest.text} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.wrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={g('rd4.cheat.whereA11y', { area: area || g('rd4.cheat.noArea') })} onPress={() => setWhereOpen(true)} style={[styles.chip, styles.locChip]}>
          <QuestIcon name="map" size={16} color={area ? quest.text : quest.goldLight} />
          <HudText size={13} color={area ? quest.text : quest.goldLight} numberOfLines={1} style={styles.flexShrink}>
            {busy === 'locate' ? g('cheat.locating') : area || g('rd4.cheat.noArea')}
          </HudText>
        </Pressable>
        {(['out', 'home'] as const).map((w) => (
          <WhereChip key={w} w={w} on={cheatWhere === w} />
        ))}
      </View>
      <QuestButton
        variant="gold"
        icon={home ? 'bowl' : 'search'}
        title={home ? g('rd4.cheat.askDishes') : g('cheat.searchWant')}
        loading={busy === 'places' || (home && busy === 'ai')}
        disabled={!!busy}
        onPress={home ? search.askCheat : search.searchWish}
      />
      {home ? null : (
        <Pressable accessibilityRole="button" accessibilityLabel={g('cookbook.finder.suggestAi')} onPress={search.askCheat} disabled={!!busy} style={styles.link}>
          <HudText size={13} weight="medium" color={quest.manaText}>
            {busy === 'ai' ? g('dinner.asking') : g('rd4.cheat.dishesOnly')}
          </HudText>
        </Pressable>
      )}
      {busy === 'places' || busy === 'more' ? (
        <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityRole="alert">
          {g('cheat.searchingPlaces')}
        </HudText>
      ) : null}
      {message ? (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
          {message}
        </HudText>
      ) : null}
      {search.notice ? (
        <HudText size={12} weight="medium" color={quest.textSecondary} accessibilityRole="alert">
          {g(search.notice)}
        </HudText>
      ) : null}

      {shownPlaces ? (
        <View style={styles.section}>
          <CheatPlacesList
            answer={shownPlaces}
            near={search.placesNear}
            onFindDish={busy ? undefined : search.searchDish}
            savedKeys={search.savedKeys}
            onToggleSave={search.toggleSave}
            knownDishPhotos={search.knownDishPhotos}
          />
          <QuestButton variant="ghost" icon="search" title={g('rd4.cheat.more')} loading={busy === 'more'} disabled={!!busy} onPress={search.suggestMore} />
          <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.center}>
            {g('rd4.cheat.moreHint', { n: shownPlaces.places.length })}
          </HudText>
        </View>
      ) : null}

      {cheatAi.length > 0 ? (
        <View style={styles.section}>
          <HudText size={14} color={quest.goldLight} accessibilityRole="header">
            {g('cheat.fromAi', { n: cheatAi.length, time: aiAt ? `${pad(aiAt.getHours())}:${pad(aiAt.getMinutes())}` : '' })}
          </HudText>
          {cheatAiReadWish ? (
            <HudText size={13} weight="medium" color={quest.manaText}>
              {g('cheat.readWish', { text: cheatAiReadWish })}
            </HudText>
          ) : null}
          <DishCarousel
            a11y={g('cheat.fromAi', { n: cheatAi.length, time: '' })}
            onPress={(name) => {
              const idea = cheatAi.find((i) => i.name === name);
              if (idea) openRecipe(idea);
            }}
            dishes={cheatAi.map((i) => ({ name: i.name, emoji: i.recipe?.emoji, kcal: i.calories, why: i.where ? g(i.where === 'home' ? 'cheat.home' : 'cheat.out') : undefined }))}
          />
          {!home && outDishes.length > 0 ? (
            <View style={styles.wrap}>
              {outDishes.map((d) => (
                <Pressable key={d} accessibilityRole="button" accessibilityLabel={g('cheat.findForDish', { dish: d })} onPress={() => search.searchDish(d)} disabled={!!busy} style={styles.chip}>
                  <HudText size={12} color={quest.text}>
                    {g('cheat.findForDish', { dish: d })}
                  </HudText>
                </Pressable>
              ))}
              <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.findPlaces')} onPress={search.searchAiDishes} disabled={!!busy} style={styles.chip}>
                <HudText size={12} color={quest.manaText}>
                  {g('cheat.findPlaces')}
                </HudText>
              </Pressable>
            </View>
          ) : null}
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`${g('cheat.saved')} · ${g('swap.disclaimer')}`}
          </HudText>
        </View>
      ) : null}

      <CheatPlacesSaved />
      <LocationSheet visible={whereOpen} onClose={() => setWhereOpen(false)} search={search} />
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  wishRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: quest.border, borderRadius: questRadius.row, paddingHorizontal: 12, paddingVertical: 10, color: quest.text, backgroundColor: quest.panel, fontSize: 15 },
  iconBtn: { width: 48, height: 48, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  iconBtnOn: { borderColor: quest.gold },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  chipOn: { backgroundColor: quest.gold, borderColor: quest.gold },
  locChip: { maxWidth: '100%' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 10, marginTop: 4 },
  sheetBody: { gap: 12, paddingBottom: 8 },
  coords: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  smallBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});

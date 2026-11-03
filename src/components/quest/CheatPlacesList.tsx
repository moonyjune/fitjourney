import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { CheatPlace, CheatPlacesAnswer, PlacePhoto } from '../../../supabase/functions/_shared/places';
import { mapsSearchUrl, placeNameKey, urlHost } from '../../../supabase/functions/_shared/places';
import { placePhotoForDish, savedPlaceKey } from '../../cookbook/placesHistory';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { DishPhoto, DishPhotoCredit, WebPhotoCredit } from './DishPhoto';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10" or "2026-10-05" as "10/2026" or "05/10/2026". */
export const reviewDateText = (d: string): string => (d.length === 7 ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);
/** "1.2k" for 1200. */
export const countText = (n: number): string => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString()}k` : String(n));

const LEVEL_COLOR = { high: quest.manaText, medium: quest.goldLight, low: quest.hpText } as const;

/** The link "Chỉ đường" opens: the place's own Maps page when the search saw it, else a Maps search for its name and address. */
export const directionsUrl = (p: Pick<CheatPlace, 'name' | 'address' | 'mapsUrl'>, near: string): string => p.mapsUrl ?? mapsSearchUrl(p.name, p.address, near);
const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

function Link({ url, label }: { url: string; label: string }) {
  const g = useGameText();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={g('cheat.openLink', { name: label })} onPress={() => open(url)} hitSlop={6} style={styles.linkRow}>
      <HudText size={13} weight="medium" color={quest.text} style={styles.flex} numberOfLines={1}>
        {label}
      </HudText>
      <HudText size={12} weight="medium" color={quest.manaText}>
        {g('rd4.place.open')}
      </HudText>
    </Pressable>
  );
}

/** A place's real photo from the web (wide, rounded) with its credit; nothing when it has none or the picture does not load (a site
 *  may refuse a picture shown from elsewhere). */
export function PlacePhotoView({ photo, name, height = 150 }: { photo: PlacePhoto | null | undefined; name: string; height?: number }) {
  const g = useGameText();
  const [broken, setBroken] = useState<string | null>(null);
  if (!photo || broken === photo.url) return null;
  return (
    <View style={styles.photoWrap}>
      <Image
        source={{ uri: photo.url }}
        onError={() => setBroken(photo.url)}
        accessibilityLabel={g('cheat.photoA11y', { name })}
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        style={[styles.photo, { height }]}
      />
      <WebPhotoCredit photo={photo} name={name} />
    </View>
  );
}

/** The star of a place: "☆ Lưu quán" / "⭐ Đã lưu". */
export function SaveStar({ name, saved, onPress }: { name: string; saved: boolean; onPress: () => void }) {
  const g = useGameText();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? g('cheat.unsaveA11y', { name }) : g('cheat.saveA11y', { name })}
      accessibilityState={{ selected: saved }}
      onPress={onPress}
      style={[styles.star, saved && styles.starOn]}
    >
      <HudText size={12} color={saved ? quest.goldLight : quest.text}>
        {saved ? g('cheat.unsave') : g('cheat.save')}
      </HudText>
    </Pressable>
  );
}

/** "Chỉ đường": one tap to Google Maps. */
export function DirectionsButton({ url, name }: { url: string; name: string }) {
  const g = useGameText();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={g('rd4.place.directionsA11y', { name })} onPress={() => open(url)} style={styles.dirBtn}>
      <QuestIcon name="map" size={16} color={quest.onGold} />
      <HudText size={13} color={quest.onGold}>
        {g('rd4.place.directions')}
      </HudText>
    </Pressable>
  );
}

/** The one trust badge of a place ("Tin cậy cao / vừa / thấp"). */
function TrustBadge({ level }: { level: CheatPlace['reliability']['level'] }) {
  const g = useGameText();
  return (
    <View style={[styles.badge, { borderColor: LEVEL_COLOR[level] }]}>
      <HudText size={11} weight="semibold" color={LEVEL_COLOR[level]} numberOfLines={1}>
        {g(`rd4.trust.${level}` as GameKey)}
      </HudText>
    </View>
  );
}

/** ★ 4.5 (1.2k) · ~1.1 km · 45–65k · open status. */
function factsLine(p: CheatPlace, g: ReturnType<typeof useGameText>): string {
  return [
    p.rating ? `★ ${p.rating.value}${p.rating.count !== null ? ` (${countText(p.rating.count)})` : ''}` : g('rd4.place.noRating'),
    p.distanceKm !== null ? g('cheat.distance', { km: p.distanceKm }) : null,
    p.priceRange,
    p.openStatus ?? g('rd4.place.openUnknown'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** One place as a short card (06b): name, one trust badge, ★ (count) · km · price · open, one review line, "Chỉ đường", ☆ and ⓘ. */
function PlaceCard({ p, near, saved, onToggleSave, onInfo }: { p: CheatPlace; near: string; saved?: boolean; onToggleSave?: (p: CheatPlace) => void; onInfo: () => void }) {
  const g = useGameText();
  const review = p.reviews[0];
  return (
    <View style={styles.place} accessibilityLabel={p.name}>
      <PlacePhotoView photo={p.photo} name={p.name} height={120} />
      <View style={styles.titleRow}>
        <HudText size={15} style={styles.flex} numberOfLines={2}>
          {p.name}
        </HudText>
        <TrustBadge level={p.reliability.level} />
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
        {factsLine(p, g)}
      </HudText>
      {review ? (
        <HudText size={12} weight="medium" color={quest.text} numberOfLines={2}>
          {`“${review.text}” — ${review.source}`}
        </HudText>
      ) : null}
      <View style={styles.actions}>
        <DirectionsButton url={directionsUrl(p, near)} name={p.name} />
        {onToggleSave ? <SaveStar name={p.name} saved={!!saved} onPress={() => onToggleSave(p)} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={g('rd4.place.info', { name: p.name })} onPress={onInfo} style={styles.round}>
          <HudText size={16} color={quest.textSecondary}>
            ⓘ
          </HudText>
        </Pressable>
      </View>
    </View>
  );
}

/** Cheat day > place > ⓘ (dialog 25): everything the short card leaves out: photo with credit, dish, price, distance, address, how
 *  reliable and why, the rating and its source, reviews with date and link, opening hours, when it was checked, the sources, how many
 *  web searches the AI made, what it dropped, search errors and the warning that web information may be old or an ad. */
export function PlaceInfoSheet({ place, answer, near, saved, onToggleSave, onClose }: { place: CheatPlace | null; answer: CheatPlacesAnswer; near: string; saved?: boolean; onToggleSave?: (p: CheatPlace) => void; onClose: () => void }) {
  const g = useGameText();
  if (!place) return null;
  const p = place;
  const r = p.reliability;
  const at = new Date(answer.checkedAtISO);
  const checked = `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const why = [
    g('cheat.rel.sites', { n: r.sites }),
    r.newestReview ? g('cheat.rel.newest', { date: reviewDateText(r.newestReview) }) : g('cheat.rel.noDated'),
    ...(p.sponsored ? [g('cheat.rel.sponsored')] : []),
    ...(r.capped ? [g('cheat.rel.capped')] : []),
    ...r.reasons,
  ];
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={p.name}
      eyebrow={answer.sample ? g('cheat.sample') : undefined}
      footer={
        <View style={styles.actions}>
          <View style={styles.flex}>{onToggleSave ? <SaveStar name={p.name} saved={!!saved} onPress={() => onToggleSave(p)} /> : null}</View>
          <DirectionsButton url={directionsUrl(p, near)} name={p.name} />
        </View>
      }
    >
      <View style={styles.info}>
        <PlacePhotoView photo={p.photo} name={p.name} />
        <HudText size={13} weight="medium" color={quest.text}>
          {[g('cheat.dish', { dish: p.dish }), p.priceRange ? g('cheat.price', { price: p.priceRange }) : null, p.distanceKm !== null ? g('cheat.distance', { km: p.distanceKm }) : null, p.address].filter(Boolean).join(' · ')}
        </HudText>
        <View style={styles.infoBox}>
          <HudText size={13} color={LEVEL_COLOR[r.level]}>
            {g(`cheat.rel.${r.level}` as GameKey)}
          </HudText>
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {why.join(' · ')}
          </HudText>
        </View>
        <HudText size={13} weight="medium" color={p.rating ? quest.text : quest.textSecondary}>
          {p.rating
            ? p.rating.count !== null
              ? g('cheat.rating', { source: p.rating.source, value: p.rating.value, count: countText(p.rating.count) })
              : g('cheat.ratingNoCount', { source: p.rating.source, value: p.rating.value })
            : g('cheat.noRating')}
        </HudText>
        {p.reviews.length === 0 ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {g('cheat.noReviews')}
          </HudText>
        ) : (
          p.reviews.map((rv) => (
            <View key={`${rv.url}-${rv.text.slice(0, 20)}`} style={styles.review}>
              <HudText size={12} weight="medium">
                {g('cheat.review', { text: rv.text, source: rv.source, date: rv.date ? reviewDateText(rv.date) : g('cheat.noDate') })}
              </HudText>
              <Link url={rv.url} label={urlHost(rv.url)} />
            </View>
          ))
        )}
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {`${p.openStatus ? g('cheat.openStatus', { status: p.openStatus }) : g('cheat.openUnknown')} · ${g('cheat.checked', { date: checked })}`}
        </HudText>
        <HudText size={13} color={quest.goldLight}>
          {g('cheat.sources')}
        </HudText>
        <Link url={directionsUrl(p, near)} label={p.mapsUrl ? g('cheat.mapsPage') : g('cheat.mapsSearch')} />
        {p.rating && !p.sources.some((s) => s.url === p.rating!.url) ? <Link url={p.rating.url} label={p.rating.source} /> : null}
        {p.sources.map((s) => (
          <Link key={s.url} url={s.url} label={s.title || urlHost(s.url)} />
        ))}
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {[
            ...(answer.sample ? [] : [g('cheat.searches', { n: answer.searches })]),
            ...(answer.dropped > 0 ? [g('cheat.dropped', { n: answer.dropped })] : []),
            ...(answer.searchErrors.length > 0 ? [g('cheat.searchErrors', { codes: answer.searchErrors.join(', ') })] : []),
            ...(answer.note ? [answer.note] : []),
          ].join(' ')}
        </HudText>
        <HudText size={12} weight="medium" color={quest.goldLight}>
          {g('cheat.disclaimer')}
        </HudText>
      </View>
    </BottomSheet>
  );
}

export interface CarouselDish {
  name: string;
  emoji?: string | null;
  kcal: number | null;
  why?: string;
  known?: PlacePhoto | null;
  fallback?: PlacePhoto | null;
}

/** A row of dish cards with photos that scrolls sideways (06b). The chosen one is outlined in gold. */
export function DishCarousel({ dishes, selected, onPress, a11y }: { dishes: CarouselDish[]; selected?: string | null; onPress: (name: string) => void; a11y: string }) {
  const g = useGameText();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} accessibilityLabel={a11y}>
      {dishes.map((d) => {
        const on = selected === d.name;
        return (
          <Pressable key={d.name} accessibilityRole="button" accessibilityLabel={d.name} accessibilityState={{ selected: on }} onPress={() => onPress(d.name)} style={[styles.dish, on && styles.dishOn]}>
            <DishPhoto name={d.name} emoji={d.emoji ?? '🍽'} size={92} radius={0} known={d.known ?? null} fallback={d.fallback ?? null} fill />
            <View style={styles.dishBody}>
              <HudText size={13} numberOfLines={2}>
                {d.name}
              </HudText>
              {d.kcal !== null ? (
                <HudText size={12} weight="medium" color={quest.goldLight}>
                  {g('cheat.dishKcal', { kcal: d.kcal })}
                </HudText>
              ) : null}
              {d.why ? (
                <HudText size={11} weight="medium" color={quest.textSecondary} numberOfLines={2}>
                  {d.why}
                </HudText>
              ) : null}
              <DishPhotoCredit name={d.name} known={d.known ?? null} fallback={d.fallback ?? null} />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The answer of a places search (06b): how the AI read the wish, the dishes with their photos (choosing one narrows the places to it
 *  and offers a search for that dish alone), then the places as short cards, nearest first; the details of each are in its ⓘ sheet.
 *  Sample data of the dev account is labelled as such. */
export function CheatPlacesList({
  answer,
  near,
  onFindDish,
  savedKeys,
  onToggleSave,
  knownDishPhotos,
}: {
  answer: CheatPlacesAnswer;
  near: string;
  onFindDish?: (dish: string) => void;
  savedKeys?: Set<string>;
  onToggleSave?: (p: CheatPlace) => void;
  knownDishPhotos?: Record<string, PlacePhoto>;
}) {
  const g = useGameText();
  const [dish, setDish] = useState<string | null>(null);
  const [info, setInfo] = useState<CheatPlace | null>(null);
  const shown = dish ? answer.places.filter((p) => placeNameKey(p.dish) === placeNameKey(dish)) : answer.places;
  const isSaved = (p: CheatPlace) => !!savedKeys?.has(savedPlaceKey(p.name, p.address));
  return (
    <View style={styles.section}>
      {answer.sample ? (
        <HudText size={12} color={quest.hpText} accessibilityRole="alert">
          {g('cheat.sample')}
        </HudText>
      ) : null}
      {answer.readWish ? (
        <HudText size={13} weight="medium" color={quest.manaText}>
          {g('cheat.readWish', { text: answer.readWish })}
        </HudText>
      ) : null}
      {answer.dishes.length > 0 ? (
        <>
          <HudText size={13} color={quest.goldLight} accessibilityRole="header">
            {g('cheat.wishDishes', { n: answer.dishes.length })}
          </HudText>
          <DishCarousel
            a11y={g('cheat.wishDishes', { n: answer.dishes.length })}
            selected={dish}
            onPress={(name) => setDish(dish === name ? null : name)}
            dishes={answer.dishes.map((d) => ({
              name: d.name,
              emoji: d.emoji,
              kcal: d.kcal,
              why: d.why,
              known: d.photo ?? knownDishPhotos?.[placeNameKey(d.name)] ?? null,
              fallback: placePhotoForDish(d.name, answer.places),
            }))}
          />
          {dish && onFindDish ? <QuestButton variant="ghost" icon="search" title={g('cheat.findForDish', { dish })} onPress={() => onFindDish(dish)} /> : null}
        </>
      ) : null}
      <View style={styles.titleRow}>
        <HudText size={14} color={quest.goldLight} style={styles.flex} accessibilityRole="header">
          {dish ? g('rd4.places.forDish', { dish, n: shown.length }) : g('rd4.places.title', { n: answer.places.length })}
        </HudText>
      </View>
      {near ? (
        <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
          {g('cheat.placesNear', { where: near })}
        </HudText>
      ) : null}
      {shown.length === 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.placesNone')}
        </HudText>
      ) : (
        shown.map((p) => <PlaceCard key={`${p.dish}-${p.name}`} p={p} near={near} saved={isSaved(p)} onToggleSave={onToggleSave} onInfo={() => setInfo(p)} />)
      )}
      {answer.notFound.length > 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.notFound', { dishes: answer.notFound.join(', ') })}
        </HudText>
      ) : null}
      <PlaceInfoSheet place={info} answer={answer} near={near} saved={info ? isSaved(info) : false} onToggleSave={onToggleSave} onClose={() => setInfo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  place: { gap: 6, padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1.2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: quest.gold },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: quest.border },
  star: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border },
  starOn: { borderColor: quest.gold },
  photoWrap: { gap: 2 },
  photo: { width: '100%', borderRadius: questRadius.row, backgroundColor: quest.raised2 },
  info: { gap: 10, paddingBottom: 8 },
  infoBox: { gap: 4, padding: 10, borderRadius: questRadius.row, backgroundColor: quest.bg },
  review: { gap: 2, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: quest.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: questRadius.row, backgroundColor: quest.bg },
  carousel: { gap: 10, paddingRight: 8 },
  dish: { width: 140, overflow: 'hidden', borderRadius: 14, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  dishOn: { borderColor: quest.gold },
  dishBody: { gap: 2, padding: 8 },
});

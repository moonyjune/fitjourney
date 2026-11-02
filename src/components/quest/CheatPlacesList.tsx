import { useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import type { CheatPlace, CheatPlacesAnswer, PlacePhoto } from '../../../supabase/functions/_shared/places';
import { mapsSearchUrl, placeNameKey, urlHost } from '../../../supabase/functions/_shared/places';
import { placePhotoForDish, savedPlaceKey } from '../../cookbook/placesHistory';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { DishPhoto, DishPhotoCredit, WebPhotoCredit } from './DishPhoto';
import { HudText } from './HudText';

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-10" or "2026-10-05" as "10/2026" or "05/10/2026". */
export const reviewDateText = (d: string): string => (d.length === 7 ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`);
/** "1.2k" for 1200. */
const countText = (n: number): string => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString()}k` : String(n));

const LEVEL_COLOR = { high: quest.manaText, medium: quest.goldLight, low: quest.hpText } as const;

function Link({ url, label }: { url: string; label: string }) {
  const g = useGameText();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={g('cheat.openLink', { name: label })} onPress={() => void Linking.openURL(url).catch(() => undefined)} hitSlop={6}>
      <HudText size={12} weight="medium" color={quest.manaText} style={styles.link}>
        {`🔗 ${label}`}
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
      hitSlop={6}
      style={[styles.star, saved && styles.starOn]}
    >
      <HudText size={12} color={saved ? quest.goldLight : quest.text}>
        {saved ? g('cheat.unsave') : g('cheat.save')}
      </HudText>
    </Pressable>
  );
}

function PlaceCard({ p, checked, near, saved, onToggleSave }: { p: CheatPlace; checked: string; near: string; saved?: boolean; onToggleSave?: (p: CheatPlace) => void }) {
  const g = useGameText();
  const r = p.reliability;
  const why = [
    g('cheat.rel.sites', { n: r.sites }),
    r.newestReview ? g('cheat.rel.newest', { date: reviewDateText(r.newestReview) }) : g('cheat.rel.noDated'),
    ...(p.sponsored ? [g('cheat.rel.sponsored')] : []),
    ...(r.capped ? [g('cheat.rel.capped')] : []),
    ...r.reasons,
  ];
  return (
    <View style={styles.place} accessibilityLabel={p.name}>
      <PlacePhotoView photo={p.photo} name={p.name} />
      <View style={styles.titleRow}>
        <HudText size={14} style={styles.flex}>{`📍 ${p.name}${p.distanceKm !== null ? ` · ${g('cheat.distance', { km: p.distanceKm })}` : ''}`}</HudText>
        {onToggleSave ? <SaveStar name={p.name} saved={!!saved} onPress={() => onToggleSave(p)} /> : null}
      </View>
      <HudText size={12} weight="medium" color={quest.textSecondary}>
        {g('cheat.dish', { dish: p.dish })}
        {p.address ? ` · ${p.address}` : ''}
      </HudText>
      {/* The place's own Maps page when the search saw it, else a Maps search for its name and address (not a claim). */}
      <Link url={p.mapsUrl ?? mapsSearchUrl(p.name, p.address, near)} label={p.mapsUrl ? g('cheat.mapsPage') : g('cheat.mapsSearch')} />
      {p.priceRange ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.price', { price: p.priceRange })}
        </HudText>
      ) : null}
      <HudText size={12} weight="medium" color={p.rating ? quest.text : quest.textSecondary}>
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
        {p.openStatus ? g('cheat.openStatus', { status: p.openStatus }) : g('cheat.openUnknown')}
      </HudText>
      <HudText size={12} color={LEVEL_COLOR[r.level]}>
        {g(`cheat.rel.${r.level}` as GameKey)}
      </HudText>
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {why.join(' · ')}
      </HudText>
      {(p.sources.length > 0 || p.rating) && (
        <View style={styles.links}>
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {`${g('cheat.sources')}:`}
          </HudText>
          {p.rating && !p.sources.some((s) => s.url === p.rating!.url) ? <Link url={p.rating.url} label={p.rating.source} /> : null}
          {p.sources.map((s) => (
            <Link key={s.url} url={s.url} label={s.title || urlHost(s.url)} />
          ))}
        </View>
      )}
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {g('cheat.checked', { date: checked })}
      </HudText>
    </View>
  );
}

/** The answer of "find places": how the AI read the wish, the dishes that fit it (each with a "find places" chip when `onFindDish` is
 *  given; nothing is logged; each with its real photo when one is found, else its emoji), then the places found, nearest first:
 *  distance and a Google Maps link, rating with its source, recent reviews with date and link, sources, when it was checked and how
 *  reliable it is (and why). Each place shows its real photo from the web when one was found, and a star to save it; a dish without
 *  a photo of its own shows the photo of a place found for it. Sample data of the dev account is labelled as such. */
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
  /** Keys (`savedPlaceKey`) of the places saved, and how a star is toggled; no star without it. */
  savedKeys?: Set<string>;
  onToggleSave?: (p: CheatPlace) => void;
  /** Dish photos already known (kept with the saved search), by `placeNameKey` of the dish name. */
  knownDishPhotos?: Record<string, PlacePhoto>;
}) {
  const g = useGameText();
  const at = new Date(answer.checkedAtISO);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const checked = `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()} ${time}`;
  return (
    <View style={styles.section}>
      {answer.sample ? (
        <HudText size={12} color={quest.hpText} accessibilityRole="alert">
          {g('cheat.sample')}
        </HudText>
      ) : null}
      {answer.readWish ? (
        <HudText size={12} weight="medium" color={quest.manaText}>
          {g('cheat.readWish', { text: answer.readWish })}
        </HudText>
      ) : null}
      {answer.dishes.length > 0 ? (
        <>
          <HudText size={13} color={quest.goldLight}>
            {g('cheat.wishDishes', { n: answer.dishes.length })}
          </HudText>
          {answer.dishes.map((d) => {
            const known = d.photo ?? knownDishPhotos?.[placeNameKey(d.name)] ?? null;
            const fallback = placePhotoForDish(d.name, answer.places);
            return (
            <View key={d.name} style={styles.dish} accessibilityLabel={d.name}>
              <DishPhoto name={d.name} emoji={d.emoji ?? '🍽'} size={64} known={known} fallback={fallback} />
              <View style={styles.dishText}>
                <HudText size={14}>{`${d.name}${d.kcal !== null ? ` · ${g('cheat.dishKcal', { kcal: d.kcal })}` : ''}`}</HudText>
                {d.why ? (
                  <HudText size={12} weight="medium" color={quest.textSecondary}>
                    {d.why}
                  </HudText>
                ) : null}
                {onFindDish ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={g('cheat.findForDish', { dish: d.name })} onPress={() => onFindDish(d.name)} hitSlop={6}>
                    <HudText size={12} weight="medium" color={quest.manaText} style={styles.link}>
                      {g('cheat.findForDish', { dish: d.name })}
                    </HudText>
                  </Pressable>
                ) : null}
                <DishPhotoCredit name={d.name} known={known} fallback={fallback} />
              </View>
            </View>
            );
          })}
        </>
      ) : null}
      <HudText size={13} color={quest.goldLight}>
        {g('cheat.places', { n: answer.places.length, time })}
      </HudText>
      {near ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.placesNear', { where: near })}
        </HudText>
      ) : null}
      {answer.places.length === 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.placesNone')}
        </HudText>
      ) : (
        answer.places.map((p) => (
          <PlaceCard key={`${p.dish}-${p.name}`} p={p} checked={checked} near={near} saved={savedKeys?.has(savedPlaceKey(p.name, p.address))} onToggleSave={onToggleSave} />
        ))
      )}
      {answer.notFound.length > 0 ? (
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('cheat.notFound', { dishes: answer.notFound.join(', ') })}
        </HudText>
      ) : null}
      {answer.note ? (
        <HudText size={11} weight="medium" color={quest.textSecondary}>
          {answer.note}
        </HudText>
      ) : null}
      <HudText size={11} weight="medium" color={quest.textSecondary}>
        {[
          ...(answer.sample ? [] : [g('cheat.searches', { n: answer.searches })]),
          ...(answer.dropped > 0 ? [g('cheat.dropped', { n: answer.dropped })] : []),
          ...(answer.searchErrors.length > 0 ? [g('cheat.searchErrors', { codes: answer.searchErrors.join(', ') })] : []),
          g('cheat.disclaimer'),
        ].join(' ')}
      </HudText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6, marginTop: 4 },
  place: { gap: 3, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.bg },
  review: { gap: 1, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: quest.border },
  dish: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.bg },
  dishText: { flex: 1, minWidth: 0, gap: 2 },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  link: { textDecorationLine: 'underline' },
  flex: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  star: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, borderWidth: 1.5, borderColor: quest.border },
  starOn: { borderColor: quest.gold },
  photoWrap: { gap: 2, marginBottom: 4 },
  photo: { width: '100%', borderRadius: questRadius.row, backgroundColor: quest.raised2 },
});

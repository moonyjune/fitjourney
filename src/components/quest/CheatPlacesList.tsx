import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { CheatPlace, CheatPlacesAnswer } from '../../../supabase/functions/_shared/places';
import { mapsSearchUrl, urlHost } from '../../../supabase/functions/_shared/places';
import { useGameText, type GameKey } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
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

function PlaceCard({ p, checked, near }: { p: CheatPlace; checked: string; near: string }) {
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
      <HudText size={14}>{`📍 ${p.name}${p.distanceKm !== null ? ` · ${g('cheat.distance', { km: p.distanceKm })}` : ''}`}</HudText>
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
 *  given; nothing is logged), then the places found, nearest first: distance and a Google Maps link, rating with its source, recent
 *  reviews with date and link, sources, when it was checked and how reliable it is (and why). Sample data of the dev account is
 *  labelled as such. */
export function CheatPlacesList({ answer, near, onFindDish }: { answer: CheatPlacesAnswer; near: string; onFindDish?: (dish: string) => void }) {
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
          {answer.dishes.map((d) => (
            <View key={d.name} style={styles.dish} accessibilityLabel={d.name}>
              <HudText size={14}>{`${d.emoji ?? '🍽'} ${d.name}${d.kcal !== null ? ` · ${g('cheat.dishKcal', { kcal: d.kcal })}` : ''}`}</HudText>
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
            </View>
          ))}
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
        answer.places.map((p) => <PlaceCard key={`${p.dish}-${p.name}`} p={p} checked={checked} near={near} />)
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
  dish: { gap: 2, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.bg },
  links: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  link: { textDecorationLine: 'underline' },
});

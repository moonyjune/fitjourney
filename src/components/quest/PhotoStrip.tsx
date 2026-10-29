import { useRef, useState } from 'react';
import { Image, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

export interface StripPhoto {
  uri: string;
  label?: string;
  /** Which meal and when, e.g. "Tối · 19:30", shown under the photo in view. */
  caption?: string;
}

interface Props {
  photos: StripPhoto[];
  /** Height of each photo. */
  height?: number;
  /** Told which photo is in view (0-based), e.g. so "remove" acts on it. */
  onIndex?: (index: number) => void;
}

/** The photos of one meal side by side in a row: swipe, or use ‹ › to move one photo at a time; "2/3" says which photo is in view
 *  (worked out from the scroll position while swiping, so it always matches the photo shown).
 *  A photo that cannot be loaded (its file is on another device) says so instead of staying blank. */
export function PhotoStrip({ photos, height = 280, onIndex }: Props) {
  const g = useGameText();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const at = Math.min(index, Math.max(0, photos.length - 1));

  function show(next: number) {
    const i = Math.max(0, Math.min(photos.length - 1, next));
    setIndex(i);
    onIndex?.(i);
    scroller.current?.scrollTo?.({ x: i * width, animated: true });
  }
  /** The photo whose page covers most of the view. Read on every scroll event, not only when a swipe ends: on the web the end
   *  events come before the page has snapped (or not at all), which left "1/2" on the second photo. */
  function track(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    const i = Math.max(0, Math.min(photos.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (i !== at) {
      setIndex(i);
      onIndex?.(i);
    }
  }

  const many = photos.length > 1;
  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={track}
        onMomentumScrollEnd={track}
        scrollEventThrottle={16}
      >
        {photos.map((p, i) => (
          <View key={`${i}-${p.uri.slice(-40)}`} style={[styles.page, { width: width || undefined, height }]}>
            {broken[p.uri] ? (
              <HudText size={12} weight="medium" color={quest.hpText}>
                {g('photo.unavailable')}
              </HudText>
            ) : (
              <Image
                source={{ uri: p.uri }}
                onError={() => setBroken((b) => ({ ...b, [p.uri]: true }))}
                resizeMode="contain"
                accessibilityLabel={g('photo.strip.alt', { n: i + 1, total: photos.length, name: p.label ?? '' })}
                style={[styles.photo, { height }]}
              />
            )}
          </View>
        ))}
      </ScrollView>
      {photos[at]?.caption ? (
        <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.caption}>
          {photos[at].caption}
        </HudText>
      ) : null}
      {many && (
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('photo.strip.prev')}
            accessibilityState={{ disabled: at === 0 }}
            disabled={at === 0}
            hitSlop={6}
            onPress={() => show(at - 1)}
            style={[styles.arrow, at === 0 && styles.off]}
          >
            <QuestIcon name="chevronLeft" size={18} color={quest.gold} strokeWidth={2.4} />
          </Pressable>
          <HudText size={12} color={quest.textSecondary} accessibilityLiveRegion="polite">
            {g('photo.strip.position', { n: at + 1, total: photos.length })}
          </HudText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('photo.strip.next')}
            accessibilityState={{ disabled: at === photos.length - 1 }}
            disabled={at === photos.length - 1}
            hitSlop={6}
            onPress={() => show(at + 1)}
            style={[styles.arrow, at === photos.length - 1 && styles.off]}
          >
            <QuestIcon name="chevron" size={18} color={quest.gold} strokeWidth={2.4} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  page: { alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', borderRadius: questRadius.row, backgroundColor: quest.raised },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
  off: { opacity: 0.4 },
  caption: { textAlign: 'center' },
});

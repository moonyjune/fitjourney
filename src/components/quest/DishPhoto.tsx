import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { dropDishPhoto, useDishPhoto } from '../../ai/useDishPhotos';
import type { PlacePhoto } from '../../../supabase/functions/_shared/places';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { HudText } from './HudText';
import { NATIVE_DRIVER, useMotionEnabled } from './motion/tokens';

/** A soft pulse over the picture's place while its photo is asked for or loading (still with reduced motion). */
function Shimmer({ radius }: { radius: number }) {
  const motion = useMotionEnabled();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!motion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [motion, pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      testID="dish-photo-shimmer"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: quest.text, opacity: motion ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.14] }) : 0.08 }]}
    />
  );
}

export interface DishPhotoProps {
  /** The dish name the photo is looked up by. */
  name: string;
  /** Shown when there is no photo (none found, AI off, offline, did not load) and while it is asked for. */
  emoji: string;
  size: number;
  radius?: number;
  /** Background of the emoji badge. */
  color?: string;
  /** Ask for nothing (e.g. the item already has its own picture): the emoji only. */
  off?: boolean;
  /** A photo already known for the dish (kept with a saved search): shown without asking. */
  known?: PlacePhoto | null;
  /** Shown when the dish has no photo of its own: e.g. the web photo of a place found for that very dish. */
  fallback?: PlacePhoto | null;
  style?: StyleProp<ViewStyle>;
}

/** The web photo to show instead of an asked-for one: the known photo, else (once the ask found none) the fallback. */
function otherPhoto(state: ReturnType<typeof useDishPhoto>, known?: PlacePhoto | null, fallback?: PlacePhoto | null): PlacePhoto | null {
  if (known) return known;
  return fallback && state?.status === 'done' && !state.photo ? fallback : null;
}

/** A dish's real photo (rounded, a shimmer until it is there), or its emoji when there is none. The credit goes next to it with
 *  `DishPhotoCredit`. */
export function DishPhoto({ name, emoji, size, radius = 10, color = quest.raised2, off, known, fallback, style }: DishPhotoProps) {
  const g = useGameText();
  const state = useDishPhoto(off || known ? null : name);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const other = otherPhoto(state, known, fallback);
  const photo = known ? null : state?.status === 'done' ? state.photo : null;
  const asking = !off && !known && (!state || state.status === 'loading');
  const box = { width: size, height: size, borderRadius: radius };
  if (other && brokenUrl !== other.url) {
    // A picture hot-linked from a web page may be refused: the emoji then.
    return (
      <View style={[styles.box, box, { backgroundColor: color }, style]}>
        {loadedUrl !== other.url && <Shimmer radius={radius} />}
        <Image
          source={{ uri: other.url }}
          onLoad={() => setLoadedUrl(other.url)}
          onError={() => setBrokenUrl(other.url)}
          accessibilityLabel={g('dishPhoto.a11y', { name })}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={box}
        />
      </View>
    );
  }
  if (photo) {
    return (
      <View style={[styles.box, box, { backgroundColor: color }, style]}>
        {loadedUrl !== photo.url && <Shimmer radius={radius} />}
        <Image
          source={{ uri: photo.url }}
          onLoad={() => setLoadedUrl(photo.url)}
          onError={() => dropDishPhoto(name)}
          accessibilityLabel={g('dishPhoto.a11y', { name })}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={box}
        />
      </View>
    );
  }
  return (
    <View style={[styles.box, styles.center, box, { backgroundColor: color }, style]}>
      <HudText size={Math.round(size * 0.5)}>{emoji}</HudText>
      {asking && <Shimmer radius={radius} />}
    </View>
  );
}

/** The credit line of a dish's photo ("Ảnh: author · licence · Wikimedia"), which opens the photo's page; nothing without a photo. */
export function DishPhotoCredit({ name, off, known, fallback }: { name: string; off?: boolean; known?: PlacePhoto | null; fallback?: PlacePhoto | null }) {
  const g = useGameText();
  const state = useDishPhoto(off || known ? null : name);
  const other = otherPhoto(state, known, fallback);
  if (other) return <WebPhotoCredit photo={other} name={name} />;
  if (off || state?.status !== 'done' || !state.photo) return null;
  const p = state.photo;
  const text = state.sample ? g('dishPhoto.sample') : g('dishPhoto.credit', { author: p.author, license: p.license, source: p.source === 'wikimedia' ? 'Wikimedia' : 'Openverse' });
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={g('dishPhoto.creditA11y', { name })} onPress={() => void Linking.openURL(p.sourceUrl).catch(() => undefined)} hitSlop={4}>
      <HudText size={10} weight="medium" color={quest.textTertiary} numberOfLines={1}>
        {text}
      </HudText>
    </Pressable>
  );
}

/** "Ảnh: foody.vn": the credit of a photo from a web page, which opens that page. */
export function WebPhotoCredit({ photo, name }: { photo: PlacePhoto; name: string }) {
  const g = useGameText();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={g('dishPhoto.creditA11y', { name })} onPress={() => void Linking.openURL(photo.pageUrl).catch(() => undefined)} hitSlop={4}>
      <HudText size={10} weight="medium" color={quest.textTertiary} numberOfLines={1}>
        {g('cheat.photoCredit', { source: photo.credit })}
      </HudText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});

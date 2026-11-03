import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PlacePhoto } from '../../../supabase/functions/_shared/places';
import { useGameText } from '../../game/strings';
import { quest } from '../../theme/quest';
import { DishPhoto } from './DishPhoto';

// Emoji and background by kind of dish, for when there is no photo (README §2.4: never a grey box).
const KINDS: { match: RegExp; emoji: string; tint: string }[] = [
  { match: /bánh mì|banh mi|sandwich|bread/i, emoji: '🥖', tint: '#2A2210' },
  { match: /phở|pho|bún|bun|mì|mi |miến|hủ tiếu|noodle|ramen|udon/i, emoji: '🍜', tint: '#2A2210' },
  { match: /cơm|com |rice|xôi|cháo/i, emoji: '🍚', tint: quest.raised2 },
  { match: /salad|rau|gỏi|nộm|veg/i, emoji: '🥗', tint: '#16301A' },
  { match: /cá|tôm|mực|hải sản|fish|shrimp|seafood|sushi/i, emoji: '🐟', tint: quest.manaPanel },
  { match: /gà|chicken|vịt|duck/i, emoji: '🍗', tint: '#2A2210' },
  { match: /bò|heo|lợn|thịt|beef|pork|meat|steak|sườn/i, emoji: '🥩', tint: quest.bossPanel },
  { match: /trứng|egg/i, emoji: '🥚', tint: '#2A2210' },
  { match: /trà|sữa|cà phê|coffee|tea|milk|nước ép|sinh tố|smoothie|juice/i, emoji: '🥤', tint: quest.manaPanel },
  { match: /chè|kem|bánh ngọt|cake|dessert|ice cream/i, emoji: '🍧', tint: quest.bossPanel },
  { match: /trái cây|chuối|táo|cam|fruit|banana|apple/i, emoji: '🍎', tint: '#16301A' },
];

/** The emoji and background shown for a dish without a photo, guessed from its name. */
export function dishLook(name: string): { emoji: string; tint: string } {
  const kind = KINDS.find((k) => k.match.test(` ${name} `));
  return kind ? { emoji: kind.emoji, tint: kind.tint } : { emoji: '🍽️', tint: quest.raised2 };
}

export interface DishThumbProps {
  /** The dish name: the real photo is looked up by it (dish-photo function), and the emoji guessed from it. */
  name: string;
  /** Overrides the guessed emoji (e.g. the recipe's own). */
  emoji?: string;
  /** Overrides the background behind the emoji. */
  tint?: string;
  /** 52 pt by default (list rows); 30 in toasts, 100+ on cards. */
  size?: number;
  radius?: number;
  /** The user's own picture of it (a cook book photo, a meal proof): shown first, without asking for a web photo. */
  photoUri?: string | null;
  /** A web photo already known for the dish. */
  known?: PlacePhoto | null;
  /** Ask for no web photo: the user's picture or the emoji only. */
  off?: boolean;
  /** As wide as its parent, `size` high (the photo cards of the cook book grid, the recipe page). */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A dish's thumbnail: the user's own photo, else the dish's real photo (via `DishPhoto`), else a large emoji on a colour by kind of dish. */
export function DishThumb({ name, emoji, tint, size = 52, radius = 12, photoUri, known, off, fill, style }: DishThumbProps) {
  const g = useGameText();
  const [broken, setBroken] = useState<string | null>(null);
  const look = dishLook(name);
  const box = { width: fill ? ('100%' as const) : size, height: size, borderRadius: radius };
  if (photoUri && broken !== photoUri) {
    return (
      <View style={[styles.box, box, { backgroundColor: tint ?? look.tint }, style]}>
        <Image
          source={{ uri: photoUri }}
          onError={() => setBroken(photoUri)}
          accessibilityLabel={g('dishPhoto.a11y', { name })}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={box}
        />
      </View>
    );
  }
  return <DishPhoto name={name} emoji={emoji ?? look.emoji} size={size} radius={radius} color={tint ?? look.tint} off={off} known={known} fill={fill} style={style} />;
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
});

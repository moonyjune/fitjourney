import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { TEMPTATION_RESIST_XP } from '../../game/constants';
import { useGameText, type GameKey } from '../../game/strings';
import type { TemptationOpen } from '../../store/useTemptationStore';
import type { TemptItem } from '../../temptation/item';
import type { TemptOutcome } from '../../temptation/stats';
import { quest, questRadius } from '../../theme/quest';
import { useDishPhoto } from '../../ai/useDishPhotos';
import { DishPhoto, DishPhotoCredit } from './DishPhoto';
import { HudText } from './HudText';
import { FadeInUp } from './motion/FadeInUp';
import { PopIn } from './motion/PopIn';
import { SparkleBurst } from './motion/SparkleBurst';
import { NATIVE_DRIVER, useMotionEnabled } from './motion/tokens';
import { TemptBossAvatar, type BossMood } from './TemptBossAvatar';

/** Time the boss "types" before each bubble. */
export const TYPING_MS = 700;

/** One chat step of the conversation (what is on screen grows step by step). */
type Step = { kind: 'line'; text: string } | { kind: 'card' };

function ItemPicture({ item, size }: { item: TemptItem; size: number }) {
  const [failed, setFailed] = useState(false);
  if (item.imageUrl && !failed) {
    return (
      <Image
        source={{ uri: item.imageUrl }}
        onError={() => setFailed(true)}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: 14, backgroundColor: quest.raised }}
        resizeMode="cover"
      />
    );
  }
  // No picture of its own (or it did not load): a real photo of the dish when one is found, else its emoji badge.
  return <DishPhoto name={item.name} emoji={item.emoji} size={size} radius={item.imageUrl ? 14 : 18} color={item.color} />;
}

/** A drop that wobbles down beside the picture: the "drooling" effect (nothing with reduced motion). */
function Drool() {
  const motion = useMotionEnabled();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!motion) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(y, { toValue: 1, duration: 1300, useNativeDriver: NATIVE_DRIVER }), Animated.timing(y, { toValue: 0, duration: 0, useNativeDriver: NATIVE_DRIVER })]));
    loop.start();
    return () => loop.stop();
  }, [motion, y]);
  if (!motion) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.drool,
        { opacity: y.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) }] },
      ]}
    >
      <HudText size={14}>💧</HudText>
    </Animated.View>
  );
}

function ItemCard({ item }: { item: TemptItem }) {
  const g = useGameText();
  const dish = useDishPhoto(item.imageUrl ? null : item.name);
  const big = !!item.imageUrl || (dish?.status === 'done' && !!dish.photo);
  return (
    <View style={styles.card}>
      <View>
        <ItemPicture item={item} size={big ? 120 : 76} />
        <Drool />
      </View>
      <View style={styles.cardText}>
        <HudText size={16}>{item.name}</HudText>
        {item.description ? (
          <HudText size={12} weight="medium" color={quest.textSecondary}>
            {item.description}
          </HudText>
        ) : null}
        <View style={styles.chips}>
          <HudText size={12} color={quest.gold} style={styles.chip}>
            {g('tempt.kcal', { n: item.kcal })}
          </HudText>
          <HudText size={12} color={quest.hpText} style={styles.chip}>
            {g('tempt.sugar', { n: item.sugarG })}
          </HudText>
          <HudText size={12} color={quest.manaText} style={styles.chip}>
            {g('tempt.purine', { n: item.purineMg })}
          </HudText>
        </View>
        {item.sourceDomain ? (
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('tempt.source', { d: item.sourceDomain })}
          </HudText>
        ) : null}
        {item.imageUrl ? null : <DishPhotoCredit name={item.name} />}
      </View>
    </View>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <View accessibilityLabel={label} style={[styles.bubble, styles.bossBubble, styles.typing]}>
      <HudText size={18} color={quest.textSecondary}>
        • • •
      </HudText>
    </View>
  );
}

interface Props {
  open: TemptationOpen | null;
  onAnswer: (outcome: TemptOutcome) => void;
  onLog: (item: TemptItem) => void;
  onClose: () => void;
  /** Resist streak after the answer (for the reward line). */
  streak: number;
}

/** The temptation pop-up as a chat with the boss: it types, its lines arrive as bubbles, then the item card; the player answers with
 *  one of two reply buttons, which appears as their bubble, and the boss reacts (sulks or gloats). Resisting bursts sparkles. */
export function TemptationDialog({ open, onAnswer, onLog, onClose, streak }: Props) {
  const g = useGameText();
  const motion = useMotionEnabled();
  const item = open?.item ?? null;
  // The dish's real photo is asked for at once, so it is there when the card comes after the boss's lines.
  useDishPhoto(item && !item.imageUrl ? item.name : null);
  const steps: Step[] = item ? [...item.lines.map((text) => ({ kind: 'line' as const, text })), { kind: 'card' as const }] : [];
  const [shown, setShown] = useState(0);
  const [answer, setAnswer] = useState<TemptOutcome | null>(null);
  const [reacted, setReacted] = useState(false);
  const scroll = useRef<ScrollView>(null);

  // A new pop-up starts the conversation again.
  useEffect(() => {
    setShown(motion ? 0 : steps.length);
    setAnswer(null);
    setReacted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, open]);

  useEffect(() => {
    if (!item) return;
    if (!motion) {
      setShown(steps.length);
      return;
    }
    if (shown >= steps.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), TYPING_MS);
    return () => clearTimeout(timer);
  }, [item, motion, shown, steps.length]);

  useEffect(() => {
    if (!answer || reacted) return;
    if (!motion) {
      setReacted(true);
      return;
    }
    const timer = setTimeout(() => setReacted(true), TYPING_MS);
    return () => clearTimeout(timer);
  }, [answer, reacted, motion]);

  useEffect(() => {
    scroll.current?.scrollToEnd?.({ animated: motion });
  }, [shown, answer, reacted, motion]);

  if (!open || !item) return null;
  const bossName = g(`tempt.boss.${item.boss}` as GameKey);
  const ready = shown >= steps.length;
  const typing = (!ready && shown < steps.length) || (answer !== null && !reacted);
  const mood: BossMood = reacted ? (answer === 'resisted' ? 'sulking' : 'smug') : typing ? 'talking' : 'tempting';
  const variant = item.name.length % 2 === 0 ? '1' : '2';
  const reaction = answer ? g(`tempt.${answer === 'resisted' ? 'reactResist' : 'reactGiveIn'}${variant}` as GameKey) : '';
  const note = item.source === 'sample' ? 'tempt.noteSample' : item.note === 'noWeb' ? 'tempt.noteNoWeb' : item.note === 'fallback' ? 'tempt.noteFallback' : null;

  function choose(outcome: TemptOutcome) {
    if (answer) return;
    setAnswer(outcome);
    onAnswer(outcome);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal accessibilityLabel={g('tempt.dialogA11y', { boss: bossName })}>
          <View style={styles.head}>
            <TemptBossAvatar kind={item.boss} mood={mood} size={64} />
            <View style={styles.flex}>
              <HudText size={16} accessibilityRole="header">
                {bossName}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary}>
                {typing ? g('tempt.typing', { boss: bossName }) : g('tempt.title')}
              </HudText>
            </View>
          </View>

          <ScrollView ref={scroll} style={styles.chat} contentContainerStyle={styles.chatContent}>
            {steps.slice(0, shown).map((step, i) =>
              step.kind === 'line' ? (
                <FadeInUp key={`l${i}`} distance={10} animate={motion}>
                  <View style={[styles.bubble, styles.bossBubble]}>
                    <HudText size={14} weight="medium">
                      {step.text}
                    </HudText>
                  </View>
                </FadeInUp>
              ) : (
                <PopIn key="card">
                  <ItemCard item={item} />
                </PopIn>
              )
            )}
            {!ready && <Typing label={g('tempt.typing', { boss: bossName })} />}
            {answer && (
              <FadeInUp distance={10} animate={motion}>
                <View style={[styles.bubble, styles.meBubble]}>
                  <HudText size={14} color={quest.onGold}>
                    {g(answer === 'resisted' ? 'tempt.resist' : 'tempt.giveIn')}
                  </HudText>
                </View>
              </FadeInUp>
            )}
            {answer && !reacted && <Typing label={g('tempt.typing', { boss: bossName })} />}
            {reacted && (
              <FadeInUp distance={10} animate={motion}>
                <View style={[styles.bubble, styles.bossBubble]}>
                  <HudText size={14} weight="medium">
                    {reaction}
                  </HudText>
                </View>
                <HudText size={12} color={answer === 'resisted' ? quest.xp : quest.textSecondary} style={styles.reward} accessibilityLiveRegion="polite">
                  {open.practice
                    ? g('tempt.rewardPractice')
                    : answer === 'resisted'
                      ? g('tempt.rewardResist', { xp: TEMPTATION_RESIST_XP, n: streak })
                      : g('tempt.gaveInNote')}
                </HudText>
              </FadeInUp>
            )}
            {note && ready && (
              <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
                {g(note as GameKey)}
              </HudText>
            )}
          </ScrollView>

          <View style={styles.burst} pointerEvents="none">
            <SparkleBurst play={reacted && answer === 'resisted'} count={16} radius={120} />
          </View>

          {ready && !answer && (
            <FadeInUp distance={8} animate={motion} style={styles.replies}>
              <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.resist')} onPress={() => choose('resisted')} style={({ pressed }) => [styles.reply, styles.replyResist, pressed && styles.pressed]}>
                <HudText size={15} color={quest.onGold}>
                  {g('tempt.resist')}
                </HudText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.giveIn')} onPress={() => choose('gaveIn')} style={({ pressed }) => [styles.reply, styles.replyGive, pressed && styles.pressed]}>
                <HudText size={15}>{g('tempt.giveIn')}</HudText>
              </Pressable>
            </FadeInUp>
          )}
          {reacted && (
            <View style={styles.replies}>
              {answer === 'gaveIn' && (
                <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.log')} onPress={() => onLog(item)} style={({ pressed }) => [styles.reply, styles.replyResist, pressed && styles.pressed]}>
                  <HudText size={15} color={quest.onGold}>
                    {g('tempt.log')}
                  </HudText>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.close')} onPress={onClose} style={({ pressed }) => [styles.reply, styles.replyGive, pressed && styles.pressed]}>
                <HudText size={15}>{g('tempt.close')}</HudText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(8,6,18,0.78)', justifyContent: 'center', padding: 16 },
  sheet: { maxHeight: '88%', width: '100%', maxWidth: 480, alignSelf: 'center', borderRadius: 22, backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.bossBorder, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  chat: { flexGrow: 0 },
  chatContent: { gap: 8, paddingVertical: 4 },
  bubble: { maxWidth: '86%', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16 },
  bossBubble: { alignSelf: 'flex-start', backgroundColor: quest.bossPanel, borderTopLeftRadius: 4, borderWidth: 1, borderColor: quest.bossBorder },
  meBubble: { alignSelf: 'flex-end', backgroundColor: quest.gold, borderTopRightRadius: 4 },
  typing: { paddingVertical: 4 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: questRadius.panel, backgroundColor: quest.raised, borderWidth: 1.5, borderColor: quest.border, maxWidth: '96%' },
  cardText: { flex: 1, minWidth: 0, gap: 4 },
  drool: { position: 'absolute', right: -4, top: '45%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: quest.bg, overflow: 'hidden' },
  reward: { marginTop: 4, marginLeft: 4 },
  note: { marginTop: 4, fontStyle: 'italic' },
  burst: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  replies: { gap: 8 },
  reply: { minHeight: 48, borderRadius: questRadius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  replyResist: { backgroundColor: quest.gold },
  replyGive: { backgroundColor: quest.raised2, borderWidth: 1.5, borderColor: quest.border },
  pressed: { opacity: 0.85 },
});

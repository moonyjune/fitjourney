import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { TEMPTATION_RESIST_XP } from '../../game/constants';
import { useGameText, type GameKey } from '../../game/strings';
import type { TemptationOpen } from '../../store/useTemptationStore';
import type { TemptItem } from '../../temptation/item';
import { chatBonusXp, type TemptOutcome } from '../../temptation/stats';
import { quest, questRadius } from '../../theme/quest';
import { useDishPhoto } from '../../ai/useDishPhotos';
import { DishPhoto, DishPhotoCredit, WebPhotoCredit } from './DishPhoto';
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

/** Boss turns of a chat after the first "no" (the server makes the last one a surrender). */
export const MAX_CHAT_TURNS = 5;
/** Longest line the player can send. */
export const CHAT_MAX_CHARS = 200;

/** One boss turn of "AI tương tác", as the host gets it from tempt-chat. */
export interface TemptTurn {
  move: 'insist' | 'retry' | 'switch' | 'concede';
  lines: string[];
  /** The other item the boss switched to. */
  item?: TemptItem;
}

/** What the boss is asked to answer: the whole chat so far (its last line is the player's), the item on the table, the turns made. */
export interface TemptTalk {
  chat: { from: 'boss' | 'me'; text: string }[];
  item: TemptItem;
  turn: number;
  offered: string[];
}

/** What happened in the chat after the opening (bubbles and cards, in order). */
type ChatEntry = { kind: 'boss' | 'me'; text: string } | { kind: 'card'; item: TemptItem };
type ChatEnd = 'conceded' | 'left' | 'gaveIn';

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
        {item.imageUrl ? item.photo ? <WebPhotoCredit photo={item.photo} name={item.name} /> : null : <DishPhotoCredit name={item.name} />}
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
  /** Records the answer; in a chat with the AI boss, with its bonus XP and the item on the table at the end. */
  onAnswer: (outcome: TemptOutcome, bonusXp?: number, item?: TemptItem) => void;
  /** The AI boss's answer to the player's line (an item with `chat`); null when it could not be had. */
  onTalk?: (talk: TemptTalk) => Promise<TemptTurn | null>;
  onLog: (item: TemptItem) => void;
  onClose: () => void;
  /** Resist streak after the answer (for the reward line). */
  streak: number;
}

/** The temptation pop-up as a chat with the boss: it types, its lines arrive as bubbles, then the item card; the player answers with
 *  one of two reply buttons, which appears as their bubble, and the boss reacts (sulks or gloats). Resisting bursts sparkles. */
export function TemptationDialog({ open, onAnswer, onTalk, onLog, onClose, streak }: Props) {
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
  // "AI tương tác": after the first "no" the player chats with the boss.
  const chatMode = !!item?.chat && !!onTalk;
  const [talk, setTalk] = useState<ChatEntry[]>([]);
  const [current, setCurrent] = useState<TemptItem | null>(null);
  const [turns, setTurns] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState<ChatEnd | null>(null);
  const [bonus, setBonus] = useState(0);
  const [talkError, setTalkError] = useState(false);
  const [draft, setDraft] = useState('');
  const chatting = chatMode && talk.length > 0;

  // A new pop-up starts the conversation again.
  useEffect(() => {
    setShown(motion ? 0 : steps.length);
    setAnswer(null);
    setReacted(false);
    setTalk([]);
    setCurrent(null);
    setTurns(0);
    setWaiting(false);
    setEnded(null);
    setBonus(0);
    setTalkError(false);
    setDraft('');
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
  }, [shown, answer, reacted, motion, talk.length, waiting]);

  if (!open || !item) return null;
  const bossName = g(`tempt.boss.${item.boss}` as GameKey);
  const ready = shown >= steps.length;
  const typing = (!ready && shown < steps.length) || (answer !== null && !reacted);
  const mood: BossMood = reacted ? (answer === 'resisted' ? 'sulking' : 'smug') : typing ? 'talking' : 'tempting';
  const variant = item.name.length % 2 === 0 ? '1' : '2';
  const reaction = answer ? g(`tempt.${answer === 'resisted' ? 'reactResist' : 'reactGiveIn'}${variant}` as GameKey) : '';
  const note = item.source === 'sample' ? 'tempt.noteSample' : item.note === 'noWeb' ? 'tempt.noteNoWeb' : item.note === 'fallback' ? 'tempt.noteFallback' : null;

  function choose(outcome: TemptOutcome) {
    if (answer || chatting) return;
    if (chatMode && outcome === 'resisted') {
      say(g('tempt.resist'));
      return;
    }
    setAnswer(outcome);
    onAnswer(outcome);
  }

  const onTable = current ?? item;
  /** The whole chat as the boss reads it: its opening lines, then every bubble since (cards are not lines). */
  const history = (extra: ChatEntry[]) =>
    [...(item?.lines ?? []).map((text) => ({ from: 'boss' as const, text })), ...[...talk, ...extra].flatMap((e) => (e.kind === 'card' ? [] : [{ from: e.kind, text: e.text }]))];

  /** The player's line: shown at once, then the boss answers it (a new item, a surrender, or more pleading). */
  async function say(text: string) {
    const line = text.trim().slice(0, CHAT_MAX_CHARS);
    if (!line || waiting || ended || !onTalk || !onTable) return;
    const mine: ChatEntry = { kind: 'me', text: line };
    setTalk((t) => [...t, mine]);
    setDraft('');
    setTalkError(false);
    setWaiting(true);
    const offered = [item?.name ?? '', ...talk.flatMap((e) => (e.kind === 'card' ? [e.item.name] : []))];
    const reply = await onTalk({ chat: history([mine]), item: onTable, turn: turns, offered }).catch(() => null);
    setWaiting(false);
    if (!reply || reply.lines.length === 0) {
      setTalkError(true);
      return;
    }
    const next: ChatEntry[] = reply.lines.map((l) => ({ kind: 'boss' as const, text: l }));
    if (reply.move === 'switch' && reply.item) {
      next.push({ kind: 'card', item: reply.item });
      setCurrent(reply.item);
    }
    setTalk((t) => [...t, ...next]);
    const made = turns + 1;
    setTurns(made);
    if (reply.move === 'concede' || made >= MAX_CHAT_TURNS) finish('conceded', made, reply.item ?? onTable);
  }

  /** The chat ends: the boss gave up or the player walked away (both a win, with the chat's bonus), or the player gave in. */
  function finish(end: ChatEnd, made = turns, on: TemptItem | null = onTable) {
    if (ended || !on) return;
    setEnded(end);
    if (end === 'gaveIn') {
      setTalk((t) => [...t, { kind: 'me', text: g('tempt.giveIn') }, { kind: 'boss', text: g('tempt.chatGloat') }]);
      onAnswer('gaveIn', 0, on);
      return;
    }
    const xp = chatBonusXp(made, end === 'conceded');
    setBonus(xp);
    onAnswer('resisted', xp, on);
  }

  /** Closing in the middle of a chat after a "no" counts as walking away: a win. */
  function close() {
    if (chatting && !ended) finish('left');
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
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
            {talk.map((e, i) =>
              e.kind === 'card' ? (
                <PopIn key={`c${i}`}>
                  <ItemCard item={e.item} />
                </PopIn>
              ) : (
                <FadeInUp key={`t${i}`} distance={10} animate={motion}>
                  <View style={[styles.bubble, e.kind === 'me' ? styles.meBubble : styles.bossBubble]}>
                    <HudText size={14} weight="medium" color={e.kind === 'me' ? quest.onGold : undefined}>
                      {e.text}
                    </HudText>
                  </View>
                </FadeInUp>
              )
            )}
            {waiting && <Typing label={g('tempt.typing', { boss: bossName })} />}
            {talkError && (
              <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.note} accessibilityLiveRegion="polite">
                {g('tempt.chatError')}
              </HudText>
            )}
            {ended && ended !== 'gaveIn' && (
              <FadeInUp distance={10} animate={motion}>
                <HudText size={13} color={quest.xp} style={styles.reward} accessibilityLiveRegion="polite">
                  {open.practice
                    ? g('tempt.rewardPractice')
                    : g(ended === 'conceded' ? 'tempt.chatWon' : 'tempt.chatLeft', { xp: TEMPTATION_RESIST_XP + bonus, bonus, turns, n: streak })}
                </HudText>
              </FadeInUp>
            )}
            {ended === 'gaveIn' && (
              <HudText size={12} color={quest.textSecondary} style={styles.reward}>
                {open.practice ? g('tempt.rewardPractice') : g('tempt.gaveInNote')}
              </HudText>
            )}
            {note && ready && (
              <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.note}>
                {g(note as GameKey)}
              </HudText>
            )}
          </ScrollView>

          <View style={styles.burst} pointerEvents="none">
            <SparkleBurst play={(reacted && answer === 'resisted') || (!!ended && ended !== 'gaveIn')} count={ended === 'conceded' ? 28 : 16} radius={ended === 'conceded' ? 160 : 120} />
          </View>

          {ready && !answer && !chatting && (
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
          {chatting && !ended && (
            <View style={styles.replies}>
              <View style={styles.quick}>
                {(['tempt.tease1', 'tempt.tease2', 'tempt.tease3', 'tempt.tease4'] as const).map((k) => (
                  <Pressable key={k} accessibilityRole="button" accessibilityLabel={g(k)} disabled={waiting} onPress={() => void say(g(k))} style={({ pressed }) => [styles.quickChip, (pressed || waiting) && styles.pressed]}>
                    <HudText size={12}>{g(k)}</HudText>
                  </Pressable>
                ))}
              </View>
              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel={g('tempt.chatField')}
                  placeholder={g('tempt.chatPlaceholder')}
                  placeholderTextColor={quest.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={CHAT_MAX_CHARS}
                  editable={!waiting}
                  onSubmitEditing={() => void say(draft)}
                  returnKeyType="send"
                  style={styles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={g('tempt.chatSend')}
                  accessibilityState={{ disabled: waiting || !draft.trim() }}
                  disabled={waiting || !draft.trim()}
                  onPress={() => void say(draft)}
                  style={({ pressed }) => [styles.send, (pressed || waiting || !draft.trim()) && styles.pressed]}
                >
                  <HudText size={14} color={quest.onGold}>
                    {g('tempt.chatSend')}
                  </HudText>
                </Pressable>
              </View>
              <View style={styles.row}>
                <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.chatLeave')} onPress={() => finish('left')} style={({ pressed }) => [styles.reply, styles.replyResist, styles.flex, pressed && styles.pressed]}>
                  <HudText size={14} color={quest.onGold}>
                    {g('tempt.chatLeave')}
                  </HudText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.giveIn')} onPress={() => finish('gaveIn')} style={({ pressed }) => [styles.reply, styles.replyGive, styles.flex, pressed && styles.pressed]}>
                  <HudText size={14}>{g('tempt.chatGiveIn')}</HudText>
                </Pressable>
              </View>
            </View>
          )}
          {ended && (
            <View style={styles.replies}>
              {ended === 'gaveIn' && onTable && (
                <Pressable accessibilityRole="button" accessibilityLabel={g('tempt.log')} onPress={() => onLog(onTable)} style={({ pressed }) => [styles.reply, styles.replyResist, pressed && styles.pressed]}>
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
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickChip: { paddingHorizontal: 10, minHeight: 36, justifyContent: 'center', borderRadius: 18, backgroundColor: quest.raised, borderWidth: 1, borderColor: quest.border },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 12, backgroundColor: quest.bg, borderWidth: 1.5, borderColor: quest.border, color: quest.text },
  send: { minHeight: 44, minWidth: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, backgroundColor: quest.gold },
  row: { flexDirection: 'row', gap: 8 },
});

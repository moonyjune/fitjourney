import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { autoBanterDay, type BanterShown } from '../../banter/days';
import { useGameText, type GameKey } from '../../game/strings';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';
import { useBossTalkStore } from '../../store/useBossTalkStore';
import { useNutritionStore } from '../../store/useNutritionStore';
import { requestBossBanter, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { ERROR_DETAIL_CHARS } from '../../ai/usePhotoAnalysis';
import { DAILY_QUOTA } from '../../../supabase/functions/_shared/usage';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';
import { StageBossArt } from './StageBossArt';
import { bossName, shortDate } from './StageBossDetail';
import { FadeInUp } from './motion/FadeInUp';
import { PressScale } from './motion/PressScale';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

/** Days shown open at first; older ones show their header and open on tap. */
const OPEN_DAYS = 2;
/** Older days listed at first and added by each "show more". */
const PAGE = 5;

/** "−120 g mỡ" on a deficit day, "+80 g hồi máu" on a surplus. */
function damageText(d: BanterShown, g: Translate): string {
  return d.summary.estG > 0 ? g('banter.dealt', { g: d.summary.estG }) : g('banter.healed', { g: Math.abs(d.summary.estG) });
}

/** The exchange as a chat: the boss on the left with its portrait, the player on the right. Bubbles are plain text for screen
 *  readers (each says who speaks); they pop in one after the other only when `animate` (a freshly written exchange), and never
 *  with reduced motion (FadeInUp). */
export function BanterChat({ shown, animate = false, avatar = 28 }: { shown: BanterShown; animate?: boolean; avatar?: number }) {
  const g = useGameText();
  const name = bossName(shown.boss, g);
  const fell = shown.summary.boss.fell;
  return (
    <View style={styles.chat}>
      {shown.text.lines.map((l, i) => {
        const boss = l.speaker === 'boss';
        return (
          <FadeInUp key={i} animate={animate} delay={150 + i * 380} distance={8} style={[styles.lineRow, !boss && styles.lineRowPlayer]}>
            {boss && (
              <View style={[styles.avatar, { width: avatar + 8, height: avatar + 8, borderRadius: (avatar + 8) / 2 }]}>
                <StageBossArt archetype={shown.boss.archetype} tier={shown.boss.tier} size={avatar} defeated={fell && i === shown.text.lines.length - 1} />
              </View>
            )}
            <View accessible accessibilityLabel={`${boss ? name : g('banter.you')}: ${l.text}`} style={[styles.bubble, boss ? styles.bubbleBoss : styles.bubblePlayer]}>
              <HudText size={11} color={boss ? quest.hpText : quest.goldLight}>
                {boss ? name : g('banter.you')}
              </HudText>
              <HudText size={13} weight="medium" color={quest.text}>
                {l.text}
              </HudText>
            </View>
          </FadeInUp>
        );
      })}
    </View>
  );
}

/** Who wrote the exchange, small and quiet. */
function SourceNote({ shown, g }: { shown: BanterShown; g: Translate }) {
  const text = shown.source === 'ai' ? g('banter.byAi') : shown.source === 'sample' ? g('banter.bySample') : g('banter.byTemplate');
  return (
    <HudText size={10} weight="medium" color={quest.textTertiary}>
      {`${shown.source === 'ai' ? '✦ ' : ''}${text}${shown.stale ? ` · ${g('banter.stale')}` : ''}`}
    </HudText>
  );
}

interface CardProps {
  shown: BanterShown;
  open: boolean;
  onToggle: () => void;
  onAsk: () => void;
  busy: boolean;
  /** Another day is being written: this one's button waits. */
  locked: boolean;
  error: string | null;
  fresh: boolean;
}

/** One day: date, damage chip and move, then the chat and the AI button when open. */
function BanterCard({ shown, open, onToggle, onAsk, busy, locked, error, fresh }: CardProps) {
  const g = useGameText();
  const date = shortDate(shown.date);
  const dealt = shown.summary.estG > 0;
  const head = shown.live ? `${date} · ${g('banter.today')}` : date;
  return (
    <View style={[styles.card, shown.summary.boss.fell && styles.cardFell]}>
      <PressScale
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${head}. ${damageText(shown, g)}. ${g('banter.move', { name: shown.text.moveName })}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.cardHead}
      >
        <StageBossArt archetype={shown.boss.archetype} tier={shown.boss.tier} size={28} defeated={shown.summary.boss.fell} />
        <View style={styles.flex}>
          <HudText size={12} color={shown.live ? quest.gold : quest.textSecondary}>
            {head}
          </HudText>
          {shown.text.moveName ? (
            <HudText size={13} numberOfLines={open ? undefined : 1}>
              {g('banter.move', { name: shown.text.moveName })}
            </HudText>
          ) : null}
        </View>
        <View style={[styles.chip, dealt ? styles.chipDealt : styles.chipHealed]}>
          <HudText size={11} color={dealt ? quest.xp : quest.hpText}>
            {damageText(shown, g)}
          </HudText>
        </View>
        <View style={open ? styles.chevronOpen : styles.chevronClosed}>
          <QuestIcon name="chevron" size={14} color={quest.textSecondary} />
        </View>
      </PressScale>
      {open && (
        <View style={styles.body}>
          <BanterChat shown={shown} animate={fresh} />
          <View style={styles.footer}>
            <View style={styles.flex}>
              <SourceNote shown={shown} g={g} />
            </View>
            <View style={styles.askButton}>
              <QuestButton
                title={busy ? g('banter.asking') : shown.source === 'template' ? g('banter.ask') : g('banter.redo')}
                variant="ghost"
                accessibilityLabel={g('banter.askLabel', { date })}
                onPress={onAsk}
                loading={busy}
                disabled={locked}
              />
            </View>
          </View>
          {error && (
            <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert">
              {error}
            </HudText>
          )}
        </View>
      )}
    </View>
  );
}

/** Journey asks the AI for yesterday's exchange once on its own when it opens (the full list now lives in the boss sheet, so this
 *  keeps the "asked when the Map opens" rule and the latest line on Journey up to date). The day is marked first: a failure keeps the
 *  template and is never retried. `BanterSection` does the same when it is shown first; the mark stops a second request. */
export function useAutoBanter(shown: readonly BanterShown[], todayKey: string): void {
  const saveTalk = useBossTalkStore((s) => s.saveTalk);
  const markAutoTried = useBossTalkStore((s) => s.markAutoTried);
  const autoTried = useBossTalkStore((s) => s.autoTried);
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);
  const hydrated = useBossTalkStore.persist?.hasHydrated?.() !== false && useNutritionStore.persist?.hasHydrated?.() !== false;
  const autoDate = aiEnabled && hydrated ? autoBanterDay(shown, todayKey, autoTried) : null;
  useEffect(() => {
    if (!autoDate) return;
    const day = shown.find((d) => d.date === autoDate);
    if (!day) return;
    markAutoTried(autoDate);
    void requestBossBanter(day.summary).then((out) => {
      if (out.ok) saveTalk({ date: day.date, ...out.text, source: out.sample ? 'sample' : 'ai', deficitKcal: day.summary.deficitKcal, madeAtISO: new Date().toISOString() });
    });
    // Only a new day to ask starts a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDate]);
}

/** The latest exchange of one stage boss (newest first list), for its detail sheet. */
export function latestBanterFor(shown: readonly BanterShown[], bossIndex: number): BanterShown | undefined {
  return shown.find((d) => d.boss.index === bossIndex);
}

/** Inside a boss's detail: its latest exchange with the player. */
export function BossBanterPanel({ shown }: { shown: BanterShown }) {
  const g = useGameText();
  return (
    <View style={styles.panel}>
      <HudText size={15} accessibilityRole="header">
        {g('banter.latest', { date: shortDate(shown.date) })}
      </HudText>
      {shown.text.moveName ? (
        <HudText size={12} color={quest.gold}>
          {`${g('banter.move', { name: shown.text.moveName })} · ${damageText(shown, g)}`}
        </HudText>
      ) : null}
      <BanterChat shown={shown} />
      <SourceNote shown={shown} g={g} />
    </View>
  );
}

/** Map > Hội thoại chiến đấu: one boss/player exchange per day with food logged (last two weeks), newest first. Each day shows the
 *  AI's exchange when one was written, else the template built on the device. Yesterday is asked of the AI once on its own when the
 *  Map opens (AI on, never retried); any day can be (re)written with a tap. Today's is "so far". */
export function BanterSection({ shown, todayKey }: { shown: BanterShown[]; todayKey: string }) {
  const g = useGameText();
  const saveTalk = useBossTalkStore((s) => s.saveTalk);
  const markAutoTried = useBossTalkStore((s) => s.markAutoTried);
  const autoTried = useBossTalkStore((s) => s.autoTried);
  const aiEnabled = useAiPhotoStore((s) => s.aiEnabled);

  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ date: string; kind: AiErrorKind; detail: string } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [shownCount, setShownCount] = useState(OPEN_DAYS + PAGE);
  const alive = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const ask = async (day: BanterShown, auto = false) => {
    if (busy.current) return;
    busy.current = true;
    setBusyDate(day.date);
    if (!auto) setFailure(null);
    const out = await requestBossBanter(day.summary);
    if (out.ok) {
      saveTalk({ date: day.date, ...out.text, source: out.sample ? 'sample' : 'ai', deficitKcal: day.summary.deficitKcal, madeAtISO: new Date().toISOString() });
      if (alive.current) setFresh(day.date);
    } else if (!auto && alive.current) setFailure({ date: day.date, kind: out.kind, detail: out.message });
    busy.current = false;
    if (alive.current) setBusyDate(null);
  };

  // Yesterday's exchange, asked once on its own (after the saved exchanges and the logs are loaded, so a saved one is not asked
  // again). The day is marked first: a failure falls back to the template and is never retried.
  const hydrated = useBossTalkStore.persist?.hasHydrated?.() !== false && useNutritionStore.persist?.hasHydrated?.() !== false;
  const autoDate = aiEnabled && hydrated ? autoBanterDay(shown, todayKey, autoTried) : null;
  useEffect(() => {
    if (!autoDate || busy.current) return;
    const day = shown.find((d) => d.date === autoDate);
    if (!day) return;
    markAutoTried(autoDate);
    void ask(day, true);
    // Only a new day to ask starts a request; `shown` changing for the same day does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDate]);

  const visible = shown.slice(0, shownCount);
  const errorFor = (date: string) =>
    failure && failure.date === date
      ? `${g(`banter.err.${failure.kind}` as GameKey)}${failure.kind === 'generic' && failure.detail ? ` (${failure.detail.replace(/\s+/g, ' ').trim().slice(0, ERROR_DETAIL_CHARS)})` : ''}`
      : null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <HudText size={18} accessibilityRole="header">
          {g('banter.title')}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('banter.hint')}
        </HudText>
      </View>

      {shown.length === 0 ? (
        <HudText size={13} weight="medium" color={quest.textSecondary}>
          {g('banter.empty')}
        </HudText>
      ) : (
        <>
          {visible.map((d, i) => {
            const open = toggled[d.date] ?? i < OPEN_DAYS;
            return (
              <BanterCard
                key={d.date}
                shown={d}
                open={open}
                onToggle={() => setToggled((t) => ({ ...t, [d.date]: !open }))}
                onAsk={() => {
                  void ask(d);
                }}
                busy={busyDate === d.date}
                locked={busyDate != null && busyDate !== d.date}
                error={errorFor(d.date)}
                fresh={fresh === d.date}
              />
            );
          })}
          {shownCount < shown.length && (
            <QuestButton title={g('banter.more', { n: Math.min(PAGE, shown.length - shownCount) })} variant="ghost" onPress={() => setShownCount((n) => n + PAGE)} />
          )}
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('banter.quotaNote', { n: DAILY_QUOTA.banter })}
          </HudText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 8 },
  head: { gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  card: { borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  cardFell: { borderColor: quest.gold },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  chipDealt: { borderColor: quest.xp, backgroundColor: quest.bg },
  chipHealed: { borderColor: quest.hp, backgroundColor: quest.bossPanel },
  chevronClosed: { transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },
  body: { gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  askButton: { minWidth: 140 },
  chat: { gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 36 },
  lineRowPlayer: { justifyContent: 'flex-end', paddingRight: 0, paddingLeft: 44 },
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bossPanel, borderWidth: 1, borderColor: quest.bossBorder },
  bubble: { flexShrink: 1, gap: 2, paddingVertical: 8, paddingHorizontal: 12, borderRadius: questRadius.panel, borderWidth: 1 },
  bubbleBoss: { borderBottomLeftRadius: 4, backgroundColor: quest.bossPanel, borderColor: '#5A2848' },
  bubblePlayer: { borderBottomRightRadius: 4, backgroundColor: quest.raised2, borderColor: quest.gold },
  panel: { gap: 8, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised },
});

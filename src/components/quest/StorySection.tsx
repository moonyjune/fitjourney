import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StageBoss } from '../../game/stageBosses';
import { formatGameText, useGameText, type GameKey } from '../../game/strings';
import { useNutritionStore } from '../../store/useNutritionStore';
import { useStoryStore } from '../../store/useStoryStore';
import { useWeightStore } from '../../store/useWeightStore';
import { useWorkoutStore } from '../../store/useWorkoutStore';
import type { StoryChapter } from '../../story/chapters';
import { dueChapters, type ChapterSpec } from '../../story/schedule';
import { storySourceFromStores } from '../../story/source';
import { buildChapterSummary, hasDataBetween } from '../../story/summary';
import { requestStoryChapter, type AiErrorKind } from '../../sync/cloudSync';
import { quest, questRadius } from '../../theme/quest';
import { toDateKey } from '../../utils/date';
import { ERROR_DETAIL_CHARS } from '../../ai/usePhotoAnalysis';
import { DAILY_QUOTA } from '../../../supabase/functions/_shared/usage';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';
import { QuestIcon } from './QuestIcon';
import { PressScale } from './motion/PressScale';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

const dd = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** "Tuần 20/10 – 26/10" or "Hạ boss · 24/10". */
function periodText(c: Pick<ChapterSpec, 'kind' | 'from' | 'to'>, g: Translate): string {
  return c.kind === 'boss' ? g('story.bossPeriod', { date: dd(c.to) }) : g('story.weekPeriod', { from: dd(c.from), to: dd(c.to) });
}

/** One written chapter: number, period and title; the text opens on tap. */
function ChapterCard({ chapter, open, onToggle, g }: { chapter: StoryChapter; open: boolean; onToggle: () => void; g: Translate }) {
  const head = `${g('story.chapter', { n: chapter.number })} · ${periodText(chapter, g)}`;
  return (
    <View style={[styles.card, chapter.kind === 'boss' && styles.cardBoss]}>
      <PressScale
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${head}. ${chapter.title}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.cardHead}
      >
        <View style={styles.flex}>
          <HudText size={11} color={chapter.kind === 'boss' ? quest.gold : quest.textSecondary} style={styles.eyebrow}>
            {head.toUpperCase()}
          </HudText>
          <HudText size={15} numberOfLines={open ? undefined : 2}>
            {chapter.title}
          </HudText>
        </View>
        <View style={open ? styles.chevronOpen : styles.chevronClosed}>
          <QuestIcon name="chevron" size={16} color={quest.textSecondary} />
        </View>
      </PressScale>
      {open && (
        <View style={styles.body}>
          {chapter.paragraphs.map((p, i) => (
            <HudText key={i} size={14} weight="medium" color={quest.text} style={styles.paragraph}>
              {p}
            </HudText>
          ))}
          {chapter.sample && (
            <HudText size={11} weight="medium" color={quest.textTertiary}>
              {g('story.sample')}
            </HudText>
          )}
        </View>
      )}
    </View>
  );
}

/** Map > Câu chuyện: the journey told as an RPG story, a chapter per finished week and per stage boss beaten. Chapters are written
 *  by the AI only when the player taps the button (oldest pending first, one per tap), from a summary of the real logs. */
export function StorySection({ bosses, startDateKey, now }: { bosses: StageBoss[]; startDateKey: string | null; now: Date }) {
  const g = useGameText();
  const chapters = useStoryStore((s) => s.chapters);
  const addChapter = useStoryStore((s) => s.addChapter);
  const logs = useNutritionStore((s) => s.logs);
  const weights = useWeightStore((s) => s.entries);
  const workoutEntries = useWorkoutStore((s) => s.entries);
  const todayKey = toDateKey(now);

  const due = useMemo(
    () =>
      dueChapters({
        todayKey,
        startDateKey,
        bosses,
        hasData: (from, to) => hasDataBetween({ logs, weights, workoutEntries }, from, to),
        written: new Set(chapters.map((c) => c.id)),
      }),
    [todayKey, startDateKey, bosses, logs, weights, workoutEntries, chapters]
  );
  const newestFirst = useMemo(() => [...chapters].reverse(), [chapters]);

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ kind: AiErrorKind; detail: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const write = async () => {
    const spec = due[0];
    if (!spec || busy) return;
    setBusy(true);
    setFailure(null);
    const at = new Date();
    const earlier = chapters.filter((c) => c.to <= spec.to);
    const summary = buildChapterSummary(spec, storySourceFromStores(at), {
      number: chapters.length + 1,
      previousTitles: earlier.slice(-2).map((c) => c.title),
      // The story is written in Vietnamese, so the bosses keep their Vietnamese names whatever the app language.
      bossName: (archetype) => formatGameText('vi', `stage.boss.${archetype}` as GameKey),
      now: at,
    });
    const out = await requestStoryChapter(summary);
    if (out.ok) {
      addChapter({ id: spec.id, kind: spec.kind, from: spec.from, to: spec.to, number: summary.chapter.number, ...out.chapter, writtenAtISO: at.toISOString(), ...(out.sample ? { sample: true } : {}) });
      if (alive.current) setOpenId(spec.id);
    } else if (alive.current) setFailure({ kind: out.kind, detail: out.message });
    if (alive.current) setBusy(false);
  };

  const next = due[0];
  const errorText = failure
    ? `${g(`story.err.${failure.kind}` as GameKey)}${failure.kind === 'generic' && failure.detail ? ` (${failure.detail.replace(/\s+/g, ' ').trim().slice(0, ERROR_DETAIL_CHARS)})` : ''}`
    : null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <HudText size={18} accessibilityRole="header">
          {g('story.title')}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {g('story.hint')}
        </HudText>
      </View>

      {next ? (
        <View style={styles.writePanel}>
          <HudText size={13} color={quest.text}>
            {g('story.pending', { n: due.length, what: periodText(next, g) })}
          </HudText>
          <QuestButton
            icon="edit"
            title={busy ? g('story.writing') : g('story.write')}
            accessibilityLabel={g('story.writeLabel', { what: periodText(next, g) })}
            onPress={() => {
              void write();
            }}
            loading={busy}
          />
          <HudText size={11} weight="medium" color={quest.textSecondary}>
            {g('story.quotaNote', { n: DAILY_QUOTA.story })}
          </HudText>
        </View>
      ) : (
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.note}>
          {chapters.length === 0 ? g('story.empty') : g('story.upToDate')}
        </HudText>
      )}

      {errorText && (
        <HudText size={12} weight="medium" color={quest.hpText} accessibilityRole="alert" style={styles.note}>
          {errorText}
        </HudText>
      )}

      {newestFirst.map((c) => (
        <ChapterCard key={c.id} chapter={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} g={g} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, gap: 8 },
  head: { gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.2 },
  note: { marginTop: 4 },
  writePanel: { gap: 8, padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.gold, backgroundColor: quest.raised },
  card: { borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  cardBoss: { borderColor: quest.gold },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  chevronClosed: { transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },
  body: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  paragraph: { lineHeight: 21 },
});

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { ExerciseFigure } from '../../src/components/quest/ExerciseFigure';
import { ExercisePlanList, usePlanRowLabel } from '../../src/components/quest/ExercisePlanList';
import { HudText } from '../../src/components/quest/HudText';
import { QuestButton } from '../../src/components/quest/QuestButton';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { MISSION_XP, WORKOUT_MIN_MINUTES } from '../../src/game/constants';
import { useGameText, type GameKey } from '../../src/game/strings';
import { estimateKcal, EXERCISE_BY_ID, type ExerciseId } from '../../src/game/training/exercises';
import { exerciseName, formatAmount } from '../../src/game/training/format';
import { applyRating, progressFor, type Rating } from '../../src/game/training/progress';
import { preloadVoices, speak, stopSpeaking, voiceInUse, type VoiceGender, type VoicePrefs } from '../../src/game/training/speech';
import {
  dueEvents,
  firstSideLine,
  introScript,
  movesDone,
  restScript,
  resumeOffsetMs,
  SPEECH_TEXT,
  shouldCallHold,
  shouldCallRest,
  stepTimeline,
  switchLine,
  workScript,
  type SpeechLang,
} from '../../src/game/training/voice';
import { activeRow, exercisePlan } from '../../src/game/training/plan';
import { buildSteps, sessionProgress, sessionReducer, startSession, totalSetsDone } from '../../src/game/training/session';
import { useNow } from '../../src/game/useGameState';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useTrainingStore } from '../../src/store/useTrainingStore';
import { useWeightStore } from '../../src/store/useWeightStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { quest, questRadius } from '../../src/theme/quest';
import { screenMaxWidthStyle } from '../../src/theme/responsive';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import { toDateKey } from '../../src/utils/date';
import { hiddenSvgProps } from '../../src/components/quest/hiddenSvg';
import { animatedSvg } from '../../src/components/quest/motion/animatedSvg';
import { Bump } from '../../src/components/quest/motion/Bump';
import { EASE_OUT, useMotionEnabled } from '../../src/components/quest/motion/tokens';

const RING = 220;
/** With "auto start", the pause between the end of a rest and the first count: room for the short intro. A new
 *  exercise gets longer (its name, amount and side order are said first). */
const NEXT_SET_LEAD_MS = 1500;
const NEW_EXERCISE_LEAD_MS = 6000;
const STROKE = 14;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/workout');
}

function confirmQuit(title: string, keep: string, quit: string, onQuit: () => void) {
  // `onQuit` is responsible for silencing speech before leaving.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(title)) onQuit();
    return;
  }
  Alert.alert(title, undefined, [
    { text: keep, style: 'cancel' },
    { text: quit, style: 'destructive', onPress: onQuit },
  ]);
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const AnimatedCircle = animatedSvg(Circle);

/** The progress ring. `smooth` is for the per-second countdowns (holds, rests): the arc glides at a constant pace
 *  instead of stepping once a second. Rep counts ease to each new value. Reduced motion jumps straight there. */
function Ring({ fraction, smooth, children }: { fraction: number; smooth?: boolean; children: React.ReactNode }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const enabled = useMotionEnabled();
  const target = Math.min(1, Math.max(0, fraction));
  const arc = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    if (!enabled) {
      arc.setValue(target);
      return;
    }
    const run = Animated.timing(arc, {
      toValue: target,
      duration: smooth ? 950 : 280,
      easing: smooth ? Easing.linear : EASE_OUT,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [target, smooth, enabled, arc]);
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill} {...hiddenSvgProps}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={quest.raised} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={quest.gold}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arc.interpolate({ inputRange: [0, 1], outputRange: [`0 ${c}`, `${c} ${c}`] })}
          rotation={-90}
          origin={`${RING / 2}, ${RING / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

export default function SessionScreen() {
  const g = useGameText();
  const language = useSettingsStore((s) => s.language);
  const lang = language === 'en' ? 'en' : 'vi';
  const rowLabel = usePlanRowLabel(lang);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const { ids, group } = useLocalSearchParams<{ ids?: string; group?: string }>();
  const progress = useTrainingStore((s) => s.progress);
  const voiceOn = useTrainingStore((s) => s.voiceOn);
  const setVoiceOn = useTrainingStore((s) => s.setVoiceOn);
  const voiceLang = useTrainingStore((s) => s.voiceLang);
  const voiceGender = useTrainingStore((s) => s.voiceGender);
  const setVoiceLang = useTrainingStore((s) => s.setVoiceLang);
  const setVoiceGender = useTrainingStore((s) => s.setVoiceGender);
  const autoNext = useTrainingStore((s) => s.autoNextSet);
  const setAutoNext = useTrainingStore((s) => s.setAutoNextSet);
  const commitRatings = useTrainingStore((s) => s.commitRatings);
  const addEntry = useWorkoutStore((s) => s.addEntry);
  const entries = useWorkoutStore((s) => s.entries);
  const latestWeight = useWeightStore((s) => s.latest());
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);

  const steps = useMemo(() => {
    const list = (ids ?? '').split(',').filter((id): id is ExerciseId => id in EXERCISE_BY_ID);
    return buildSteps(list.map((id) => ({ id, level: progressFor(progress, id).level })));
    // The levels are frozen when the session starts: ratings are only committed at the end.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  const [state, dispatch] = useReducer(sessionReducer, steps, startSession);

  const startedAt = useRef(Date.now());
  const minutesBefore = useRef(
    entries.filter((e) => toDateKey(new Date(e.dateISO)) === toDateKey(new Date())).reduce((s, e) => s + e.durationMin, 0)
  );
  const clock = useNow(1000);
  const [holdStartedAt, setHoldStartedAt] = useState<number | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [result, setResult] = useState<{ durationMin: number; kcal: number } | null>(null);
  // Timed auto count of a rep set: the clock (not the user's taps) decides when each rep is done and when the set ends.
  const [auto, setAuto] = useState<{ startedAt: number; offsetMs: number } | null>(null);
  const autoElapsed = useRef(0);
  const side = useRef<1 | 2>(1);
  // Read inside effects without re-running them: turning the voice on mid-set must not replay the briefing.
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  const autoNextRef = useRef(autoNext);
  autoNextRef.current = autoNext;
  // A hold that starts by itself after the auto-start lead-in.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHoldTimer = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  // The phase seen by the last run of the set-start effect: a set that follows a rest may start by itself.
  const lastPhase = useRef(state.phase);
  // The spoken language and gender, read the same way: a change applies from the next sentence on.
  const prefsRef = useRef<VoicePrefs>({ lang: voiceLang, gender: voiceGender });
  prefsRef.current = { lang: voiceLang, gender: voiceGender };
  const say = useCallback(
    (text: string, queue = false) => {
      if (voiceRef.current) speak(text, { queue, voice: prefsRef.current });
    },
    []
  );
  /** The phrases in the voice's language (not the app's). */
  const phrase = (key: keyof (typeof SPEECH_TEXT)['en']) => SPEECH_TEXT[prefsRef.current.lang][key];
  useEffect(() => {
    void preloadVoices();
    return () => {
      stopSpeaking();
      clearHoldTimer();
    };
  }, []);

  /** Switching language or gender cuts what is being said and introduces the new voice. */
  function changeVoice(next: Partial<VoicePrefs>) {
    if (next.lang) setVoiceLang(next.lang);
    if (next.gender) setVoiceGender(next.gender);
    prefsRef.current = { ...prefsRef.current, ...next };
    stopSpeaking();
    say(phrase('sample'));
  }
  const [ratings, setRatings] = useState<Partial<Record<ExerciseId, Rating>>>({});
  const logged = useRef(false);

  const step = state.steps[state.step];
  const ex = step ? EXERCISE_BY_ID[step.id] : undefined;
  const nowMs = clock.getTime();

  // Entering the rest phase starts its countdown; leaving it clears it.
  useEffect(() => {
    if (state.phase === 'rest') setRestEndsAt(Date.now() + state.restSec * 1000);
    else setRestEndsAt(null);
    setHoldStartedAt(null);
    setAuto(null);
    clearHoldTimer();
    side.current = 1;
  }, [state.phase, state.step, state.set, state.restSec]);

  // Spoken briefing when a set is about to start: the full steps on an exercise's first set, just "Set n of N" after.
  // With "auto start", a set that follows a rest gets a short intro and starts counting by itself.
  useEffect(() => {
    const fromRest = lastPhase.current === 'rest';
    lastPhase.current = state.phase;
    if (state.phase !== 'work' || !step || !ex) return;
    const autoBegin = fromRest && autoNextRef.current;
    if (voiceRef.current) {
      stopSpeaking();
      const lang = prefsRef.current.lang;
      (autoBegin ? introScript(step, ex, state.set, lang) : workScript(step, ex, state.set, lang)).forEach((line) =>
        speak(line, { queue: true, voice: prefsRef.current })
      );
    }
    if (autoBegin) {
      const lead = state.set === 0 ? NEW_EXERCISE_LEAD_MS : NEXT_SET_LEAD_MS;
      if (step.unit === 'reps') startAuto(lead);
      else startHold(lead);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.step, state.set]);

  // Rest: say how long and what comes next, then count the last seconds.
  useEffect(() => {
    if (state.phase !== 'rest' || !voiceRef.current) return;
    const next = state.steps[state.step];
    // Auto start reads the next exercise's steps now: its first set will not wait for a briefing.
    const withSteps = autoNextRef.current && state.set === 0;
    speak(restScript(state.restSec, next, next ? EXERCISE_BY_ID[next.id] : undefined, prefsRef.current.lang, withSteps), { voice: prefsRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.step, state.set, state.restSec]);

  const restLeft = restEndsAt === null ? 0 : Math.ceil((restEndsAt - nowMs) / 1000);
  useEffect(() => {
    if (state.phase === 'rest' && restEndsAt !== null && shouldCallRest(restLeft, state.restSec)) say(String(restLeft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, restLeft]);
  useEffect(() => {
    if (state.phase === 'rest' && restEndsAt !== null && restLeft <= 0) dispatch({ type: 'skipRest' });
  }, [state.phase, restEndsAt, restLeft]);

  const holdLeft = step && step.unit === 'seconds' && holdStartedAt !== null ? Math.ceil(step.amount - (nowMs - holdStartedAt) / 1000) : null;
  useEffect(() => {
    if (state.phase === 'work' && holdLeft !== null && holdLeft <= 0) dispatch({ type: 'finishSet' });
  }, [state.phase, holdLeft]);
  useEffect(() => {
    if (state.phase === 'work' && step && holdLeft !== null && shouldCallHold(holdLeft, step.amount)) say(String(holdLeft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, holdLeft]);

  // The auto count. Every tick asks the pure timeline what became due since the last tick; time is the source of
  // truth, so reaching the last rep ends the set with no tap needed.
  useEffect(() => {
    if (!auto || state.phase !== 'work' || !step || !ex || step.unit !== 'reps') return;
    const timeline = stepTimeline(step, ex);
    const alternate = ex.sides?.pattern === 'alternate';
    autoElapsed.current = auto.offsetMs;
    const id = setInterval(() => {
      const elapsed = auto.offsetMs + (Date.now() - auto.startedAt);
      const due = dueEvents(timeline, autoElapsed.current, elapsed);
      autoElapsed.current = elapsed;
      for (const e of due) {
        if (e.kind === 'rep') {
          dispatch({ type: 'setCount', count: e.spoken });
          say(String(e.spoken));
        } else if (e.kind === 'switch') {
          side.current = e.side ?? 2;
          // Block: the count restarts on the new side. Alternate: it counts pairs, so it carries on.
          if (!alternate) dispatch({ type: 'setCount', count: 0 });
          say(switchLine(ex, e.side ?? 2, prefsRef.current.lang), true);
        } else {
          setAuto(null);
          dispatch({ type: 'finishSet' });
        }
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, state.phase, state.step, state.set]);

  /** Starts (or resumes) the auto count. `leadMs`: extra quiet time first, while the queued intro is still being said
   *  (auto start after a rest); the "get ready" then queues behind it instead of cutting it. */
  function startAuto(leadMs = 0) {
    if (!step || !ex || step.unit !== 'reps') return;
    const timeline = stepTimeline(step, ex);
    const offsetMs = resumeOffsetMs(timeline, movesDone(step, ex, state.count, side.current === 2));
    if (leadMs === 0) stopSpeaking();
    if (offsetMs === 0) say([phrase('ready'), firstSideLine(step, ex, prefsRef.current.lang)].filter(Boolean).join(' '), leadMs > 0);
    setAuto({ startedAt: Date.now(), offsetMs: offsetMs - leadMs });
  }

  /** Starts a timed hold now, or after `leadMs` (auto start after a rest). */
  function startHold(leadMs = 0) {
    clearHoldTimer();
    const go = () => {
      holdTimer.current = null;
      setHoldStartedAt(Date.now());
      say(phrase('go'));
    };
    if (leadMs > 0) holdTimer.current = setTimeout(go, leadMs);
    else go();
  }

  /** A manual tap takes over from the timer: stop counting and silence what is queued. */
  function manual(action: Parameters<typeof dispatch>[0]) {
    if (auto) {
      setAuto(null);
      stopSpeaking();
    }
    dispatch(action);
  }

  // Log the workout exactly once, the moment the last set is finished.
  useEffect(() => {
    if (state.phase !== 'done' || logged.current) return;
    logged.current = true;
    const durationMin = Math.max(1, Math.ceil((Date.now() - startedAt.current) / 60_000));
    const kcal = estimateKcal(latestWeight?.weightKg ?? startWeightKg, durationMin);
    const solo = state.steps.length === 1;
    const label = solo
      ? exerciseName(EXERCISE_BY_ID[state.steps[0].id], lang)
      : group === 'A' || group === 'B' || group === 'C'
        ? g(`train.group.${group}` as GameKey)
        : g('train.title');
    addEntry({ templateId: `home-${group || 'x'}`, label, durationMin, caloriesBurned: kcal });
    setResult({ durationMin, kcal });
    say(phrase('allDone'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.steps, addEntry, latestWeight, startWeightKg, lang, g, group]);

  const bg = { backgroundColor: quest.bg };

  if (state.phase === 'done' && result) {
    const gained = minutesBefore.current < WORKOUT_MIN_MINUTES && minutesBefore.current + result.durationMin >= WORKOUT_MIN_MINUTES;
    const alreadyDone = minutesBefore.current >= WORKOUT_MIN_MINUTES;
    const now = new Date();
    const preview = state.steps.map((s) => {
      const rating = ratings[s.id];
      return { id: s.id, outcome: rating ? applyRating(progressFor(progress, s.id), rating, now) : null };
    });
    const ups = preview.filter((p) => p.outcome?.change === 'up');
    const ready = preview.filter((p) => p.outcome?.change === 'ready');
    const rateOptions: { key: Rating; label: GameKey }[] = [
      { key: 'easy', label: 'train.d.easy' },
      { key: 'medium', label: 'train.d.medium' },
      { key: 'hard', label: 'train.d.hard' },
    ];

    function finish() {
      stopSpeaking();
      if (Object.keys(ratings).length > 0) commitRatings(ratings, new Date());
      router.replace('/(tabs)');
    }

    return (
      <View style={[styles.screen, bg]}>
        <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 24 }]}>
          <View style={styles.center}>
            <View style={styles.medal}>
              <View style={styles.unrotate}>
                <QuestIcon name="check" size={40} color={quest.onGold} strokeWidth={3.2} />
              </View>
            </View>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {g('train.d.eyebrow', { g: group || '—', date: now.toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }) }).toUpperCase()}
            </HudText>
            <HudText size={26} accessibilityRole="header" style={styles.textCenter}>
              {g('train.d.title')}
            </HudText>
            {gained && (
              <HudText size={34} color={quest.xp}>
                {g('train.d.xp', { n: MISSION_XP.workout })}
              </HudText>
            )}
          </View>
          {!gained && (
            <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.textCenter}>
              {alreadyDone ? g('train.d.noXpAlready') : g('train.d.noXpShort', { m: result.durationMin, need: WORKOUT_MIN_MINUTES })}
            </HudText>
          )}

          <View style={styles.stats}>
            {[
              { v: String(result.durationMin), l: g('train.d.minutes') },
              { v: String(totalSetsDone(state)), l: g('train.d.sets'), h: g('train.d.setsHint', { n: state.steps.length }) },
              { v: `≈ ${result.kcal}`, l: g('train.d.kcal') },
            ].map((s) => (
              <View key={s.l} style={styles.stat}>
                <HudText size={22}>{s.v}</HudText>
                <HudText size={12} weight="medium" color={quest.textSecondary}>
                  {s.l}
                </HudText>
                {s.h ? (
                  <HudText size={11} weight="medium" color={quest.textSecondary}>
                    {s.h}
                  </HudText>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.panel}>
            <HudText size={16}>{g('train.d.rate')}</HudText>
            {state.steps.map((s) => {
              const name = exerciseName(EXERCISE_BY_ID[s.id], lang);
              return (
                <View key={s.id} style={styles.rateRow}>
                  <View style={styles.flex}>
                    <HudText size={15} numberOfLines={1}>
                      {name}
                    </HudText>
                    <HudText size={12} weight="medium" color={quest.textSecondary}>
                      {formatAmount(buildPrescription(s), lang)} · {g('train.level', { n: s.level })}
                    </HudText>
                  </View>
                  <View style={styles.rateButtons} accessibilityRole="radiogroup" accessibilityLabel={name}>
                    {rateOptions.map((o) => {
                      const on = ratings[s.id] === o.key;
                      return (
                        <Pressable
                          key={o.key}
                          accessibilityRole="radio"
                          accessibilityLabel={`${name}: ${g(o.label)}`}
                          accessibilityState={{ selected: on }}
                          onPress={() => setRatings((prev) => ({ ...prev, [s.id]: o.key }))}
                          style={[styles.rate, on && { backgroundColor: quest.gold }]}
                        >
                          <HudText size={13} color={on ? quest.onGold : quest.textSecondary}>
                            {g(o.label)}
                          </HudText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <HudText size={12} weight="medium" color={quest.textSecondary}>
              {g('train.d.rateHint')}
            </HudText>
          </View>

          <View style={[styles.panel, { borderColor: quest.gold }]}>
            <HudText size={11} color={quest.gold} style={styles.eyebrow}>
              {g('train.d.next').toUpperCase()}
            </HudText>
            {ups.map((p) => (
              <HudText key={p.id} size={14} color={quest.xp}>
                ↑ {g('train.d.nextUp', { name: exerciseName(EXERCISE_BY_ID[p.id], lang), n: p.outcome!.progress.level })}
              </HudText>
            ))}
            {ready.map((p) => (
              <HudText key={p.id} size={13} weight="medium" color={quest.textTertiary}>
                {g('train.d.nextReady', { name: exerciseName(EXERCISE_BY_ID[p.id], lang) })}
              </HudText>
            ))}
            {ups.length === 0 && ready.length === 0 && (
              <HudText size={13} weight="medium" color={quest.textTertiary}>
                {g('train.d.nextHold')}
              </HudText>
            )}
          </View>
        </ScrollView>
        <View style={[styles.footer, screenMaxWidthStyle, { paddingBottom: insets.bottom + 12 }]}>
          <QuestButton title={g('train.d.home')} icon="camp" onPress={finish} />
        </View>
      </View>
    );
  }

  if (!step || !ex) {
    return <View style={[styles.screen, bg]} />;
  }

  const name = exerciseName(ex, lang);
  const isTimed = step.unit === 'seconds';
  const resting = state.phase === 'rest';
  const nextStep = state.steps[state.step];
  const elapsed = (nowMs - startedAt.current) / 1000;
  const planRows = exercisePlan(step, ex, state.step > 0 ? state.steps[state.step - 1].restSec : null);
  const planIndex = activeRow(planRows, {
    phase: state.phase,
    set: state.set,
    elapsedMs: auto ? auto.offsetMs + (nowMs - auto.startedAt) : isTimed && holdStartedAt !== null ? nowMs - holdStartedAt : null,
    moves: isTimed ? 0 : movesDone(step, ex, state.count, side.current === 2),
  });
  const nowRow = planRows[planIndex];
  const using = voiceOn ? voiceInUse({ lang: voiceLang, gender: voiceGender }) : null;
  const bigNumber = resting ? restLeft : isTimed ? (holdLeft ?? step.amount) : state.count;
  const fraction = resting
    ? state.restSec > 0
      ? restLeft / state.restSec
      : 0
    : isTimed
      ? holdLeft === null
        ? 1
        : holdLeft / step.amount
      : Math.min(1, state.count / step.amount);

  return (
    <View style={[styles.screen, bg]}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('train.s.quit')}
            onPress={() =>
              confirmQuit(g('train.s.quitConfirm'), g('train.s.quitKeep'), g('train.s.quitLeave'), () => {
                stopSpeaking();
                leave();
              })
            }
            style={styles.close}
          >
            <QuestIcon name="x" size={20} color={quest.text} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.flex}>
            <HudText size={11} color={quest.gold} style={styles.eyebrow} numberOfLines={1}>
              {g('train.s.eyebrow', { i: state.step + 1, n: state.steps.length, xp: MISSION_XP.workout }).toUpperCase()}
            </HudText>
            <HudText size={22} accessibilityRole="header" numberOfLines={1}>
              {name}
            </HudText>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={g('train.v.label')}
            accessibilityState={{ checked: voiceOn }}
            onPress={() => {
              if (voiceOn) stopSpeaking();
              setVoiceOn(!voiceOn);
            }}
            style={[styles.close, voiceOn && { borderColor: quest.gold }]}
          >
            <QuestIcon name={voiceOn ? 'volume' : 'volumeOff'} size={20} color={voiceOn ? quest.gold : quest.textSecondary} strokeWidth={2.2} />
          </Pressable>
          <HudText size={13} weight="medium" color={quest.textSecondary} accessibilityLabel={g('train.s.elapsed', { t: formatClock(elapsed) })}>
            {formatClock(elapsed)}
          </HudText>
        </View>

        {voiceOn && (
          <View style={styles.voiceRow}>
            <VoiceOptions
              label={g('train.v.lang')}
              value={voiceLang}
              options={[
                { key: 'vi', label: g('train.v.vi') },
                { key: 'en', label: g('train.v.en') },
              ]}
              onChange={(lang: SpeechLang) => changeVoice({ lang })}
            />
            <VoiceOptions
              label={g('train.v.gender')}
              value={voiceGender}
              options={[
                { key: 'female', label: g('train.v.female') },
                { key: 'male', label: g('train.v.male') },
              ]}
              onChange={(gender: VoiceGender) => changeVoice({ gender })}
            />
          </View>
        )}
        {using && (
          <HudText size={11} weight="medium" color={using.exact ? quest.textTertiary : quest.manaText} style={styles.voiceHint}>
            {using.exact
              ? g('train.v.using', { name: using.name ?? '' })
              : using.name
                ? g('train.v.fallback', {
                    gender: (voiceGender === 'male' ? g('train.v.male') : g('train.v.female')).toLowerCase(),
                    lang: voiceLang === 'vi' ? g('train.v.vi') : g('train.v.en'),
                    name: using.name,
                  })
                : g('train.v.fallbackNone', { lang: voiceLang === 'vi' ? g('train.v.vi') : g('train.v.en') })}
          </HudText>
        )}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={g('train.s.autoNext')}
          accessibilityState={{ checked: autoNext }}
          onPress={() => {
            setAutoNext(!autoNext);
          }}
          style={styles.check}
        >
          <View style={[styles.box, autoNext && { backgroundColor: quest.gold, borderColor: quest.gold }]}>
            {autoNext && <QuestIcon name="check" size={14} color={quest.onGold} strokeWidth={3} />}
          </View>
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.flex}>
            {g('train.s.autoNext')}
          </HudText>
        </Pressable>

        <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {state.steps.map((s, i) => (
            <View key={i} style={styles.segGroup}>
              {Array.from({ length: s.sets }).map((_, k) => {
                const done = k < state.setsDone[i];
                return <View key={k} style={[styles.seg, done && { backgroundColor: quest.gold }]} />;
              })}
            </View>
          ))}
        </View>

        <View style={styles.center}>
          <Ring fraction={fraction} smooth={resting || isTimed}>
            <HudText size={11} color={quest.textSecondary} style={styles.eyebrow}>
              {(resting ? g('train.s.restTitle') : isTimed ? g('train.s.seconds') : g('train.s.reps')).toUpperCase()}
            </HudText>
            <Bump value={bigNumber} peak={resting ? 1 : 1.12}>
              <HudText size={72} accessibilityLiveRegion={resting ? 'none' : 'polite'}>
                {bigNumber}
              </HudText>
            </Bump>
            <HudText size={14} color={quest.textSecondary}>
              {g('train.s.setOf', { s: state.set + 1, t: step.sets })}
            </HudText>
          </Ring>
        </View>

        {resting ? (
          <View style={styles.panel}>
            <HudText size={14} weight="medium" color={quest.textTertiary}>
              {g('train.s.restNext', { name, rx: formatAmount(buildPrescription(nextStep), lang) })}
            </HudText>
          </View>
        ) : (
          <View style={styles.tip}>
            <ExerciseFigure id={ex.id} pose={nowRow?.pose ?? 1} width={96} side={nowRow?.side} showDir />
            <View style={styles.flex}>
              {nowRow && (
                <HudText size={15} color={quest.gold}>
                  {rowLabel(nowRow, step)}
                </HudText>
              )}
              <HudText size={14} weight="medium" color={quest.textTertiary}>
                {ex.steps[1][lang]}
              </HudText>
              {step.perSide && (
                <HudText size={12} weight="medium" color={quest.manaText}>
                  {g('train.s.perSideHint')}
                </HudText>
              )}
            </View>
          </View>
        )}

        <ExercisePlanList ex={ex} step={step} rows={planRows} active={planIndex} lang={lang} />
      </ScrollView>

      <View style={[styles.footer, screenMaxWidthStyle, { paddingBottom: insets.bottom + 12 }]}>
        {resting ? (
          <QuestButton title={g('train.s.skipRest')} variant="ghost" onPress={() => dispatch({ type: 'skipRest' })} />
        ) : isTimed ? (
          holdStartedAt === null ? (
            <QuestButton title={g('train.s.startTimer')} onPress={() => startHold()} />
          ) : (
            <QuestButton title={g('train.s.finishSet')} icon="check" onPress={() => dispatch({ type: 'finishSet' })} />
          )
        ) : (
          <View style={styles.footerCol}>
            {auto ? (
              <QuestButton title={g('train.s.autoStop')} variant="ghost" icon="x" onPress={() => manual({ type: 'setCount', count: state.count })} />
            ) : (
              <QuestButton title={g('train.s.autoStart')} icon="clock" onPress={() => startAuto()} />
            )}
            <View style={styles.footerRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={g('train.s.minusRep')} onPress={() => manual({ type: 'removeRep' })} style={styles.minus}>
                <QuestIcon name="minus" size={20} color={quest.text} strokeWidth={2.6} />
              </Pressable>
              <View style={styles.flex}>
                <QuestButton title={g('train.s.plusRep')} variant="ghost" onPress={() => manual({ type: 'addRep' })} />
              </View>
              <View style={styles.flex}>
                <QuestButton title={g('train.s.finishSet')} icon="check" onPress={() => manual({ type: 'finishSet' })} />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/** A two-way choice for the voice (language or gender), as a small segmented control. */
function VoiceOptions<K extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: K;
  options: { key: K; label: string }[];
  onChange: (key: K) => void;
}) {
  return (
    <View style={styles.rateButtons} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) onChange(o.key);
            }}
            style={[styles.rate, on && { backgroundColor: quest.gold }]}
          >
            <HudText size={13} color={on ? quest.onGold : quest.textSecondary}>
              {o.label}
            </HudText>
          </Pressable>
        );
      })}
    </View>
  );
}

function buildPrescription(s: { sets: number; amount: number; unit: 'reps' | 'seconds'; perSide: boolean; id: ExerciseId; level: 1 | 2 | 3 | 4 }) {
  return { ...EXERCISE_BY_ID[s.id].levels[s.level - 1] };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  flex: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', gap: 8 },
  textCenter: { textAlign: 'center' },
  eyebrow: { letterSpacing: 1.6 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { width: 44, height: 44, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  voiceHint: { textAlign: 'right' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: quest.border, alignItems: 'center', justifyContent: 'center' },
  voiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  segments: { flexDirection: 'row', gap: 8 },
  segGroup: { flex: 1, flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: quest.raised },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  panel: { padding: 14, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, gap: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: quest.bg },
  footerCol: { gap: 10 },
  footerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  minus: { width: 56, height: 56, borderRadius: questRadius.button, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, alignItems: 'center', justifyContent: 'center' },
  medal: { width: 84, height: 84, borderRadius: 22, backgroundColor: quest.gold, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], marginBottom: 14 },
  unrotate: { transform: [{ rotate: '-45deg' }] },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', padding: 12, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateButtons: { flexDirection: 'row', borderRadius: 10, backgroundColor: quest.bg, padding: 3, gap: 2 },
  rate: { minWidth: 44, minHeight: 36, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

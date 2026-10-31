import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useGameText } from '../../game/strings';
import type { Exercise } from '../../game/training/exercises';
import { formatRowTime, type PlanRow } from '../../game/training/plan';
import type { SessionStep } from '../../game/training/session';
import { sideWords } from '../../game/training/voice';
import { quest, questRadius } from '../../theme/quest';
import { ExerciseFigure } from './ExerciseFigure';
import { HudText } from './HudText';

interface Props {
  ex: Exercise;
  step: SessionStep;
  rows: PlanRow[];
  active: number;
  lang: 'vi' | 'en';
}

/** The text of one plan row: "Start · right leg", "Switch to left arm and right leg", "Rest 30 s"… */
export function usePlanRowLabel(lang: 'vi' | 'en') {
  const g = useGameText();
  return (row: PlanRow, step: SessionStep): string => {
    const side = row.side ? sideWords(row.side, lang) : '';
    switch (row.kind) {
      case 'rest':
        return g('train.tl.rest', { n: row.restSec ?? 0 });
      case 'ready':
        return side ? g('train.tl.readySide', { side }) : g('train.tl.ready');
      case 'go': {
        const what = step.unit === 'seconds' ? g('train.tl.hold', { n: step.amount }) : g('train.tl.reps', { n: step.amount });
        return side ? g('train.tl.goSide', { side, what }) : g('train.tl.go', { what });
      }
      case 'switch':
        return g('train.tl.switch', { side });
      case 'done':
        return g('train.tl.done');
    }
  };
}

/** Every set of the current exercise, step by step, with the rests between them; the row in progress is highlighted
 *  and kept in view. Each row has its own drawing with L / R / T / B letters. */
export function ExercisePlanList({ ex, step, rows, active, lang }: Props) {
  const g = useGameText();
  const rowLabel = usePlanRowLabel(lang);
  const label = (row: PlanRow) => rowLabel(row, step);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const activeKey = rows[active]?.key;

  useEffect(() => {
    if (!activeKey) return;
    const y = offsets.current[activeKey];
    if (y !== undefined) scroll.current?.scrollTo?.({ y: Math.max(0, y - 60), animated: true });
  }, [activeKey]);

  return (
    <View style={styles.box}>
      <HudText size={14} color={quest.gold}>
        {g('train.tl.title', { name: lang === 'en' ? ex.nameEn : ex.nameVi })}
      </HudText>
      <ScrollView ref={scroll} style={styles.scroll} nestedScrollEnabled>
        {rows.map((row, i) => {
          const header = row.kind !== 'rest' && (i === 0 || rows[i - 1].set !== row.set || rows[i - 1].kind === 'rest');
          const on = i === active;
          const past = active >= 0 && i < active;
          const color = on ? quest.text : past ? quest.textTertiary : quest.textSecondary;
          return (
            <View
              key={row.key}
              onLayout={(e) => {
                offsets.current[row.key] = e.nativeEvent.layout.y;
              }}
            >
              {header && (
                <HudText size={12} color={quest.gold} style={styles.setHeader}>
                  {g('train.tl.set', { s: row.set + 1, t: step.sets })}
                </HudText>
              )}
              <View
                style={[styles.row, on && styles.rowOn, row.kind === 'rest' && styles.rowRest]}
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${row.kind === 'rest' ? '' : `${formatRowTime(row.atMs)} `}${label(row)}`}
              >
                <HudText size={12} weight="medium" color={color} style={styles.time}>
                  {row.kind === 'rest' ? '' : formatRowTime(row.atMs)}
                </HudText>
                <View style={[styles.fig, past && styles.dim]}>
                  <ExerciseFigure id={ex.id} pose={row.pose} width={60} side={row.kind === 'rest' ? undefined : row.side} showDir={row.kind !== 'rest'} />
                </View>
                <HudText size={13} weight="medium" color={color} style={styles.flex}>
                  {past ? '✓ ' : ''}
                  {label(row)}
                </HudText>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, gap: 8 },
  scroll: { maxHeight: 300 },
  setHeader: { marginTop: 6, marginBottom: 2, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  rowOn: { borderColor: quest.gold, backgroundColor: quest.raised },
  rowRest: { marginVertical: 4 },
  time: { width: 42 },
  fig: { width: 60 },
  dim: { opacity: 0.45 },
  flex: { flex: 1, minWidth: 0 },
});

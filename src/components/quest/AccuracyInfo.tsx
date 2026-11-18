import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { explainAccuracy, type AccuracyAction, type AccuracyLine, type FoodAccuracy, type MissingLine } from '../../ai/accuracyWhy';
import { useGameText, type GameKey } from '../../game/strings';
import { quest } from '../../theme/quest';
import { BottomSheet } from './BottomSheet';
import { HudText } from './HudText';
import { QuestButton } from './QuestButton';

/** The colour of an accuracy: green ≥70, gold 50–69, red below; the food database in mana blue. */
export function accuracyColor(acc: Pick<FoodAccuracy, 'pct' | 'source'>): string {
  if (acc.source === 'db' || acc.pct === null) return quest.manaText;
  return acc.pct >= 70 ? quest.xp : acc.pct >= 50 ? quest.goldLight : quest.hpText;
}

export interface AccuracySheetProps {
  accuracy: FoodAccuracy | null;
  onClose: () => void;
  /** A "Còn thiếu" line's action: add a phrase to "Ghi chú cho AI" (`prefill`), or edit an amount. Left out: no action buttons. */
  onAction?: (action: AccuracyAction, prefill?: string) => void;
  /** "Phân tích lại với ghi chú" in the footer (the meal being logged). */
  onReanalyze?: () => void;
}

/** The tooltip sheet behind every "chính xác ~XX%": the % and its level, "Vì sao" (the AI's reasons or what the app knows),
 *  "Còn thiếu" (with a one-tap action where there is one) and up to 4 tips to photograph or describe the food better. */
export function AccuracySheet({ accuracy, onClose, onAction, onReanalyze }: AccuracySheetProps) {
  const g = useGameText();
  if (!accuracy) return null;
  const e = explainAccuracy(accuracy);
  const text = (l: AccuracyLine) => ('text' in l ? l.text : g(l.key, l.params));
  const photoTips = accuracy.source === 'photo' || accuracy.source === 'label' || (accuracy.photos ?? 0) > 0;
  const act = (m: MissingLine) => {
    if (!m.action || !onAction) return;
    onClose();
    onAction(m.action, m.prefill);
  };
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={e.pct !== null ? g('accWhy.title', { pct: e.pct }) : g('accWhy.titleDb')}
      subtitle={e.level ? g(`accWhy.level.${e.level}` as GameKey) : undefined}
      footer={
        <View style={styles.footer}>
          {onReanalyze ? (
            <QuestButton
              title={g('accWhy.reanalyze')}
              icon="chart"
              onPress={() => {
                onClose();
                onReanalyze();
              }}
            />
          ) : null}
          <QuestButton title={g('accWhy.ok')} variant="ghost" onPress={onClose} />
        </View>
      }
      testID="accuracy-sheet"
    >
      <View style={styles.body}>
        {e.up.length + e.down.length > 0 && (
          <Section title={g('accWhy.why')}>
            {e.up.map((l, i) => (
              <Bullet key={`u${i}`} mark="✓" color={quest.xp} text={text(l)} />
            ))}
            {e.down.map((l, i) => (
              <Bullet key={`d${i}`} mark="−" color={quest.goldLight} text={text(l)} />
            ))}
          </Section>
        )}
        {e.missing.length > 0 && (
          <Section title={g('accWhy.missing')}>
            {e.missing.map((m, i) => (
              <View key={`m${i}`} style={styles.missRow}>
                <View style={styles.flex}>
                  <Bullet mark="?" color={quest.manaText} text={text(m.line)} />
                </View>
                {m.action && onAction ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${m.action === 'notes' ? g('accWhy.addNote') : g('accWhy.editAmount')}: ${text(m.line)}`}
                    onPress={() => act(m)}
                    style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
                    testID={`accuracy-action-${i}`}
                  >
                    <HudText size={12} color={quest.gold}>
                      {m.action === 'notes' ? g('accWhy.addNote') : g('accWhy.editAmount')}
                    </HudText>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Section>
        )}
        {e.tips.length > 0 && (
          <Section title={photoTips ? g('accWhy.tips') : g('accWhy.tipsText')}>
            {e.tips.map((k, i) => (
              <Bullet key={k} mark={`${i + 1}.`} color={quest.textSecondary} text={g(k)} />
            ))}
          </Section>
        )}
      </View>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <HudText size={13} color={quest.text}>
        {title}
      </HudText>
      {children}
    </View>
  );
}

function Bullet({ mark, color, text }: { mark: string; color: string; text: string }) {
  return (
    <View style={styles.bullet}>
      <HudText size={13} color={color} style={styles.mark}>
        {mark}
      </HudText>
      <HudText size={13} weight="medium" color={quest.textTertiary} style={styles.flex}>
        {text}
      </HudText>
    </View>
  );
}

export interface AccuracyBadgeProps extends Omit<AccuracySheetProps, 'accuracy' | 'onClose'> {
  accuracy: FoodAccuracy;
  /** What the badge says (default "chính xác ~XX% ⓘ"); an ⓘ is added when it has none. */
  label?: string;
  size?: number;
  color?: string;
  /** Drawn as a pill (the meal badge) instead of plain text. */
  pill?: boolean;
  testID?: string;
}

/** A tappable "chính xác ~XX% ⓘ" (at least 44 pt to tap, via hitSlop on small text) that opens the AccuracySheet. */
export function AccuracyBadge({ accuracy, label, size = 12, color, pill, testID, ...sheet }: AccuracyBadgeProps) {
  const g = useGameText();
  const [open, setOpen] = useState(false);
  const raw = label ?? (accuracy.pct !== null ? g('accWhy.badge', { pct: accuracy.pct }) : g('text.fromDb'));
  const shown = raw.includes('ⓘ') ? raw : `${raw} ⓘ`;
  const tint = color ?? accuracyColor(accuracy);
  // Text of `size` pt is about size*1.4 high: the slop makes the target at least 44 pt.
  const slop = Math.max(4, Math.ceil((44 - size * 1.4 - (pill ? 8 : 0)) / 2));
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accuracy.pct !== null ? g('accWhy.a11y', { pct: accuracy.pct }) : g('accWhy.a11yDb')}
        onPress={() => setOpen(true)}
        hitSlop={{ top: slop, bottom: slop, left: 6, right: 6 }}
        style={({ pressed }) => [pill ? [styles.pill, { borderColor: tint }] : styles.plain, pressed && { opacity: 0.7 }]}
        testID={testID}
      >
        <HudText size={size} weight={pill ? undefined : 'medium'} color={tint} numberOfLines={1}>
          {shown}
        </HudText>
      </Pressable>
      {open && <AccuracySheet accuracy={accuracy} onClose={() => setOpen(false)} {...sheet} />}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  section: { gap: 6 },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  mark: { minWidth: 16 },
  flex: { flex: 1 },
  missRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  footer: { gap: 8 },
  plain: { alignSelf: 'flex-start' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, backgroundColor: quest.raised },
});

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useGameText } from '../../game/strings';
import { quest, questFonts, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon } from './QuestIcon';

/** Hold − or + this long before it starts repeating, then one step every REPEAT_MS. */
export const STEPPER_HOLD_MS = 400;
export const STEPPER_REPEAT_MS = 90;

export interface StepperProps {
  value: number;
  /** Called with each new value: from − / +, a held button (repeats) or a typed number inside min…max. */
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Digits after the point (weight 1 → "79.4"). */
  decimals?: number;
  /** Shown under the number ("kg"). */
  unit?: string;
  /** Small line under the number instead of the unit alone ("kg · lần trước 79.4"). */
  caption?: string;
  /** Accessible name of the number (and of the text field when it can be typed in). */
  label: string;
  /** Accessible names of − and + (default "Giảm 0.1 kg" / "Tăng 0.1 kg"). */
  lessLabel?: string;
  moreLabel?: string;
  /** The number can be typed in (default true). */
  editable?: boolean;
  /** Told whether the typed text is a valid number within min…max, so the screen can refuse to save. */
  onValidChange?: (valid: boolean) => void;
  /** Marks the field as wrong (e.g. after a refused save). */
  invalid?: boolean;
  /** `big` = 64 pt buttons and a 44 pt number (weight); `small` = 44 pt buttons (portions in a row). */
  size?: 'big' | 'small';
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/** The number a typed text means, or null when it is not one ("," works as the decimal point). */
export function parseStepperText(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '' || !/^-?\d*\.?\d*$/.test(trimmed)) return null;
  const v = parseFloat(trimmed);
  return Number.isFinite(v) ? v : null;
}

/** − big value + with long-press repeat, step, min / max and decimals; the number can also be typed in. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  decimals = 0,
  unit,
  caption,
  label,
  lessLabel,
  moreLabel,
  editable = true,
  onValidChange,
  invalid,
  size = 'big',
}: StepperProps) {
  const g = useGameText();
  const format = (v: number) => v.toFixed(decimals);
  const [draft, setDraft] = useState(() => format(value));
  const current = useRef(value);
  const repeat = useRef<{ hold: ReturnType<typeof setTimeout> | null; tick: ReturnType<typeof setInterval> | null }>({ hold: null, tick: null });
  // Set once a held button has repeated, so letting go does not add one more step.
  const repeated = useRef(false);
  current.current = value;

  // A value set from outside (or by a step) replaces the text, unless the text already means it ("79." while typing 79.5).
  useEffect(() => {
    if (parseStepperText(draft) !== value) setDraft(format(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => stopRepeat(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopRepeat() {
    if (repeat.current.hold) clearTimeout(repeat.current.hold);
    if (repeat.current.tick) clearInterval(repeat.current.tick);
    repeat.current = { hold: null, tick: null };
  }

  function bump(dir: -1 | 1): boolean {
    const next = clamp(roundTo(current.current + dir * step, decimals), min, max);
    if (next === current.current) return false;
    current.current = next;
    onChange(next);
    onValidChange?.(true);
    return true;
  }

  function startRepeat(dir: -1 | 1) {
    stopRepeat();
    repeated.current = false;
    repeat.current.hold = setTimeout(() => {
      repeat.current.tick = setInterval(() => {
        repeated.current = true;
        if (!bump(dir)) stopRepeat();
      }, STEPPER_REPEAT_MS);
    }, STEPPER_HOLD_MS);
  }

  function onText(text: string) {
    setDraft(text);
    const v = parseStepperText(text);
    const ok = v != null && v >= min && v <= max;
    onValidChange?.(ok);
    if (ok && v !== current.current) {
      current.current = v;
      onChange(v);
    }
  }

  const stepText = `${format(step).replace(/\.0+$/, '')}${unit ? ` ${unit}` : ''}`;
  const big = size === 'big';
  const button = (dir: -1 | 1) => {
    const disabled = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dir < 0 ? (lessLabel ?? g('ui.stepLess', { step: stepText })) : (moreLabel ?? g('ui.stepMore', { step: stepText }))}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          if (!repeated.current) bump(dir);
          repeated.current = false;
        }}
        onPressIn={() => startRepeat(dir)}
        onPressOut={stopRepeat}
        style={({ pressed }) => [big ? styles.btnBig : styles.btnSmall, disabled && styles.off, pressed && styles.pressed]}
      >
        <QuestIcon name={dir < 0 ? 'minus' : 'plus'} size={big ? 22 : 18} color={quest.text} strokeWidth={2.6} />
      </Pressable>
    );
  };

  const numberSize = big ? 44 : 18;
  return (
    <View style={[styles.row, big ? styles.rowBig : styles.rowSmall]}>
      {button(-1)}
      <View style={[styles.middle, big && styles.middleBig]}>
        {editable ? (
          <TextInput
            accessibilityLabel={label}
            keyboardType="decimal-pad"
            value={draft}
            onChangeText={onText}
            onBlur={() => setDraft(format(current.current))}
            selectTextOnFocus
            style={[styles.input, { fontSize: numberSize }, big ? styles.inputBig : styles.inputSmall, invalid && styles.inputInvalid]}
          />
        ) : (
          <HudText size={numberSize} accessibilityLabel={`${label}: ${format(value)}${unit ? ` ${unit}` : ''}`} style={styles.center}>
            {format(value)}
          </HudText>
        )}
        {(caption ?? unit) && big ? (
          <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.center} numberOfLines={1}>
            {caption ?? unit}
          </HudText>
        ) : null}
      </View>
      {button(1)}
    </View>
  );
}

const btnBase = {
  backgroundColor: quest.raised,
  borderWidth: 1.5,
  borderColor: quest.border,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBig: { gap: 12, justifyContent: 'center' },
  rowSmall: { gap: 4 },
  middle: { minWidth: 54, alignItems: 'center' },
  middleBig: { flex: 1, minWidth: 0, maxWidth: 200 },
  btnBig: { ...btnBase, width: 64, height: 64, borderRadius: 16 },
  btnSmall: { ...btnBase, width: 44, height: 44, borderRadius: questRadius.row },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  input: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: questFonts.bold,
    color: quest.text,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: questRadius.row,
    padding: 0,
  },
  inputBig: { minHeight: 56 },
  inputSmall: { minHeight: 44, minWidth: 54 },
  inputInvalid: { borderColor: quest.hp },
  center: { textAlign: 'center' },
});

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { quest, questRadius } from '../../theme/quest';
import { HudText } from './HudText';
import { QuestIcon, type QuestIconName } from './QuestIcon';

/** An icon on a tinted tile, the colour telling the settings apart at a glance (Profile › Cài đặt, mockup 08). */
export function IconTile({ icon, color, emoji }: { icon?: QuestIconName; color: string; emoji?: string }) {
  return (
    <View style={[styles.tile, { borderColor: color, backgroundColor: `${color}22` }]}>
      {emoji ? <HudText size={17}>{emoji}</HudText> : icon ? <QuestIcon name={icon} size={18} color={color} strokeWidth={2.2} /> : null}
    </View>
  );
}

/** 12 pt eyebrow over a group of rows. */
export function SettingsGroupTitle({ children }: { children: string }) {
  return (
    <HudText size={12} color={quest.textSecondary} style={styles.groupTitle} accessibilityRole="header">
      {children.toUpperCase()}
    </HudText>
  );
}

/** Rows of one group in one panel, separated by hairlines. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export interface SettingsLinkRowProps {
  icon?: QuestIconName;
  emoji?: string;
  color?: string;
  label: string;
  /** The current value, on the right ("2.5 L · 6–21h"). */
  value?: string;
  onPress: () => void;
  first?: boolean;
}

/** A row that opens a page: tinted icon, name, the current value on the right and ›. */
export function SettingsLinkRow({ icon, emoji, color = quest.gold, label, value, onPress, first }: SettingsLinkRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <IconTile icon={icon} emoji={emoji} color={color} />
      <HudText size={15} style={styles.label} numberOfLines={1}>
        {label}
      </HudText>
      {value ? (
        <HudText size={13} weight="medium" color={quest.textSecondary} numberOfLines={1} style={styles.value}>
          {value}
        </HudText>
      ) : null}
      <QuestIcon name="chevron" size={18} color={quest.textSecondary} />
    </Pressable>
  );
}

export interface SettingsSwitchRowProps {
  icon?: QuestIconName;
  emoji?: string;
  color?: string;
  label: string;
  /** One line (≤ 60 characters) under the name. */
  hint?: string;
  /** An ⓘ button next to the hint. */
  info?: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** A status line under the hint (gold), e.g. why the switch stayed off. */
  note?: string | null;
  noteColor?: string;
  first?: boolean;
}

/** A row with a switch: tinted icon, name, a one-line hint (+ ⓘ), an optional status line. */
export function SettingsSwitchRow({ icon, emoji, color = quest.gold, label, hint, info, value, onChange, disabled, note, noteColor, first }: SettingsSwitchRowProps) {
  return (
    <View style={[styles.row, styles.switchRow, !first && styles.divider]}>
      <IconTile icon={icon} emoji={emoji} color={color} />
      <View style={styles.label}>
        <HudText size={15}>{label}</HudText>
        {hint || info ? (
          <View style={styles.hintRow}>
            {hint ? (
              <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.hintText}>
                {hint}
              </HudText>
            ) : null}
            {info}
          </View>
        ) : null}
        {note ? (
          <HudText size={12} weight="medium" color={noteColor ?? quest.gold} accessibilityLiveRegion="polite">
            {note}
          </HudText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: quest.raised2, true: quest.gold }}
        thumbColor={quest.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { letterSpacing: 1.4, marginTop: 20, marginBottom: 8 },
  group: { borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  switchRow: { minHeight: 64 },
  divider: { borderTopWidth: 1, borderTopColor: quest.border },
  pressed: { backgroundColor: quest.raised },
  label: { flex: 1, minWidth: 0 },
  value: { maxWidth: '48%', textAlign: 'right' },
  hintRow: { flexDirection: 'row', alignItems: 'center', marginVertical: -8 },
  hintText: { flexShrink: 1 },
});

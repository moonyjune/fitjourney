import { Pressable, StyleSheet, View } from 'react-native';
import { quest } from '../../theme/quest';

export interface HitSwitchProps {
  accessibilityLabel: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** Track colour when on. */
  color?: string;
}

/** An on / off switch with a 44 pt tap area (the platform switch is 40 × 20 on the web and has a second, unlabelled focus stop
 *  there). Drawn here as a track and a thumb; the Pressable around it is the one control screen readers and taps see. */
export function HitSwitch({ accessibilityLabel, value, onValueChange, disabled, color = quest.gold }: HitSwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[styles.hit, disabled && styles.disabled]}
    >
      <View style={[styles.track, { backgroundColor: value ? color : quest.raised2 }]}>
        <View style={[styles.thumb, value ? styles.thumbOn : null]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  thumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: quest.text },
  thumbOn: { alignSelf: 'flex-end' },
});

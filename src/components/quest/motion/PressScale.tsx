import { useEffect, useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { DURATION, EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface PressScaleProps extends PressableProps {
  /** Scale while pressed. */
  scaleTo?: number;
  /** Layout style for the wrapper that scales (e.g. `{ flex: 1 }`); the Pressable's own `style` is unchanged. */
  wrapperStyle?: StyleProp<ViewStyle>;
}

/** A Pressable that squishes slightly under the finger and springs back. Props, accessibility and `style` behave exactly
 *  like Pressable's; with reduced motion it does not scale. */
export function PressScale({ scaleTo = 0.96, wrapperStyle, onPressIn, onPressOut, ...rest }: PressScaleProps) {
  const enabled = useMotionEnabled();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => () => scale.stopAnimation(), [scale]);

  const to = (value: number, duration: number) => {
    if (!enabled) return;
    Animated.timing(scale, { toValue: value, duration, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER }).start();
  };

  return (
    <Animated.View style={[wrapperStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        onPressIn={(e) => {
          if (!rest.disabled) to(scaleTo, DURATION.press);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          to(1, DURATION.fast);
          onPressOut?.(e);
        }}
      />
    </Animated.View>
  );
}

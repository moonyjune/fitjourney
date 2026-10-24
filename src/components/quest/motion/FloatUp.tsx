import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { DURATION, EASE_OUT, NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface FloatUpProps {
  /** Plays once each time this turns from false to true (never at first render). */
  play: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  distance?: number;
}

/** A short-lived label (e.g. "+60 XP") that rises and fades out. Renders nothing before and after, so it adds nothing to
 *  the tree or to what a screen reader finds. */
export function FloatUp({ play, children, style, distance = 28 }: FloatUpProps) {
  const enabled = useMotionEnabled();
  const [visible, setVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const previous = useRef(play);

  useEffect(() => {
    const started = play && !previous.current;
    previous.current = play;
    if (!enabled) {
      setVisible(false);
      return;
    }
    if (!started) return;
    progress.setValue(0);
    setVisible(true);
    const run = Animated.timing(progress, { toValue: 1, duration: DURATION.celebrate, easing: EASE_OUT, useNativeDriver: NATIVE_DRIVER });
    run.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => {
      run.stop();
      setVisible(false);
    };
  }, [play, enabled, progress]);

  if (!visible) return null;
  return (
    <Animated.View
      style={[
        style,
        {
          pointerEvents: 'none',
          opacity: progress.interpolate({ inputRange: [0, 0.12, 0.7, 1], outputRange: [0, 1, 1, 0] }),
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

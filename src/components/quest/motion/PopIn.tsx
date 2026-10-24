import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { NATIVE_DRIVER, useMotionEnabled } from './tokens';

interface PopInProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** The pop plays when this turns true. */
  active?: boolean;
  /** Also play when it is already active at first render. false = only pop on a later change (a check being earned). */
  playOnMount?: boolean;
}

/** A small springy "pop" (scale overshoot) for check marks and badges that have just been earned. */
export function PopIn({ children, style, active = true, playOnMount = true }: PopInProps) {
  const enabled = useMotionEnabled();
  const scale = useRef(new Animated.Value(1)).current;
  const wasActive = useRef(active);
  const mounted = useRef(false);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    const play = active && (first ? playOnMount : !wasActive.current);
    wasActive.current = active;
    if (!enabled || !play) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.4);
    const run = Animated.spring(scale, { toValue: 1, friction: 4, tension: 150, useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [active, enabled, playOnMount, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated } from 'react-native';
import { EASE_OUT, useMotionEnabled } from './tokens';

/** Counts from the old value to the new one whenever `value` changes. The first render shows `value` immediately (no
 *  count-up from zero), so a screen never opens with a wrong number. Snaps with reduced motion. */
export function useCountUp(value: number, duration = 600): number {
  const enabled = useMotionEnabled();
  const [shown, setShown] = useState(value);
  const last = useRef(value);

  useEffect(() => {
    if (!enabled || last.current === value) {
      last.current = value;
      setShown(value);
      return;
    }
    const driver = new Animated.Value(last.current);
    const id = driver.addListener(({ value: v }) => {
      last.current = v;
      setShown(Math.round(v));
    });
    const run = Animated.timing(driver, { toValue: value, duration, easing: EASE_OUT, useNativeDriver: false });
    run.start(({ finished }) => {
      if (finished) {
        last.current = value;
        setShown(value);
      }
    });
    return () => {
      run.stop();
      driver.removeListener(id);
    };
  }, [value, enabled, duration]);

  return shown;
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  /** Renders the (rounded) number currently on display. */
  children: (shown: number) => ReactNode;
}

export function AnimatedNumber({ value, duration, children }: AnimatedNumberProps) {
  return <>{children(useCountUp(value, duration))}</>;
}

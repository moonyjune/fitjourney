import { Animated } from 'react-native';
import { forwardRef, type ComponentProps, type ComponentType } from 'react';

/** Animated wraps its target and adds `collapsable={false}`, which react-native-svg on web copies onto the DOM node
 *  (React then warns about a non-boolean attribute). Drop it before it reaches the SVG element; the ref still goes
 *  through so Animated can update the shape directly. */
export function animatedSvg<P extends object>(Shape: ComponentType<P>) {
  const Wrapped = forwardRef<unknown, P & { collapsable?: boolean }>(function Wrapped({ collapsable: _collapsable, ...rest }, ref) {
    return <Shape {...(rest as unknown as P)} ref={ref as never} />;
  });
  return Animated.createAnimatedComponent(Wrapped as ComponentType<P & ComponentProps<typeof Wrapped>>);
}

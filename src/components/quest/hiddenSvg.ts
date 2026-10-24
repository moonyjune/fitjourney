import { Platform } from 'react-native';

/** Props that hide a decorative <Svg> from screen readers. react-native-svg on web copies unknown props onto the DOM
 *  <svg>, so the native-only pair would trigger React's "does not recognize the prop" warning there; use aria-hidden. */
export const hiddenSvgProps =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);

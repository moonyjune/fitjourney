import type { ViewStyle } from 'react-native';

// Every screen is designed mobile-first and looks right at phone widths already; the gap is
// wide viewports (tablet landscape, desktop web), where content stretched edge-to-edge reads as
// broken (600px+ wide buttons, unreadable full-bleed text). Capping and centering a content
// column is the standard fix and costs nothing at phone widths (maxWidth simply never engages).
export const CONTENT_MAX_WIDTH = 640;

export const screenMaxWidthStyle: ViewStyle = {
  width: '100%',
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: 'center',
};

/** A chart's `width` prop must match its actual rendered container width or it overflows past
 *  the Card (react-native-chart-kit draws a fixed-size SVG, it doesn't shrink to fit). The
 *  container is `screenMaxWidthStyle`-capped at CONTENT_MAX_WIDTH and padded by spacing.base (16)
 *  on each side, so the chart width must apply that same cap, not just the raw window width. */
export function chartWidthFor(windowWidth: number): number {
  return Math.min(windowWidth, CONTENT_MAX_WIDTH) - 32;
}

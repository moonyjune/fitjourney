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

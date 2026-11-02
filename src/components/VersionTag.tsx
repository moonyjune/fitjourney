import { StyleSheet } from 'react-native';
import { HudText } from './quest/HudText';
import { quest } from '../theme/quest';
import { APP_VERSION } from '../utils/buildInfo';

/** "v0.26.0" under the logo (sign-in and the intro), so it is easy to see which release a browser has loaded. */
export function VersionTag() {
  return (
    <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.tag} testID="version-tag">
      {`v${APP_VERSION}`}
    </HudText>
  );
}

const styles = StyleSheet.create({
  tag: { letterSpacing: 1.2, textAlign: 'center' },
});

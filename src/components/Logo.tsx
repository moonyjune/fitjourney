import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { GOLDEN_RATIO, colors } from '../theme/tokens';

interface LogoProps {
  /** Diameter of the outer ring, in px. */
  size?: number;
  showWordmark?: boolean;
  tint?: string;
  wordmarkColor?: string;
}

/** Vector app mark: a ring with a flame core sized by the golden ratio, plus an optional wordmark. */
export function Logo({ size = 72, showWordmark = false, tint = colors.primary, wordmarkColor }: LogoProps) {
  const { t } = useTranslation();
  const coreSize = size / GOLDEN_RATIO;
  return (
    <View style={styles.wrap}>
      <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: tint }]}>
        <View style={[styles.core, { width: coreSize, height: coreSize, borderRadius: coreSize / 2, backgroundColor: tint }]}>
          <Text style={{ fontSize: coreSize * 0.52 }}>🔥</Text>
        </View>
      </View>
      {showWordmark && (
        <Text style={[styles.wordmark, { color: wordmarkColor ?? tint }]} numberOfLines={1}>
          {t('app.name')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  ring: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  core: { alignItems: 'center', justifyContent: 'center' },
  wordmark: { marginTop: 12, fontSize: 20, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
});

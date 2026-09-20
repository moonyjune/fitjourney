import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { Button } from '../src/components/Button';
import { Logo } from '../src/components/Logo';
import { useTranslation } from '../src/i18n/useTranslation';
import { colors, radius, spacing, typography } from '../src/theme/tokens';
import { screenMaxWidthStyle } from '../src/theme/responsive';

export default function AuthScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert(t('auth.missingFieldsTitle'), t('auth.missingFieldsMessage'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        Alert.alert(t('auth.checkEmailTitle'), t('auth.checkEmailMessage'));
      }
      // RootLayout listens to auth state changes and will navigate away automatically.
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={screenMaxWidthStyle}>
        <Logo size={64} showWordmark />
        <Text style={styles.subtitle}>{mode === 'signIn' ? t('auth.subtitleSignIn') : t('auth.subtitleSignUp')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Button
          title={busy ? t('common.loading') : mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
          onPress={handleSubmit}
          loading={busy}
          style={{ marginTop: spacing.md }}
        />

        <TouchableOpacity onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          <Text style={styles.switchModeText}>{mode === 'signIn' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, justifyContent: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.base, marginBottom: spacing.xxl },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  switchModeText: { textAlign: 'center', color: colors.primary, marginTop: spacing.lg, ...typography.caption },
});

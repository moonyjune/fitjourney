import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { Button } from '../src/components/Button';
import { useTranslation } from '../src/i18n/useTranslation';
import { colors, radius, spacing, typography } from '../src/theme/tokens';

export default function AuthScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập email và mật khẩu.');
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
        Alert.alert('Kiểm tra email', 'Nếu dự án bật xác nhận email, hãy xác nhận trước khi đăng nhập.');
      }
      // RootLayout listens to auth state changes and will navigate away automatically.
    } catch (err) {
      Alert.alert('Lỗi', err instanceof Error ? err.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>{t('auth.title')}</Text>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, justifyContent: 'center' },
  title: { ...typography.h2, textAlign: 'center', marginBottom: spacing.sm, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xxl },
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

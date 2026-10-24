import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { supabase } from '../src/lib/supabase';
import { HudText } from '../src/components/quest/HudText';
import { QuestButton } from '../src/components/quest/QuestButton';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestSegment } from '../src/components/quest/QuestSegment';
import { FitJourneyLogo } from '../src/components/FitJourneyLogo';
import { useGameText } from '../src/game/strings';
import { useTranslation } from '../src/i18n/useTranslation';
import { quest } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';
import { SHOW_FORGOT_PASSWORD } from '../src/config/flags';
import { enterDevMode } from '../src/dev/devLogin';
import { loadRememberedCredentials, saveRememberedCredentials } from '../src/utils/rememberedCredentials';

type Mode = 'signIn' | 'signUp';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  useLightStatusBar();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNote, setResetNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Pre-fill from the last successful sign-in, so re-authenticating after the 24h session
  // expiry (see app/_layout.tsx) doesn't mean retyping credentials from scratch.
  useEffect(() => {
    loadRememberedCredentials().then((saved) => {
      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
      }
    });
  }, []);

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
        await saveRememberedCredentials(email, password);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        await saveRememberedCredentials(email, password);
        Alert.alert(t('auth.checkEmailTitle'), t('auth.checkEmailMessage'));
      }
      // RootLayout listens to auth state changes and will navigate away automatically.
    } catch (err) {
      Alert.alert(t('common.error'), err instanceof Error ? err.message : t('auth.genericError'));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    const address = email.trim();
    if (!address) {
      setResetNote({ kind: 'error', text: g('auth.forgotNeedEmail') });
      return;
    }
    if (!EMAIL_PATTERN.test(address)) {
      setResetNote({ kind: 'error', text: g('auth.forgotInvalidEmail') });
      return;
    }
    setResetBusy(true);
    setResetNote(null);
    try {
      // On web the reset link must come back to this site; on native Supabase uses the project's configured redirect.
      const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(address, redirectTo ? { redirectTo } : undefined);
      // Same wording for any account: Supabase itself doesn't say whether the address exists, and neither do we.
      setResetNote(error ? { kind: 'error', text: error.message || g('auth.forgotError') } : { kind: 'ok', text: g('auth.forgotSent', { email: address }) });
    } catch {
      setResetNote({ kind: 'error', text: g('auth.forgotError') });
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, screenMaxWidthStyle]} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <FitJourneyLogo width={76} />
          <HudText size={26} accessibilityRole="header" style={styles.center}>
            {t('auth.title')}
          </HudText>
          <HudText size={14} weight="medium" color={quest.textSecondary} style={styles.center}>
            {mode === 'signIn' ? t('auth.subtitleSignIn') : t('auth.subtitleSignUp')}
          </HudText>
        </View>

        <QuestSegment<Mode>
          accessibilityLabel={t('auth.title')}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setResetNote(null);
          }}
          options={[
            { value: 'signIn', label: t('auth.signIn') },
            { value: 'signUp', label: t('auth.signUp') },
          ]}
        />

        <QuestField
          label={t('auth.email')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setResetNote(null);
          }}
        />
        <QuestField
          label={t('auth.password')}
          secureTextEntry
          autoCapitalize="none"
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleSubmit}
        />

        <QuestButton
          title={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
          onPress={handleSubmit}
          loading={busy}
          icon="chevron"
        />

        {mode === 'signIn' && SHOW_FORGOT_PASSWORD && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={g('auth.forgot')}
            accessibilityState={{ disabled: resetBusy, busy: resetBusy }}
            disabled={resetBusy}
            onPress={handleForgotPassword}
            style={({ pressed }) => [styles.link, (pressed || resetBusy) && { opacity: 0.7 }]}
          >
            <HudText size={14} color={quest.manaText}>
              {resetBusy ? g('auth.forgotSending') : g('auth.forgot')}
            </HudText>
          </Pressable>
        )}
        {__DEV__ && (
          // Development only (absent from production builds): skips sign-in and loads three weeks of dummy data.
          <QuestButton variant="ghost" title="Login Dev (dữ liệu mẫu)" icon="flame" onPress={enterDevMode} />
        )}
        {resetNote && (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.note, resetNote.kind === 'ok' ? styles.noteOk : styles.noteError]}
          >
            <HudText size={13} weight="medium" color={resetNote.kind === 'ok' ? quest.manaText : quest.hpText}>
              {resetNote.text}
            </HudText>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  brand: { alignItems: 'center', gap: 8, marginBottom: 8 },
  center: { textAlign: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  note: { borderWidth: 1.5, borderRadius: 12, padding: 12 },
  noteOk: { backgroundColor: quest.manaPanel, borderColor: quest.manaBorder },
  noteError: { backgroundColor: quest.bossPanel, borderColor: quest.bossBorder },
});

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HudText } from '../src/components/quest/HudText';
import { QuestIcon, type QuestIconName } from '../src/components/quest/QuestIcon';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useTranslation } from '../src/i18n/useTranslation';
import type { StringKey } from '../src/i18n/strings';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

interface RoleCardProps {
  icon: QuestIconName;
  title: string;
  description: string;
  accent: string;
  panel: string;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function RoleCard({ icon, title, description, accent, panel, busy, disabled, onPress }: RoleCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderColor: accent, backgroundColor: panel }, disabled && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.iconBox, { borderColor: accent }]}>
        <QuestIcon name={icon} size={26} color={accent} />
      </View>
      <View style={styles.flex}>
        <HudText size={18} color={accent}>
          {title}
        </HudText>
        <HudText size={13} weight="medium" color={quest.textTertiary}>
          {description}
        </HudText>
      </View>
      <QuestIcon name="chevron" size={20} color={accent} />
    </Pressable>
  );
}

const ROLE_KEYS: Record<'client' | 'coach', { title: StringKey; description: StringKey }> = {
  client: { title: 'role.clientTitle', description: 'role.clientDescription' },
  coach: { title: 'role.coachTitle', description: 'role.coachDescription' },
};

export default function RoleSelectScreen() {
  const { t } = useTranslation();
  useLightStatusBar();
  const chooseClientRole = useSettingsStore((s) => s.chooseClientRole);
  const chooseCoachRole = useSettingsStore((s) => s.chooseCoachRole);
  const [busy, setBusy] = useState(false);

  function handleClient() {
    chooseClientRole();
    router.replace('/onboarding');
  }

  async function handleCoach() {
    setBusy(true);
    await chooseCoachRole();
    setBusy(false);
    router.replace('/(tabs)/clients');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, screenMaxWidthStyle]}>
      <HudText size={28} accessibilityRole="header">
        {t('role.title')}
      </HudText>
      <HudText size={14} weight="medium" color={quest.textSecondary}>
        {t('role.subtitle')}
      </HudText>
      <RoleCard
        icon="dumbbell"
        title={t(ROLE_KEYS.client.title)}
        description={t(ROLE_KEYS.client.description)}
        accent={quest.gold}
        panel={quest.panel}
        disabled={busy}
        onPress={handleClient}
      />
      <RoleCard
        icon="user"
        title={t(ROLE_KEYS.coach.title)}
        description={t(ROLE_KEYS.coach.description)}
        accent={quest.mana}
        panel={quest.manaPanel}
        busy={busy}
        disabled={busy}
        onPress={handleCoach}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: quest.bg },
  content: { padding: 24, paddingTop: 72, gap: 14 },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: questRadius.panel, borderWidth: 1.5 },
  iconBox: { width: 52, height: 52, borderRadius: questRadius.row, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: quest.bg },
});

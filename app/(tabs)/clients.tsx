import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CoachDigestCard } from '../../src/components/quest/CoachDigestCard';
import { HudText } from '../../src/components/quest/HudText';
import { QuestIcon } from '../../src/components/quest/QuestIcon';
import { ScreenTemplate } from '../../src/components/quest/ScreenTemplate';
import { useGameText } from '../../src/game/strings';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { fetchCoachClients } from '../../src/sync/cloudSync';
import { useTranslation } from '../../src/i18n/useTranslation';
import { quest, questRadius } from '../../src/theme/quest';
import { useLightStatusBar } from '../../src/theme/useLightStatusBar';
import type { CoachClientSummary } from '../../src/types';

export default function ClientsScreen() {
  const { t } = useTranslation();
  const g = useGameText();
  useLightStatusBar();
  const coachCode = useSettingsStore((s) => s.coachCode);
  const [clients, setClients] = useState<CoachClientSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchCoachClients();
    setClients(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenTemplate title={g('coach.clientsTitle')} eyebrow={g('coach.eyebrow')} tabBar contentStyle={styles.content}>

      <View style={styles.codeCard} accessible accessibilityLabel={`${t('clients.yourCodeTitle')}: ${coachCode ?? ''}`}>
        <HudText size={11} color={quest.manaText} style={styles.eyebrow}>
          {t('clients.yourCodeTitle').toUpperCase()}
        </HudText>
        <HudText size={30} selectable style={styles.code}>
          {coachCode ?? '...'}
        </HudText>
        <HudText size={12} weight="medium" color={quest.textSecondary}>
          {t('clients.shareCodeHint')}
        </HudText>
      </View>

      {!loading && <CoachDigestCard clients={clients} />}

      <HudText size={16} accessibilityRole="header">
        {t('clients.listTitle', { n: clients.length })}
      </HudText>
      {loading && <ActivityIndicator color={quest.mana} style={styles.loader} />}
      {!loading && clients.length === 0 && (
        <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
          {t('clients.empty')}
        </HudText>
      )}
      {clients.map((client) => {
        const change =
          client.latestWeightKg != null && client.startWeightKg != null ? client.latestWeightKg - client.startWeightKg : null;
        const name = client.email ?? client.id;
        const meta = `${client.latestWeightKg != null ? `${client.latestWeightKg.toFixed(1)} kg` : t('clients.noWeight')}${
          client.goalWeightKg != null ? t('clients.goalSuffix', { kg: client.goalWeightKg }) : ''
        }`;
        return (
          <Pressable
            key={client.id}
            accessibilityRole="button"
            accessibilityLabel={`${name}. ${meta}${change != null ? `. ${change > 0 ? '+' : ''}${change.toFixed(1)} kg` : ''}`}
            onPress={() => router.push(`/client/${client.id}`)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.avatar}>
              <HudText size={16} color={quest.manaText}>
                {name.slice(0, 1).toUpperCase()}
              </HudText>
            </View>
            <View style={styles.flex}>
              <HudText size={15} numberOfLines={1}>
                {name}
              </HudText>
              <HudText size={12} weight="medium" color={quest.textSecondary} numberOfLines={1}>
                {meta}
              </HudText>
            </View>
            {change != null && (
              <HudText size={15} color={change <= 0 ? quest.xp : quest.hpText}>
                {`${change > 0 ? '+' : ''}${change.toFixed(1)} kg`}
              </HudText>
            )}
            <QuestIcon name="chevron" size={18} color={quest.textSecondary} />
          </Pressable>
        );
      })}
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { letterSpacing: 1.6 },
  codeCard: { gap: 4, padding: 16, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  code: { letterSpacing: 4, color: quest.manaText },
  loader: { marginTop: 12 },
  empty: { textAlign: 'center', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel, alignItems: 'center', justifyContent: 'center' },
});

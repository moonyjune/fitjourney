import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from './Card';
import { PlanPreview } from './PlanPreview';
import { QuestPlanPreview } from './quest/QuestPlanPreview';
import { quest, questFonts } from '../theme/quest';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import {
  createChatSession,
  fetchSessionMessages,
  listChatSessions,
  saveChatMessage,
} from '../sync/cloudSync';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import type { ChatSessionSummary, PlanData, StoredChatMessage } from '../types';

interface PlanChatAssistantProps {
  livePlan: PlanData;
  /** Set when a Coach is editing a Client's plan; omit for editing your own plan. */
  targetUserId?: string;
  onApply: (plan: PlanData) => Promise<void> | void;
  /** Pre-fills the message input (e.g. from a workout card's "Edit with AI" shortcut). */
  initialDraft?: string;
  /** FitQuest dark styling (default: classic light). */
  dark?: boolean;
}

function sessionTitleFrom(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

export function PlanChatAssistant({ livePlan, targetUserId, onApply, initialDraft, dark = false }: PlanChatAssistantProps) {
  const { t } = useTranslation();
  const Panel = dark ? DarkPanel : Card;
  const spinner = dark ? quest.gold : colors.primary;
  const selfId = useAuthStore((s) => s.session?.user.id);
  const ownerId = targetUserId ?? selfId;

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [baselinePlan, setBaselinePlan] = useState(livePlan);
  const [workingPlan, setWorkingPlan] = useState(livePlan);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadSession = useCallback(async (sessionId: string | null) => {
    setActiveSessionId(sessionId);
    if (!sessionId) {
      setMessages([]);
      setBaselinePlan(livePlan);
      setWorkingPlan(livePlan);
      return;
    }
    const history = await fetchSessionMessages(sessionId);
    setMessages(history);
    const lastProposal = [...history].reverse().find((m) => m.proposedPlan)?.proposedPlan;
    setBaselinePlan(livePlan);
    setWorkingPlan(lastProposal ?? livePlan);
  }, [livePlan]);

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      setLoadingHistory(true);
      const list = await listChatSessions(ownerId);
      setSessions(list);
      await loadSession(list[0]?.id ?? null);
      setLoadingHistory(false);
    })();
    // Only re-run when switching whose plan we're chatting about, not on every livePlan tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  function handleNewSession() {
    setSessions((prev) => prev);
    loadSession(null);
  }

  useEffect(() => {
    if (initialDraft) setInput(initialDraft);
  }, [initialDraft]);

  const hasPendingChanges = JSON.stringify(workingPlan) !== JSON.stringify(baselinePlan);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || !ownerId) return;
    setInput('');
    setSending(true);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        sessionId = await createChatSession(ownerId, sessionTitleFrom(text));
        if (!sessionId) throw new Error(t('chat.sessionCreateError'));
        setActiveSessionId(sessionId);
        setSessions((prev) => [{ id: sessionId!, title: sessionTitleFrom(text), updatedAtISO: new Date().toISOString() }, ...prev]);
      }

      // Cache check: an identical question earlier in this same session skips the AI call entirely.
      const priorIndex = messages.findIndex((m) => m.role === 'user' && m.content === text);
      const cachedReply = priorIndex >= 0 ? messages[priorIndex + 1] : undefined;

      const userMessage: StoredChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: text,
        proposedPlan: null,
        createdAtISO: new Date().toISOString(),
      };

      if (cachedReply && cachedReply.role === 'assistant') {
        setMessages((prev) => [...prev, userMessage, cachedReply]);
        await saveChatMessage(sessionId, 'user', text);
        await saveChatMessage(sessionId, 'assistant', cachedReply.content, cachedReply.proposedPlan);
        if (cachedReply.proposedPlan) {
          setWorkingPlan(cachedReply.proposedPlan);
          setShowPreview(true);
        }
        return;
      }

      setMessages((prev) => [...prev, userMessage]);
      await saveChatMessage(sessionId, 'user', text);

      const history = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('suggest-plan-update', {
        body: { messages: history, currentPlan: workingPlan, targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const replyText: string = data.reply || t('chat.noReply');
      const proposedPlan: PlanData | null = data.plan ?? null;
      const assistantMessage: StoredChatMessage = {
        id: `local-${Date.now()}-a`,
        role: 'assistant',
        content: replyText,
        proposedPlan,
        createdAtISO: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      await saveChatMessage(sessionId, 'assistant', replyText, proposedPlan);
      if (proposedPlan) {
        setWorkingPlan(proposedPlan);
        setShowPreview(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('chat.genericError');
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-e`, role: 'assistant', content: `⚠️ ${message}`, proposedPlan: null, createdAtISO: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      await onApply(workingPlan);
      setBaselinePlan(workingPlan);
    } finally {
      setApplying(false);
    }
  }

  function handleDiscard() {
    setWorkingPlan(baselinePlan);
    setShowPreview(false);
  }

  return (
    <View>
      <View style={styles.headerRow}>
        {sessions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sessionScroll}>
            {sessions.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.sessionChip, dark && darkStyles.chip, s.id === activeSessionId && (dark ? darkStyles.chipActive : styles.sessionChipActive)]}
                onPress={() => loadSession(s.id)}
              >
                <Text style={[styles.sessionChipText, dark && darkStyles.chipText, s.id === activeSessionId && (dark ? darkStyles.chipTextActive : styles.sessionChipTextActive)]} numberOfLines={1}>
                  {s.title || t('chat.defaultSessionTitle')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={[styles.newButton, dark && darkStyles.newButton]} onPress={handleNewSession}>
          <Text style={[styles.newButtonText, dark && darkStyles.newButtonText]}>{t('common.new')}</Text>
        </TouchableOpacity>
      </View>

      {loadingHistory ? (
        <ActivityIndicator color={spinner} style={{ marginVertical: spacing.md }} />
      ) : (
        <>
          {messages.length > 0 && (
            <Panel>
              {messages.map((m) => (
                <View key={m.id} style={[styles.bubbleRow, m.role === 'user' ? styles.bubbleRowUser : undefined]}>
                  <View style={[styles.bubble, m.role === 'user' ? (dark ? darkStyles.bubbleUser : styles.bubbleUser) : dark ? darkStyles.bubbleAssistant : styles.bubbleAssistant]}>
                    <Text style={m.role === 'user' ? (dark ? darkStyles.bubbleTextUser : styles.bubbleTextUser) : dark ? darkStyles.bubbleTextAssistant : styles.bubbleTextAssistant}>{m.content}</Text>
                  </View>
                </View>
              ))}
              {sending && <ActivityIndicator style={{ marginTop: spacing.sm }} color={spinner} />}
            </Panel>
          )}

          <Panel>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.chatInput, dark && darkStyles.chatInput]}
                placeholderTextColor={dark ? quest.textSecondary : undefined}
                placeholder={t('chat.inputPlaceholder')}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                editable={!sending}
              />
              <TouchableOpacity style={[styles.sendButton, dark && darkStyles.sendButton]} onPress={handleSend} disabled={sending || !input.trim()}>
                <Text style={[styles.sendButtonText, dark && darkStyles.sendButtonText]}>{t('common.send')}</Text>
              </TouchableOpacity>
            </View>
          </Panel>

          {hasPendingChanges && (
            <Panel style={dark ? darkStyles.pendingCard : styles.pendingCard}>
              <Text style={[styles.pendingText, dark && darkStyles.pendingText]}>{t('chat.pendingBanner')}</Text>
              <View style={styles.pendingActions}>
                <TouchableOpacity style={styles.linkButton} onPress={() => setShowPreview((v) => !v)}>
                  <Text style={[styles.linkButtonText, dark && darkStyles.linkButtonText]}>{showPreview ? t('chat.hideDetails') : t('chat.showDetails')}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={[styles.discardButton, dark && darkStyles.discardButton]} onPress={handleDiscard} disabled={applying}>
                  <Text style={[styles.discardButtonText, dark && darkStyles.discardButtonText]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.confirmButton, dark && darkStyles.confirmButton]} onPress={handleApply} disabled={applying}>
                  {applying ? <ActivityIndicator color={dark ? quest.onGold : colors.white} /> : <Text style={[styles.confirmButtonText, dark && darkStyles.confirmButtonText]}>{t('chat.confirmApply')}</Text>}
                </TouchableOpacity>
              </View>
            </Panel>
          )}

          {showPreview && hasPendingChanges && (dark ? <QuestPlanPreview plan={workingPlan} /> : <PlanPreview plan={workingPlan} />)}
        </>
      )}
    </View>
  );
}

function DarkPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[darkStyles.panel, style]}>{children}</View>;
}

const darkStyles = StyleSheet.create({
  panel: { backgroundColor: quest.panel, borderRadius: 16, borderWidth: 1.5, borderColor: quest.border, padding: 14, marginBottom: 8 },
  pendingCard: { backgroundColor: quest.raised, borderColor: quest.gold },
  chip: { backgroundColor: quest.panel, borderWidth: 1.5, borderColor: quest.border, minHeight: 44, justifyContent: 'center' },
  chipActive: { backgroundColor: quest.gold, borderColor: quest.gold },
  chipText: { color: quest.textSecondary, fontFamily: questFonts.bold },
  chipTextActive: { color: quest.onGold },
  newButton: { backgroundColor: quest.raised, minHeight: 44, justifyContent: 'center' },
  newButtonText: { color: quest.gold, fontFamily: questFonts.bold },
  bubbleUser: { backgroundColor: quest.gold },
  bubbleAssistant: { backgroundColor: quest.raised },
  bubbleTextUser: { color: quest.onGold, fontSize: 13, fontFamily: questFonts.semibold },
  bubbleTextAssistant: { color: quest.text, fontSize: 13, fontFamily: questFonts.medium },
  chatInput: { backgroundColor: quest.bg, borderColor: quest.border, color: quest.text, minHeight: 44, fontFamily: questFonts.semibold },
  sendButton: { backgroundColor: quest.gold, minHeight: 44 },
  sendButtonText: { color: quest.onGold, fontFamily: questFonts.bold },
  pendingText: { color: quest.goldLight, fontFamily: questFonts.semibold },
  linkButtonText: { color: quest.gold, fontFamily: questFonts.bold },
  discardButton: { backgroundColor: quest.raised2, minHeight: 44, justifyContent: 'center' },
  discardButtonText: { color: quest.textTertiary, fontFamily: questFonts.bold },
  confirmButton: { backgroundColor: quest.xp, minHeight: 44, justifyContent: 'center' },
  confirmButtonText: { color: quest.onGold, fontFamily: questFonts.bold },
});

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm },
  sessionScroll: { flex: 1 },
  sessionChip: {
    backgroundColor: colors.neutralLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    marginRight: spacing.sm - 2,
    maxWidth: 160,
  },
  sessionChipActive: { backgroundColor: colors.primary },
  sessionChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  sessionChipTextActive: { color: colors.white },
  newButton: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 1 },
  newButtonText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  bubbleRow: { marginBottom: spacing.sm, alignItems: 'flex-start' },
  bubbleRowUser: { alignItems: 'flex-end' },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bubbleUser: { backgroundColor: colors.primary },
  bubbleAssistant: { backgroundColor: colors.neutralLight },
  bubbleTextUser: { color: colors.white, fontSize: 13 },
  bubbleTextAssistant: { color: colors.textPrimary, fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: spacing.sm },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    fontSize: 14,
  },
  sendButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.base, justifyContent: 'center' },
  sendButtonText: { color: colors.white, fontWeight: '700' },
  pendingCard: { backgroundColor: colors.warningLight },
  pendingText: { fontSize: 12, color: colors.gold, fontWeight: '600', marginBottom: spacing.sm },
  pendingActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  linkButton: { paddingVertical: spacing.sm - 2 },
  linkButtonText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  discardButton: { backgroundColor: colors.neutralLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  discardButtonText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  confirmButton: { backgroundColor: colors.success, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  confirmButtonText: { color: colors.white, fontWeight: '700', fontSize: 12 },
});

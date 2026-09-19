import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from './Card';
import { PlanPreview } from './PlanPreview';
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
}

function sessionTitleFrom(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

export function PlanChatAssistant({ livePlan, targetUserId, onApply }: PlanChatAssistantProps) {
  const { t } = useTranslation();
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
                style={[styles.sessionChip, s.id === activeSessionId && styles.sessionChipActive]}
                onPress={() => loadSession(s.id)}
              >
                <Text style={[styles.sessionChipText, s.id === activeSessionId && styles.sessionChipTextActive]} numberOfLines={1}>
                  {s.title || t('chat.defaultSessionTitle')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.newButton} onPress={handleNewSession}>
          <Text style={styles.newButtonText}>{t('common.new')}</Text>
        </TouchableOpacity>
      </View>

      {loadingHistory ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : (
        <>
          {messages.length > 0 && (
            <Card>
              {messages.map((m) => (
                <View key={m.id} style={[styles.bubbleRow, m.role === 'user' ? styles.bubbleRowUser : undefined]}>
                  <View style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                    <Text style={m.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{m.content}</Text>
                  </View>
                </View>
              ))}
              {sending && <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.primary} />}
            </Card>
          )}

          <Card>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder={t('chat.inputPlaceholder')}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                editable={!sending}
              />
              <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !input.trim()}>
                <Text style={styles.sendButtonText}>{t('common.send')}</Text>
              </TouchableOpacity>
            </View>
          </Card>

          {hasPendingChanges && (
            <Card style={styles.pendingCard}>
              <Text style={styles.pendingText}>{t('chat.pendingBanner')}</Text>
              <View style={styles.pendingActions}>
                <TouchableOpacity style={styles.linkButton} onPress={() => setShowPreview((v) => !v)}>
                  <Text style={styles.linkButtonText}>{showPreview ? t('chat.hideDetails') : t('chat.showDetails')}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.discardButton} onPress={handleDiscard} disabled={applying}>
                  <Text style={styles.discardButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={handleApply} disabled={applying}>
                  {applying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.confirmButtonText}>{t('chat.confirmApply')}</Text>}
                </TouchableOpacity>
              </View>
            </Card>
          )}

          {showPreview && hasPendingChanges && <PlanPreview plan={workingPlan} />}
        </>
      )}
    </View>
  );
}

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

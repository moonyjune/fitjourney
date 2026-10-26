import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HudText } from '../src/components/quest/HudText';
import { QuestChip } from '../src/components/quest/QuestChip';
import { QuestField } from '../src/components/quest/QuestField';
import { QuestHeader } from '../src/components/quest/QuestHeader';
import { QuestSegment } from '../src/components/quest/QuestSegment';
import { fmtInt } from '../src/insights/format';
import { useInsights } from '../src/insights/useInsights';
import { buildLiveFacts } from '../src/learn/liveFacts';
import { kcalBand, searchSnacks, searchTopics, type KcalBand } from '../src/learn/search';
import { SNACK_SWAPS } from '../src/learn/snackData';
import { EVIDENCE_KEY, SECTION_KEY, formatLearnText, useLearnText, type LearnKey } from '../src/learn/strings';
import { LEARN_SECTIONS, type Evidence, type LearnSection, type LearnTopic } from '../src/learn/types';
import { useLearnStore } from '../src/store/useLearnStore';
import { useNutritionStore } from '../src/store/useNutritionStore';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { quest, questRadius } from '../src/theme/quest';
import { screenMaxWidthStyle } from '../src/theme/responsive';
import { useLightStatusBar } from '../src/theme/useLightStatusBar';

type Tab = 'theory' | 'snack';

const EVIDENCE_COLOR: Record<Evidence, string> = { strong: quest.xp, medium: quest.gold, limited: quest.textSecondary };
const BAND_COLOR: Record<KcalBand, string> = { free: quest.xp, once: quest.gold, meal: '#FF9F43' };
const BAND_KEY: Record<KcalBand, LearnKey> = { free: 'learn.band.free', once: 'learn.band.once', meal: 'learn.band.meal' };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/profile');
}

function TopicCard({ topic, open, onToggle, fact, note }: { topic: LearnTopic; open: boolean; onToggle: () => void; fact: string | null; note: string | null }) {
  const t = useLearnText();
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={topic.title} onPress={onToggle} style={styles.head}>
        <HudText size={11} color={quest.textSecondary} style={styles.num}>
          {topic.id}
        </HudText>
        <HudText size={14} style={styles.flex}>
          {topic.title}
        </HudText>
        <View accessibilityLabel={t(EVIDENCE_KEY[topic.evidence])} style={[styles.dot, { backgroundColor: EVIDENCE_COLOR[topic.evidence] }]} />
      </Pressable>
      {open && (
        <View style={styles.body}>
          <HudText size={11} color={EVIDENCE_COLOR[topic.evidence]}>
            {t(EVIDENCE_KEY[topic.evidence])}
          </HudText>
          {topic.points.map((p, i) => (
            <View key={i} style={styles.bullet}>
              <HudText size={13} color={quest.textSecondary}>
                •
              </HudText>
              <HudText size={13} weight="medium" color={quest.text} style={styles.flex}>
                {p}
              </HudText>
            </View>
          ))}
          {fact && (
            <View style={styles.factBox}>
              <HudText size={11} color={quest.manaText} style={styles.eyebrow}>
                {t('learn.yourData').toUpperCase()}
              </HudText>
              <HudText size={13} weight="medium" color={quest.text}>
                {fact}
              </HudText>
            </View>
          )}
          {note && (
            <View style={styles.noteBox}>
              <HudText size={11} color={quest.gold} style={styles.eyebrow}>
                {t('learn.yourNote').toUpperCase()}
              </HudText>
              <HudText size={13} weight="medium" color={quest.text}>
                {note}
              </HudText>
              <HudText size={11} weight="medium" color={quest.textSecondary}>
                {t('learn.yourNoteHint')}
              </HudText>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Profile > Knowledge: the "why" behind the habits (26 short articles) and swaps for snack cravings. */
export default function LearnScreen() {
  const t = useLearnText();
  const lang = useSettingsStore((s) => s.language);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const { insights, thresholds } = useInsights();
  const logs = useNutritionStore((s) => s.logs);
  const waterTargetMl = useSettingsStore((s) => s.waterTargetMl);
  const notes = useLearnStore((s) => s.notes);

  const [tab, setTab] = useState<Tab>('theory');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<LearnSection | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const topics = useMemo(() => searchTopics(query, section), [query, section]);
  const snacks = useMemo(() => searchSnacks(SNACK_SWAPS, query), [query]);
  const facts = useMemo(() => {
    const waterByDay = Object.fromEntries(Object.entries(logs).map(([d, l]) => [d, l.waterMl ?? 0]));
    const raw = buildLiveFacts({ insights, thresholds, waterByDay, waterTargetMl, language: lang });
    return Object.fromEntries(Object.entries(raw).map(([id, f]) => [id, formatLearnText(lang, f.key, f.params)]));
  }, [insights, thresholds, logs, waterTargetMl, lang]);

  function switchTab(next: Tab) {
    setTab(next);
    setQuery('');
  }

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, screenMaxWidthStyle, { paddingTop: insets.top + 16 }]}>
        <QuestHeader title={t('learn.title')} onBack={goBack} backLabel={t('learn.back')} />
        <View style={styles.segment}>
          <QuestSegment<Tab>
            accessibilityLabel={t('learn.title')}
            value={tab}
            onChange={switchTab}
            options={[
              { value: 'theory', label: t('learn.tabTheory') },
              { value: 'snack', label: t('learn.tabSnack') },
            ]}
          />
        </View>

        <View style={styles.search}>
          <QuestField label={t(tab === 'theory' ? 'learn.searchTopics' : 'learn.searchSnacks')} value={query} onChangeText={setQuery} autoCapitalize="none" />
        </View>

        {tab === 'theory' ? (
          <>
            <View style={styles.chips}>
              <QuestChip label={t('learn.all')} selected={section === null} onPress={() => setSection(null)} />
              {LEARN_SECTIONS.map((s) => (
                <QuestChip key={s} label={t(SECTION_KEY[s])} selected={section === s} onPress={() => setSection(section === s ? null : s)} />
              ))}
            </View>
            {topics.length === 0 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
                {t('learn.empty')}
              </HudText>
            ) : (
              topics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  open={openId === topic.id}
                  onToggle={() => setOpenId(openId === topic.id ? null : topic.id)}
                  fact={facts[topic.id] ?? null}
                  note={notes[String(topic.id)] ?? null}
                />
              ))
            )}
            <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.foot}>
              {t('learn.evidenceNote')}
            </HudText>
          </>
        ) : (
          <>
            <HudText size={12} weight="medium" color={quest.textSecondary} style={styles.intro}>
              {t('learn.snackIntro')}
            </HudText>
            {snacks.length === 0 ? (
              <HudText size={13} weight="medium" color={quest.textSecondary} style={styles.empty}>
                {t('learn.empty')}
              </HudText>
            ) : (
              snacks.map((s) => {
                const band = kcalBand(s.kcal);
                return (
                  <View key={s.id} style={styles.card}>
                    <View style={styles.snackBody}>
                      <View style={styles.headRow}>
                        <View style={styles.flex}>
                          <HudText size={11} color={quest.textSecondary}>
                            {t('learn.craving')}
                          </HudText>
                          <HudText size={14}>{s.craving}</HudText>
                        </View>
                        <View accessibilityLabel={`${fmtInt(s.kcal, lang)} kcal: ${t(BAND_KEY[band])}`} style={[styles.kcal, { borderColor: BAND_COLOR[band] }]}>
                          <HudText size={13} color={BAND_COLOR[band]}>
                            {t('learn.kcal', { n: fmtInt(s.kcal, lang) })}
                          </HudText>
                        </View>
                      </View>
                      <HudText size={11} color={quest.textSecondary}>
                        {t('learn.swap')}
                      </HudText>
                      <HudText size={13} weight="medium" color={quest.text}>
                        {s.swap}
                      </HudText>
                      <HudText size={12} weight="medium" color={quest.textSecondary}>
                        {`${t('learn.portion')}: ${s.portion}`}
                      </HudText>
                      {s.note ? (
                        <HudText size={12} weight="medium" color={quest.manaText}>
                          {s.note}
                        </HudText>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
            <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.foot}>
              {t('learn.snackLegend')}
            </HudText>
          </>
        )}
        <HudText size={11} weight="medium" color={quest.textSecondary} style={styles.foot}>
          {t('learn.disclaimer')}
        </HudText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quest.bg },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  segment: { marginTop: 14 },
  search: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  flex: { flex: 1, minWidth: 0 },
  card: { marginTop: 8, borderRadius: questRadius.panel, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.panel, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 14 },
  num: { width: 22 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  bullet: { flexDirection: 'row', gap: 8 },
  factBox: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.manaBorder, backgroundColor: quest.manaPanel },
  noteBox: { gap: 4, padding: 10, borderRadius: questRadius.row, borderWidth: 1.5, borderColor: quest.border, backgroundColor: quest.raised2 },
  eyebrow: { letterSpacing: 1.3 },
  intro: { marginTop: 12 },
  snackBody: { gap: 4, padding: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcal: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  empty: { marginTop: 18, textAlign: 'center' },
  foot: { marginTop: 14, textAlign: 'center' },
});

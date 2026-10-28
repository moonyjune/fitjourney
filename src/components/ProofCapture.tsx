import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProofStore } from '../store/useProofStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { persistPickedPhoto } from '../utils/photoStorage';
import { MAX_MEAL_TEXT_PHOTOS, MealTextPhotos } from './quest/MealTextPhotos';
import { aiNumberText, useAiFields } from '../ai/useAiFields';
import { adviceLines, cleanAdvice } from '../ai/adviceText';
import { useAccuracyText, useAiErrorText, usePhotoAnalysis } from '../ai/usePhotoAnalysis';
import { useGameText } from '../game/strings';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import { quest } from '../theme/quest';
import type { ProofTaskType } from '../types';

interface ProofCaptureProps {
  dateKey: string;
  taskType: ProofTaskType;
  taskRefId: string;
  /** Shown to the AI as context, e.g. the meal/workout name, so its estimate is more targeted. */
  contextLabel?: string;
  /** The plan's target calories, given to the AI as a sanity-check reference point. */
  plannedCalories?: number;
  /** `quest` restyles it for the dark FitQuest screens; behaviour is identical. Defaults to `light`. */
  variant?: 'light' | 'quest';
}

export function ProofCapture({ dateKey, taskType, taskRefId, contextLabel, plannedCalories, variant = 'light' }: ProofCaptureProps) {
  const { t } = useTranslation();
  const g = useGameText();
  const palette = variant === 'quest' ? questPalette : lightPalette;
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const proof = useProofStore((s) => s.proofFor(dateKey, taskType, taskRefId));
  const addProof = useProofStore((s) => s.addProof);
  const removeProof = useProofStore((s) => s.removeProof);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const addWater = useNutritionStore((s) => s.addWater);
  const updateEntryCaloriesBurned = useWorkoutStore((s) => s.updateEntryCaloriesBurned);

  const [isEditing, setIsEditing] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  /** Extra photos of the same meal/session for the AI only; the first photo is the one kept as the proof. */
  const [morePhotos, setMorePhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // The photo goes straight to the vision API (with the user's body data); its answer fills the inputs below as a
  // suggestion. The user can edit every value, and a re-run never overwrites what they typed themselves.
  const ai = usePhotoAnalysis(taskType === 'meal' ? 'meal' : 'workout', { label: contextLabel, plannedCalories });
  const aiErrorText = useAiErrorText();
  const accuracyText = useAccuracyText();
  const aiFields = useAiFields<'calories' | 'water' | 'protein' | 'burned'>();
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  const [analysisKept, setAnalysisKept] = useState(false);
  const [adviceText, setAdviceText] = useState<string | null>(null);
  const [aiFoodName, setAiFoodName] = useState<string | null>(null);
  const [estimatedCalories, setEstimatedCalories] = useState('');
  const [estimatedWaterMl, setEstimatedWaterMl] = useState('');
  const [estimatedProteinG, setEstimatedProteinG] = useState('');
  const [estimatedCaloriesBurned, setEstimatedCaloriesBurned] = useState('');
  const latest = useRef({ calories: '', water: '', protein: '', burned: '' });
  latest.current = { calories: estimatedCalories, water: estimatedWaterMl, protein: estimatedProteinG, burned: estimatedCaloriesBurned };
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function resetForm() {
    setIsEditing(false);
    setPendingUri(null);
    setMorePhotos([]);
    setNote('');
    ai.reset();
    aiFields.clear();
    setAnalysisNote(null);
    setAdviceText(null);
    setAnalysisKept(false);
    setAiFoodName(null);
    setEstimatedCalories('');
    setEstimatedWaterMl('');
    setEstimatedProteinG('');
    setEstimatedCaloriesBurned('');
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('proof.permissionTitle'), t('proof.libraryPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('proof.permissionTitle'), t('proof.cameraPermissionMessage'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
    }
  }

  async function handleAnalyze() {
    if (!pendingUri || ai.analyzing) return;
    const result = await ai.analyze(pendingUri, morePhotos);
    if (!result || !alive.current) return;
    const cur = latest.current;
    const outcomes =
      taskType === 'meal'
        ? [
            aiFields.fill('calories', cur.calories, aiNumberText(result.estimatedCaloriesKcal), setEstimatedCalories),
            aiFields.fill('water', cur.water, aiNumberText(result.estimatedWaterMl), setEstimatedWaterMl),
            aiFields.fill('protein', cur.protein, aiNumberText(result.estimatedProteinG, 1), setEstimatedProteinG),
          ]
        : [aiFields.fill('burned', cur.burned, aiNumberText(result.estimatedCaloriesBurned), setEstimatedCaloriesBurned)];
    setAnalysisKept(outcomes.includes('kept'));
    setAiFoodName(taskType === 'meal' ? result.foodName?.trim() || null : null);
    const parts: string[] = [];
    if (taskType === 'workout' && result.activityName) {
      parts.push(result.durationMin ? g('ai.workoutSummary', { activity: result.activityName, min: Math.round(result.durationMin) }) : result.activityName);
    }
    if (taskType === 'meal' && result.foodName) parts.push(result.foodName);
    const confidence = accuracyText(result);
    if (confidence) parts.push(confidence);
    if (result.reasoning) parts.push(result.reasoning);
    setAnalysisNote(parts.join(' · '));
    const advice = cleanAdvice(result.advice);
    setAdviceText(advice ? [g('ai.adviceTitle'), ...adviceLines(advice, g), g('ai.advice.disclaimer')].join('\n') : null);
  }

  async function handleSave() {
    if (!pendingUri) {
      Alert.alert(t('proof.missingPhotoTitle'), t('proof.missingPhotoMessage'));
      return;
    }
    setBusy(true);
    try {
      const id = `${taskType}-${taskRefId}-${Date.now()}`;
      const persistedUri = await persistPickedPhoto(pendingUri, id);
      addProof({ taskType, taskRefId, photoUri: persistedUri, note, dateISO: new Date().toISOString() });

      const cal = parseFloat(estimatedCalories.replace(',', '.'));
      const water = parseFloat(estimatedWaterMl.replace(',', '.'));
      const protein = parseFloat(estimatedProteinG.replace(',', '.'));
      const burned = parseFloat(estimatedCaloriesBurned.replace(',', '.'));
      if (taskType === 'meal') {
        if (cal > 0) addExtra(dateKey, aiFoodName || contextLabel || '', cal, protein > 0 ? protein : 0, null);
        if (water > 0) addWater(dateKey, water);
      } else if (taskType === 'workout' && burned > 0) {
        updateEntryCaloriesBurned(taskRefId, burned);
      }

      resetForm();
    } finally {
      setBusy(false);
    }
  }

  if (proof) {
    return (
      <View style={styles.proofRow}>
        <Image source={{ uri: proof.photoUri }} style={styles.thumbnail} />
        <View style={styles.proofTextWrap}>
          {!!proof.note && <Text style={styles.proofNote}>{proof.note}</Text>}
          <TouchableOpacity onPress={() => removeProof(proof.id)}>
            <Text style={styles.removeText}>{t('proof.removeLink')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isEditing) {
    return (
      <TouchableOpacity style={styles.addProofButton} onPress={() => setIsEditing(true)}>
        <Text style={styles.addProofText}>{t('proof.addButton')}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.editWrap}>
      {pendingUri ? (
        <>
          <Image source={{ uri: pendingUri }} style={styles.thumbnail} />
          {variant === 'quest' && (
            <View style={styles.more}>
              <MealTextPhotos
                kind="more"
                max={MAX_MEAL_TEXT_PHOTOS - 1}
                photos={morePhotos}
                onChange={(photos) => {
                  setMorePhotos(photos);
                  ai.reset();
                  setAnalysisNote(null);
                }}
                disabled={ai.analyzing || busy}
              />
            </View>
          )}
          <TouchableOpacity
            style={styles.analyzeButton}
            onPress={handleAnalyze}
            disabled={ai.analyzing}
            accessibilityRole="button"
            accessibilityLabel={g('ai.analyze')}
            accessibilityState={{ busy: ai.analyzing, disabled: ai.analyzing }}
          >
            {ai.analyzing ? (
              <ActivityIndicator size="small" color={palette.accent} />
            ) : (
              <Text style={styles.analyzeButtonText}>{g('ai.analyze')}</Text>
            )}
          </TouchableOpacity>
          {ai.error && (
            <Text style={styles.analysisError} accessibilityRole="alert">
              {aiErrorText(ai.error.kind, ai.error.message)}
            </Text>
          )}
          {adviceText && !ai.error && (
            <Text style={styles.analysisNote} accessibilityLiveRegion="polite">
              {adviceText}
            </Text>
          )}
          {analysisNote && !ai.error && (
            <Text style={styles.analysisNote} accessibilityLiveRegion="polite">
              {g('ai.suggested')} {analysisNote}
              {analysisKept ? ` ${g('ai.keptYours')}` : ''}
            </Text>
          )}

          {taskType === 'meal' ? (
            <View style={styles.estimateRow}>
              <TextInput
                placeholderTextColor={palette.placeholder}
                style={[styles.estimateInput, styles.input]}
                placeholder={t('proof.caloriesPlaceholder')}
                keyboardType="decimal-pad"
                value={estimatedCalories}
                onChangeText={aiFields.typed('calories', setEstimatedCalories)}
              />
              <TextInput
                placeholderTextColor={palette.placeholder}
                style={[styles.estimateInput, styles.input]}
                placeholder={t('proof.waterPlaceholder')}
                keyboardType="decimal-pad"
                value={estimatedWaterMl}
                onChangeText={aiFields.typed('water', setEstimatedWaterMl)}
              />
              <TextInput
                placeholderTextColor={palette.placeholder}
                style={[styles.estimateInput, styles.input]}
                placeholder={g('food.protein')}
                accessibilityLabel={g('food.protein')}
                keyboardType="decimal-pad"
                value={estimatedProteinG}
                onChangeText={aiFields.typed('protein', setEstimatedProteinG)}
              />
            </View>
          ) : (
            <TextInput
              placeholderTextColor={palette.placeholder}
              style={styles.input}
              placeholder={t('proof.caloriesBurnedPlaceholder')}
              keyboardType="decimal-pad"
              value={estimatedCaloriesBurned}
              onChangeText={aiFields.typed('burned', setEstimatedCaloriesBurned)}
            />
          )}
        </>
      ) : (
        <View style={styles.pickButtons}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.pickButton} onPress={takePhoto}>
              <Text style={styles.pickButtonText}>{t('proof.takePhoto')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.pickButton} onPress={pickFromLibrary}>
            <Text style={styles.pickButtonText}>{t('proof.pickPhoto')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <TextInput
        placeholderTextColor={palette.placeholder}
        style={styles.noteInput}
        placeholder={t('proof.notePlaceholder')}
        value={note}
        onChangeText={setNote}
      />
      <View style={styles.editActions}>
        <TouchableOpacity style={styles.cancelButton} onPress={resetForm}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={busy}>
          <Text style={styles.saveText}>{busy ? t('proof.saving') : t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface Palette {
  chipBg: string; accent: string; thumbBg: string; text: string; danger: string; analyzeBg: string; analyzeText: string;
  muted: string; border: string; saveBg: string; saveText: string;
  /** Left unset on the light variant so those inputs keep the platform defaults they always had. */
  inputText?: string; inputBg?: string; placeholder?: string;
}

const lightPalette: Palette = {
  chipBg: colors.primaryLight, accent: colors.primary, thumbBg: '#eee', text: '#444', danger: colors.danger,
  analyzeBg: colors.goldLight, analyzeText: colors.gold, muted: colors.textMuted, border: colors.border,
  saveBg: colors.primary, saveText: '#fff',
};

const questPalette: Palette = {
  chipBg: quest.raised2, accent: quest.gold, thumbBg: quest.raised, text: quest.textTertiary, danger: quest.hpText,
  analyzeBg: quest.raised2, analyzeText: quest.goldLight, muted: quest.textSecondary, border: quest.border,
  inputText: quest.text, inputBg: quest.bg, placeholder: quest.textSecondary, saveBg: quest.gold, saveText: quest.onGold,
};

function makeStyles(p: Palette) {
  return StyleSheet.create({
  addProofButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: p.chipBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  addProofText: { color: p.accent, fontSize: 12, fontWeight: '700' },
  proofRow: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm },
  thumbnail: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: p.thumbBg },
  proofTextWrap: { flex: 1, justifyContent: 'center' },
  proofNote: { fontSize: 12, color: p.text, marginBottom: 4 },
  removeText: { fontSize: 11, color: p.danger },
  editWrap: { marginTop: spacing.sm },
  more: { marginTop: spacing.sm },
  pickButtons: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pickButton: { backgroundColor: p.chipBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pickButtonText: { color: p.accent, fontSize: 12, fontWeight: '700' },
  analyzeButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: p.analyzeBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    minWidth: 100,
    alignItems: 'center',
  },
  analyzeButtonText: { color: p.analyzeText, fontSize: 12, fontWeight: '700' },
  analysisError: { fontSize: 11, color: p.danger, marginTop: spacing.xs },
  analysisNote: { fontSize: 11, color: p.muted, marginTop: spacing.xs, fontStyle: 'italic' },
  estimateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  estimateInput: { flex: 1, marginBottom: 0 },
  noteInput: {
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: p.inputText,
    backgroundColor: p.inputBg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: p.inputText,
    backgroundColor: p.inputBg,
    marginTop: spacing.sm,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { color: p.muted, fontSize: 12 },
  saveButton: { backgroundColor: p.saveBg, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  saveText: { color: p.saveText, fontSize: 12, fontWeight: '700' },
  });
}

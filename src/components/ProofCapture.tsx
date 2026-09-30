import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProofStore } from '../store/useProofStore';
import { useNutritionStore } from '../store/useNutritionStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { persistPickedPhoto, imageUriToBase64 } from '../utils/photoStorage';
import { requestPhotoAnalysis } from '../sync/cloudSync';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import type { ProofTaskType } from '../types';

interface ProofCaptureProps {
  dateKey: string;
  taskType: ProofTaskType;
  taskRefId: string;
  /** Shown to the AI as context, e.g. the meal/workout name, so its estimate is more targeted. */
  contextLabel?: string;
  /** The plan's target calories, given to the AI as a sanity-check reference point. */
  plannedCalories?: number;
}

export function ProofCapture({ dateKey, taskType, taskRefId, contextLabel, plannedCalories }: ProofCaptureProps) {
  const { t } = useTranslation();
  const proof = useProofStore((s) => s.proofFor(dateKey, taskType, taskRefId));
  const addProof = useProofStore((s) => s.addProof);
  const removeProof = useProofStore((s) => s.removeProof);
  const addExtra = useNutritionStore((s) => s.addExtra);
  const addWater = useNutritionStore((s) => s.addWater);
  const updateEntryCaloriesBurned = useWorkoutStore((s) => s.updateEntryCaloriesBurned);

  const [isEditing, setIsEditing] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  const [estimatedCalories, setEstimatedCalories] = useState('');
  const [estimatedWaterMl, setEstimatedWaterMl] = useState('');
  const [estimatedCaloriesBurned, setEstimatedCaloriesBurned] = useState('');

  function resetForm() {
    setIsEditing(false);
    setPendingUri(null);
    setNote('');
    setAnalysisError(null);
    setAnalysisNote(null);
    setEstimatedCalories('');
    setEstimatedWaterMl('');
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
    if (!pendingUri) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const { base64, mediaType } = await imageUriToBase64(pendingUri);
      const result = await requestPhotoAnalysis(taskType, base64, mediaType, { label: contextLabel, plannedCalories });
      if (!result.ok) {
        setAnalysisError(result.message);
        return;
      }
      setAnalysisNote(result.result.reasoning);
      if (result.result.estimatedCaloriesKcal != null) setEstimatedCalories(String(Math.round(result.result.estimatedCaloriesKcal)));
      if (result.result.estimatedWaterMl != null) setEstimatedWaterMl(String(Math.round(result.result.estimatedWaterMl)));
      if (result.result.estimatedCaloriesBurned != null)
        setEstimatedCaloriesBurned(String(Math.round(result.result.estimatedCaloriesBurned)));
    } finally {
      setAnalyzing(false);
    }
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
      const burned = parseFloat(estimatedCaloriesBurned.replace(',', '.'));
      if (taskType === 'meal') {
        if (cal > 0) addExtra(dateKey, contextLabel ?? '', cal, 0, null);
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
          <TouchableOpacity style={styles.analyzeButton} onPress={handleAnalyze} disabled={analyzing}>
            {analyzing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.analyzeButtonText}>{t('proof.analyzeButton')}</Text>
            )}
          </TouchableOpacity>
          {analysisError && <Text style={styles.analysisError}>{t('proof.analysisError')}</Text>}
          {analysisNote && <Text style={styles.analysisNote}>{analysisNote}</Text>}

          {taskType === 'meal' ? (
            <View style={styles.estimateRow}>
              <TextInput
                style={[styles.estimateInput, styles.input]}
                placeholder={t('proof.caloriesPlaceholder')}
                keyboardType="decimal-pad"
                value={estimatedCalories}
                onChangeText={setEstimatedCalories}
              />
              <TextInput
                style={[styles.estimateInput, styles.input]}
                placeholder={t('proof.waterPlaceholder')}
                keyboardType="decimal-pad"
                value={estimatedWaterMl}
                onChangeText={setEstimatedWaterMl}
              />
            </View>
          ) : (
            <TextInput
              style={styles.input}
              placeholder={t('proof.caloriesBurnedPlaceholder')}
              keyboardType="decimal-pad"
              value={estimatedCaloriesBurned}
              onChangeText={setEstimatedCaloriesBurned}
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

const styles = StyleSheet.create({
  addProofButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
  },
  addProofText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  proofRow: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm },
  thumbnail: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: '#eee' },
  proofTextWrap: { flex: 1, justifyContent: 'center' },
  proofNote: { fontSize: 12, color: '#444', marginBottom: 4 },
  removeText: { fontSize: 11, color: colors.danger },
  editWrap: { marginTop: spacing.sm },
  pickButtons: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  pickButton: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  pickButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  analyzeButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.goldLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    minWidth: 100,
    alignItems: 'center',
  },
  analyzeButtonText: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  analysisError: { fontSize: 11, color: colors.danger, marginTop: spacing.xs },
  analysisNote: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' },
  estimateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  estimateInput: { flex: 1, marginBottom: 0 },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 13,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { color: colors.textMuted, fontSize: 12 },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

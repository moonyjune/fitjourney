import { useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProofStore } from '../store/useProofStore';
import { persistPickedPhoto } from '../utils/photoStorage';
import { useTranslation } from '../i18n/useTranslation';
import { colors, radius, spacing } from '../theme/tokens';
import type { ProofTaskType } from '../types';

interface ProofCaptureProps {
  dateKey: string;
  taskType: ProofTaskType;
  taskRefId: string;
}

export function ProofCapture({ dateKey, taskType, taskRefId }: ProofCaptureProps) {
  const { t } = useTranslation();
  const proof = useProofStore((s) => s.proofFor(dateKey, taskType, taskRefId));
  const addProof = useProofStore((s) => s.addProof);
  const removeProof = useProofStore((s) => s.removeProof);

  const [isEditing, setIsEditing] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

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
      setIsEditing(false);
      setPendingUri(null);
      setNote('');
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
        <Image source={{ uri: pendingUri }} style={styles.thumbnail} />
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
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            setIsEditing(false);
            setPendingUri(null);
            setNote('');
          }}
        >
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
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm },
  cancelButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { color: colors.textMuted, fontSize: 12 },
  saveButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

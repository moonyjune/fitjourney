import { useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProofStore } from '../store/useProofStore';
import { persistPickedPhoto } from '../utils/photoStorage';
import type { ProofTaskType } from '../types';

interface ProofCaptureProps {
  dateKey: string;
  taskType: ProofTaskType;
  taskRefId: string;
}

export function ProofCapture({ dateKey, taskType, taskRefId }: ProofCaptureProps) {
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
      Alert.alert('Cần quyền truy cập', 'Vui lòng cho phép truy cập thư viện ảnh để đính kèm minh chứng.');
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
      Alert.alert('Cần quyền truy cập', 'Vui lòng cho phép dùng camera để chụp ảnh minh chứng.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setPendingUri(result.assets[0].uri);
    }
  }

  async function handleSave() {
    if (!pendingUri) {
      Alert.alert('Thiếu ảnh', 'Vui lòng chụp hoặc chọn một ảnh minh chứng.');
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
            <Text style={styles.removeText}>Xóa ảnh minh chứng</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isEditing) {
    return (
      <TouchableOpacity style={styles.addProofButton} onPress={() => setIsEditing(true)}>
        <Text style={styles.addProofText}>📷 Thêm ảnh minh chứng</Text>
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
              <Text style={styles.pickButtonText}>Chụp ảnh</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.pickButton} onPress={pickFromLibrary}>
            <Text style={styles.pickButtonText}>Chọn ảnh</Text>
          </TouchableOpacity>
        </View>
      )}
      <TextInput
        style={styles.noteInput}
        placeholder="Ghi chú (không bắt buộc)"
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
          <Text style={styles.cancelText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={busy}>
          <Text style={styles.saveText}>{busy ? 'Đang lưu...' : 'Lưu'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  addProofButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#F0F4FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addProofText: { color: '#4F8EF7', fontSize: 12, fontWeight: '700' },
  proofRow: { flexDirection: 'row', marginTop: 10, gap: 10 },
  thumbnail: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#eee' },
  proofTextWrap: { flex: 1, justifyContent: 'center' },
  proofNote: { fontSize: 12, color: '#444', marginBottom: 4 },
  removeText: { fontSize: 11, color: '#E0563A' },
  editWrap: { marginTop: 10 },
  pickButtons: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  pickButton: { backgroundColor: '#F0F4FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pickButtonText: { color: '#4F8EF7', fontSize: 12, fontWeight: '700' },
  noteInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  editActions: { flexDirection: 'row', gap: 8 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelText: { color: '#888', fontSize: 12 },
  saveButton: { backgroundColor: '#4F8EF7', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  saveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

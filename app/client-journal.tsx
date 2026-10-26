import { useLocalSearchParams } from 'expo-router';
import { ClientViewShell } from '../src/coach/ClientViewShell';
import { JournalView } from '../src/screens/JournalView';

/** Coach > a client > Daily log: the client's Nhật ký trận, read-only. */
export default function ClientJournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientViewShell clientId={Array.isArray(id) ? id[0] : id}>{(client) => <JournalView client={client} />}</ClientViewShell>;
}

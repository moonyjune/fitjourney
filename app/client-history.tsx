import { useLocalSearchParams } from 'expo-router';
import { ClientViewShell } from '../src/coach/ClientViewShell';
import { JournalScreen } from '../src/screens/journal/JournalScreen';

/** Coach > a client > Diary & charts: the client's Journal opened on Tháng (the old History), read-only. */
export default function ClientHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientViewShell clientId={Array.isArray(id) ? id[0] : id}>{(client) => <JournalScreen client={client} initialTab="month" />}</ClientViewShell>;
}

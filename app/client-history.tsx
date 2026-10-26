import { useLocalSearchParams } from 'expo-router';
import { ClientViewShell } from '../src/coach/ClientViewShell';
import { HistoryView } from '../src/screens/HistoryView';

/** Coach > a client > Diary & charts: the client's History screen, read-only. */
export default function ClientHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClientViewShell clientId={Array.isArray(id) ? id[0] : id}>{(client) => <HistoryView client={client} />}</ClientViewShell>;
}

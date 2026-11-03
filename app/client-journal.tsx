import { useLocalSearchParams } from 'expo-router';
import { ClientViewShell } from '../src/coach/ClientViewShell';
import { journalParams, JournalScreen } from '../src/screens/journal/JournalScreen';

/** Coach > a client > Daily log: the client's Journal (Ngày / Tuần / Tháng), read-only, opening on Ngày. */
export default function ClientJournalScreen() {
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { tab } = journalParams({ tab: params.tab ?? 'day' });
  return <ClientViewShell clientId={id}>{(client) => <JournalScreen client={client} initialTab={tab} />}</ClientViewShell>;
}

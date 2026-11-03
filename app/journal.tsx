import { useLocalSearchParams } from 'expo-router';
import { journalParams, JournalScreen } from '../src/screens/journal/JournalScreen';

/** Nhật ký: Ngày | Tuần | Tháng. `/journal?tab=week`, `/journal?tab=day&focus=purine` (a mission from Camp, its nutrient row lit). */
export default function JournalRoute() {
  const { tab, focus } = journalParams(useLocalSearchParams<{ tab?: string; focus?: string }>());
  return <JournalScreen initialTab={tab} focus={focus} />;
}

import { Redirect } from 'expo-router';

/** The old History screen is Journal › Tháng now (with the week view in Journal › Tuần); an old link or bookmark lands there. */
export default function HistoryRedirect() {
  return <Redirect href={{ pathname: '/journal', params: { tab: 'month' } }} />;
}

import { Redirect } from 'expo-router';

/** The old Today screen was removed in the redesign; a bookmarked /today-classic opens Camp instead. */
export default function TodayClassicRedirect() {
  return <Redirect href="/" />;
}

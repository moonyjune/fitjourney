import { useSettingsStore } from '../store/useSettingsStore';
import { STRINGS, type StringKey } from './strings';

export function useTranslation() {
  const language = useSettingsStore((s) => s.language);
  const t = (key: StringKey): string => STRINGS[language][key] ?? STRINGS.vi[key] ?? key;
  return { t, language };
}

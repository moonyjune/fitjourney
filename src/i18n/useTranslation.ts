import { useSettingsStore } from '../store/useSettingsStore';
import { STRINGS, type StringKey } from './strings';

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

export function useTranslation() {
  const language = useSettingsStore((s) => s.language);
  const t = (key: StringKey, params?: Params): string =>
    interpolate(STRINGS[language][key] ?? STRINGS.vi[key] ?? key, params);
  return { t, language };
}

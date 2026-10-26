type Lang = 'vi' | 'en';

/** Whole number with thousands separators: 3.885 in Vietnamese, 3,885 in English. */
export function fmtInt(value: number, lang: Lang): string {
  const rounded = Math.round(Math.abs(value));
  const grouped = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'vi' ? '.' : ',');
  return `${value < 0 && rounded !== 0 ? '-' : ''}${grouped}`;
}

/** Number with `digits` decimals: comma in Vietnamese, point in English. */
export function fmtDec(value: number, digits: number, lang: Lang): string {
  const text = (Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits);
  return lang === 'vi' ? text.replace('.', ',') : text;
}

/** `YYYY-MM-DD` as dd/mm. */
export function fmtDayMonth(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

/** Signed whole number: +120 / -45. */
export function fmtSigned(value: number, lang: Lang): string {
  const base = fmtInt(value, lang);
  return value > 0 ? `+${base}` : base;
}

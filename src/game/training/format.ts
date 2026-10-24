import { formatGameText } from '../strings';
import type { Exercise, Prescription } from './exercises';

type Lang = 'vi' | 'en';

export function exerciseName(ex: Exercise, lang: Lang): string {
  return lang === 'en' ? ex.nameEn : ex.nameVi;
}

/** One set's amount: "8", "15s", "5/bên", with the level's qualifier appended ("8 · no chair"). */
export function formatPerSet(p: Prescription, lang: Lang, withNote = true): string {
  const unit = p.unit === 'seconds' ? 's' : '';
  const side = p.perSide ? formatGameText(lang, 'train.rx.perSide') : '';
  const note = lang === 'en' ? p.noteEn : p.noteVi;
  return `${p.amount}${unit}${side}${withNote && note ? ` · ${note}` : ''}`;
}

/** "3 × 8", "3 × 15s", "3 × 5/bên", with the qualifier appended ("3 × 8 · no chair"). */
export function formatAmount(p: Prescription, lang: Lang, withNote = true): string {
  return `${p.sets} × ${formatPerSet(p, lang, withNote)}`;
}

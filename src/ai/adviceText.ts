import type { PhotoAdvice } from '../sync/cloudSync';
import type { GameKey } from '../game/strings';

type Translate = (key: GameKey, params?: Record<string, string | number>) => string;

const VERDICT_KEY = { on_track: 'ai.verdict.on_track', watch: 'ai.verdict.watch', over: 'ai.verdict.over' } as const;

/** Keeps only well-formed advice: the model's text is shown as is, but it must at least have a known verdict and a summary. */
export function cleanAdvice(advice: PhotoAdvice | undefined): PhotoAdvice | null {
  if (!advice || typeof advice.summary !== 'string' || !advice.summary.trim()) return null;
  if (!(advice.verdict in VERDICT_KEY)) return null;
  const steps = Array.isArray(advice.nextSteps) ? advice.nextSteps.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, 4) : [];
  return { ...advice, summary: advice.summary.trim(), nextSteps: steps };
}

const amount = (v: number | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** The advice as display lines: verdict, summary, the three "remaining today" figures, next steps, boss note. */
export function adviceLines(advice: PhotoAdvice, g: Translate): string[] {
  const lines = [`${g(VERDICT_KEY[advice.verdict])}: ${advice.summary}`];
  const eat = amount(advice.remainingKcalToEat);
  const protein = amount(advice.remainingProteinG);
  const burn = amount(advice.extraBurnKcal);
  const figures = [
    eat !== null ? g('ai.advice.eat', { kcal: eat }) : null,
    protein !== null ? g('ai.advice.protein', { g: protein }) : null,
    burn !== null && burn > 0 ? g('ai.advice.burn', { kcal: burn }) : null,
  ].filter((x): x is string => x !== null);
  if (figures.length) lines.push(figures.join(' · '));
  for (const step of advice.nextSteps) lines.push(`• ${step}`);
  if (advice.bossNote?.trim()) lines.push(advice.bossNote.trim());
  return lines;
}

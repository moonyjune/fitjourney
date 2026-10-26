import { isModelId } from '../../supabase/functions/_shared/usage';

/** Models offered as one-tap choices on the AI & cost screen (any other id can be typed). */
export const MODEL_PRESETS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'] as const;

export const PRICE_MAX = 1000;

/** The model id as typed: trimmed; empty is allowed (clears the choice), otherwise it must be a valid id. */
export function checkModel(text: string): { ok: true; value: string } | { ok: false } {
  const value = text.trim();
  return value === '' || isModelId(value) ? { ok: true, value } : { ok: false };
}

/** A price (USD per million tokens) as typed: a comma is accepted as the decimal mark; empty clears it. */
export function checkPrice(text: string): { ok: true; value: string } | { ok: false } {
  const value = text.trim().replace(',', '.');
  if (value === '') return { ok: true, value };
  return /^\d+(\.\d+)?$/.test(value) && Number(value) <= PRICE_MAX ? { ok: true, value } : { ok: false };
}

import { DEFAULT_PRICE_IN_PER_MTOK, DEFAULT_PRICE_OUT_PER_MTOK, isModelId } from '../../supabase/functions/_shared/usage';

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

/** Reference prices (USD per million tokens, input / output) filled in when a preset is tapped. They are a starting point to check against
 *  Anthropic's price list, not a promise; a model without an entry keeps whatever prices are typed. */
export const PRESET_PRICES: Partial<Record<string, { in: number; out: number }>> = {
  'claude-sonnet-5-5': { in: 3, out: 15 },
  'claude-opus-5-5': { in: 5, out: 25 },
  'claude-haiku-5-5': { in: 1, out: 5 },
};

export interface Pricing {
  model: string;
  /** USD per million tokens. */
  priceIn: number;
  priceOut: number;
}

/** The prices as typed (empty = the server's default, an invalid one = null so nothing is worked out from it). */
export function pricingFrom(model: string, priceIn: string, priceOut: string): Pricing | null {
  const pi = checkPrice(priceIn);
  const po = checkPrice(priceOut);
  if (!pi.ok || !po.ok) return null;
  return { model: model.trim(), priceIn: pi.value === '' ? DEFAULT_PRICE_IN_PER_MTOK : Number(pi.value), priceOut: po.value === '' ? DEFAULT_PRICE_OUT_PER_MTOK : Number(po.value) };
}

/** Dollars for some tokens at the given prices. */
export const costAt = (tokensIn: number, tokensOut: number, p: Pricing): number => (tokensIn * p.priceIn + tokensOut * p.priceOut) / 1_000_000;

export const DAYS_PER_MONTH = 30;

export interface UserForecast {
  /** Real use behind the average: user-days (a user active on a day counts once) over `days` days. */
  userDays: number;
  days: number;
  tokensIn: number;
  tokensOut: number;
  costPerDay: number;
  costPerMonth: number;
}

/** What one user costs on a day, and over a month of such days, at the given prices: the average of the real use in `days` (tokens per active
 *  user per day). Null when nobody used the AI. */
export function forecastPerUser(days: { users: number; tokensIn: number; tokensOut: number }[], p: Pricing): UserForecast | null {
  const userDays = days.reduce((s, d) => s + d.users, 0);
  if (userDays <= 0) return null;
  const tokensIn = days.reduce((s, d) => s + d.tokensIn, 0) / userDays;
  const tokensOut = days.reduce((s, d) => s + d.tokensOut, 0) / userDays;
  const costPerDay = costAt(tokensIn, tokensOut, p);
  return { userDays, days: days.filter((d) => d.users > 0).length, tokensIn, tokensOut, costPerDay, costPerMonth: costPerDay * DAYS_PER_MONTH };
}

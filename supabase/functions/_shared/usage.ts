// Pure helpers for the per-user AI quota and the cost estimate (no Deno or network use, so they are unit-tested in jest).

export type AiFeature = 'photo' | 'text' | 'label' | 'recipe' | 'report' | 'swap' | 'dinner' | 'digest';

/** Calls per user per day. */
export const DAILY_QUOTA: Record<AiFeature, number> = {
  photo: 15,
  text: 30,
  label: 15,
  recipe: 10,
  report: 3,
  swap: 10,
  dinner: 5,
  digest: 5,
};

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Default prices in USD per million tokens (Sonnet tier); override with AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK. */
export const DEFAULT_PRICE_IN_PER_MTOK = 3;
export const DEFAULT_PRICE_OUT_PER_MTOK = 15;

export function priceFrom(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Estimated dollars for one call from the `usage` block of the API response. Rounded to 1e-6. */
export function estimateCostUsd(usage: TokenUsage | undefined, priceInPerMtok: number, priceOutPerMtok: number): number {
  const cost = (count(usage?.input_tokens) * priceInPerMtok + count(usage?.output_tokens) * priceOutPerMtok) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/** True when `usedToday` calls already reached the feature's daily quota. */
export function quotaReached(feature: AiFeature, usedToday: number): boolean {
  return usedToday >= DAILY_QUOTA[feature];
}

export function quotaMessage(feature: AiFeature): string {
  return `Bạn đã hết lượt AI hôm nay cho tính năng này (${DAILY_QUOTA[feature]} lượt/ngày). Hãy thử lại vào ngày mai hoặc tự nhập số liệu.`;
}

/** Whether an Anthropic HTTP status is worth one retry (rate limit, overloaded, transient server error). */
export function shouldRetry(status: number): boolean {
  return status === 429 || status === 529 || status === 500 || status === 502 || status === 503;
}

/** Vietnam time (UTC+7): the quota day starts at 00:00 local time, not at 07:00. */
export const DAY_OFFSET_HOURS = 7;

/** The calendar day used as the quota and cost bucket, in the day offset (default Vietnam time). */
export function dayKey(now: Date = new Date(), offsetHours: number = DAY_OFFSET_HOURS): string {
  return new Date(now.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

/** Dollar caps (estimated cost): per user per day and for everybody per day. A cap of 0, negative or not a number means none. */
export const DEFAULT_USER_DAILY_BUDGET_USD = 0.6;

export function budgetFrom(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== '' && Number.isFinite(n) ? (n > 0 ? n : 0) : fallback;
}

/** True when `spent` dollars already reached a positive `limit`. */
export function budgetReached(spent: number, limit: number): boolean {
  return limit > 0 && spent >= limit;
}

export const USER_BUDGET_MESSAGE = 'Bạn đã dùng hết hạn mức AI của hôm nay. Hãy thử lại vào ngày mai hoặc tự nhập số liệu.';
export const GLOBAL_BUDGET_MESSAGE = 'Hệ thống AI đã đạt ngân sách của hôm nay, vui lòng thử lại vào ngày mai. Bạn vẫn có thể tự nhập số liệu.';

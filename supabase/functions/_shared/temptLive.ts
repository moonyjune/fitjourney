// The temptation boss's live data on the server (1.7), shared by tempt-me and tempt-chat (Deno only: the app never imports this file):
// - the player's diary summary and area, as the app sent them (cleaned: eatingHabits.ts, temptShops.ts);
// - what the boss learned from this player's own history (table tempt_interactions, temptLearn.ts), and recording each temptation
//   shown, its chat turns (with the player's tease-back lines) and, from the app, its outcome; rows older than 180 days are deleted
//   on write;
// - the open shops near the player's area (table tempt_shops, cached per user, area and time slot for 4 h): one Sonnet 5.5 call with
//   at most 3 web searches (`searchShops`), on the player's own quota (`temptshops`) and daily budget.
// Without the tables (schema.sql 1.7 not run yet) everything here quietly does nothing and the temptation works as before.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { aiAllowance, runAiCall, type AiCall, type AiCallResult, type AiContext, type AiFeature } from './ai.ts';
import { CAT_VI, cleanHabitSummary, habitPromptLines, type HabitSummary } from './eatingHabits.ts';
import { cleanInteraction, interactionRow, appendTurns, learnPromptLines, learnSummary, retentionCutoffISO, cleanTurns, type Interaction, type InteractionContext, type LearnSummary } from './temptLearn.ts';
import {
  areaText,
  cleanArea,
  cleanShopsAnswer,
  cleanShopsBatch,
  SHOPS_ALLOWED_DOMAINS,
  SHOPS_MAX_SEARCHES,
  SHOPS_SEARCH_TOOL_TYPE,
  SHOPS_SYSTEM,
  SHOPS_TOOL,
  SHOPS_TTL_MS,
  shopSlotOf,
  shopsCacheKey,
  shopsFresh,
  shopsOpenAt,
  shopsPrompt,
  shopsPromptLines,
  type ShopsBatch,
  type TemptArea,
  type TemptShop,
} from './temptShops.ts';
import { inBackground } from './systemJobs.ts';

const INTERACTIONS = 'tempt_interactions';
const SHOPS = 'tempt_shops';

export interface LiveInputs {
  habits: HabitSummary | null;
  area: TemptArea | null;
}

/** The diary summary and the area the app sent (`diary`, `area`), cleaned. */
export const liveInputsOf = (body: Record<string, unknown>): LiveInputs => ({ habits: cleanHabitSummary(body.diary), area: cleanArea(body.area) });

const minutesOf = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** This player's interactions of the retention window, newest first (max 60); [] without the table. */
export async function loadInteractions(admin: SupabaseClient, userId: string): Promise<Interaction[]> {
  try {
    const { data, error } = await admin
      .from(INTERACTIONS)
      .select('id,shown_at,pool_id,name,cat,kind,context,outcome,turns,bonus_xp,model,angle')
      .eq('user_id', userId)
      .gte('shown_at', retentionCutoffISO())
      .order('shown_at', { ascending: false })
      .limit(60);
    if (error) throw error;
    return (data ?? []).map(cleanInteraction).filter((i): i is Interaction => i !== null);
  } catch (error) {
    console.warn('[tempt] interactions not read:', error instanceof Error ? error.message : JSON.stringify(error));
    return [];
  }
}

export async function loadLearn(admin: SupabaseClient, userId: string): Promise<LearnSummary | null> {
  const list = await loadInteractions(admin, userId);
  return list.length > 0 ? learnSummary(list) : null;
}

/** Records a temptation shown to this player; returns the row id (null without the table). Older rows than the retention go. */
export async function recordShown(
  admin: SupabaseClient,
  userId: string,
  i: { poolId: string | null; name: string; cat: string; kind: string; context: InteractionContext; model: string; angle: string; turns?: { from: 'boss' | 'me'; text: string }[] }
): Promise<string | null> {
  try {
    const { data, error } = await admin.from(INTERACTIONS).insert(interactionRow(userId, { shownAt: new Date().toISOString(), ...i })).select('id').single();
    if (error) throw error;
    await admin.from(INTERACTIONS).delete().eq('user_id', userId).lt('shown_at', retentionCutoffISO());
    return typeof data?.id === 'string' ? data.id : null;
  } catch (error) {
    console.warn('[tempt] interaction not recorded:', error instanceof Error ? error.message : JSON.stringify(error));
    return null;
  }
}

/** Adds one exchange (the player's line, the boss's answer) to a recorded chat of this player. */
export async function recordTurn(admin: SupabaseClient, userId: string, id: string, mine: string, boss: string[], model: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    const { data, error } = await admin.from(INTERACTIONS).select('turns').eq('id', id).eq('user_id', userId).maybeSingle();
    if (error || !data) return;
    const turns = appendTurns(cleanTurns(data.turns), mine, boss);
    await admin.from(INTERACTIONS).update({ turns, model }).eq('id', id).eq('user_id', userId);
  } catch (error) {
    console.warn('[tempt] chat turn not recorded:', error instanceof Error ? error.message : JSON.stringify(error));
  }
}

/** The cached shops of this player's area for the slot of `time`, or null (none fresh, no area, or no table). */
export async function loadShops(admin: SupabaseClient, userId: string, area: TemptArea | null, time: string): Promise<ShopsBatch | null> {
  if (!area) return null;
  const key = shopsCacheKey(area, shopSlotOf(minutesOf(time)));
  try {
    const { data, error } = await admin
      .from(SHOPS)
      .select('payload,created_at')
      .eq('user_id', userId)
      .eq('cache_key', key)
      .gte('created_at', new Date(Date.now() - SHOPS_TTL_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = (data ?? [])[0] as { payload: unknown; created_at: string } | undefined;
    if (!row || !shopsFresh(row.created_at)) return null;
    return cleanShopsBatch(row.payload);
  } catch (error) {
    console.warn('[tempt] shops not read:', error instanceof Error ? error.message : JSON.stringify(error));
    return null;
  }
}

/** What the player tends to crave, for the shop search: their snack categories and favourite dishes. */
export function cravingsOf(h: HabitSummary | null): string[] {
  if (!h) return [];
  return [...h.snackCats.map((c) => CAT_VI[c.cat]).filter((x): x is string => !!x), ...h.favourites.map((f) => f.name)].slice(0, 6);
}

/** One shop search for this player's area and the slot of `now` (Sonnet 5.5 by default, `temptshops` quota, ≤ 3 web searches on the
 *  listing sites), saved to the cache. The error when it could not run. */
export async function searchShops(
  ctx: AiContext,
  area: TemptArea,
  now: { date: string; time: string; weekday: number },
  cravings: string[]
): Promise<{ batch: ShopsBatch } | { error: string; status: number }> {
  const allowed = await aiAllowance(ctx, 'temptshops');
  if (!allowed.ok) return { error: allowed.error, status: allowed.status };
  const minutes = minutesOf(now.time);
  const slot = shopSlotOf(minutes);
  const key = shopsCacheKey(area, slot);
  const out = await runAiCall(ctx, 'temptshops', {
    tool: SHOPS_TOOL,
    system: SHOPS_SYSTEM,
    maxTokens: 8000,
    messages: [{ role: 'user', content: `<request>${shopsPrompt({ area, minutes, weekday: now.weekday, date: now.date, cravings })}</request>` }],
    // No country: the API refuses "VN"; the area is in the prompt.
    webSearch: { maxUses: SHOPS_MAX_SEARCHES, allowedDomains: SHOPS_ALLOWED_DOMAINS, toolType: SHOPS_SEARCH_TOOL_TYPE, userLocation: { timezone: 'Asia/Ho_Chi_Minh' } },
  });
  if ('error' in out) return out;
  const shops: TemptShop[] = cleanShopsAnswer(out.input, out.findings?.urls ?? []);
  const batch: ShopsBatch = { key, slot, area: areaText(area), shops, searchedAt: new Date().toISOString(), searches: out.usage?.server_tool_use?.web_search_requests ?? 0 };
  try {
    const { error } = await ctx.admin.from(SHOPS).insert({ user_id: ctx.userId, cache_key: key, payload: batch });
    if (error) throw error;
    await ctx.admin.from(SHOPS).delete().eq('user_id', ctx.userId).lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  } catch (error) {
    console.warn('[tempt] shops not saved:', error instanceof Error ? error.message : JSON.stringify(error));
  }
  return { batch };
}

/** One call made for this player (their quota for `feature`, their usage and daily budget): the refusal when they may not now. */
export async function playerCall(ctx: AiContext, feature: AiFeature, call: AiCall): Promise<AiCallResult | { error: string; status: number }> {
  const allowed = await aiAllowance(ctx, feature);
  if (!allowed.ok) return { error: allowed.error, status: allowed.status };
  return runAiCall(ctx, feature, call);
}

/** Recently started searches per instance (user|key), so pop-ups in a row do not start the same one twice. */
const running = new Map<string, number>();

/** The cached shops for now; when there are none and the player set an area, a search is started in the background (the next
 *  pop-up gets its shops). Never waits for the web. */
export async function shopsForNow(ctx: AiContext, live: LiveInputs, now: { date: string; time: string; weekday: number }): Promise<ShopsBatch | null> {
  if (!live.area) return null;
  const cached = await loadShops(ctx.admin, ctx.userId, live.area, now.time);
  if (cached) return cached;
  const key = `${ctx.userId}|${shopsCacheKey(live.area, shopSlotOf(minutesOf(now.time)))}`;
  if (Date.now() - (running.get(key) ?? 0) < 10 * 60_000) return null;
  running.set(key, Date.now());
  await inBackground(
    searchShops(ctx, live.area, now, cravingsOf(live.habits))
      .then((r) => ('error' in r ? console.warn('[tempt] shop search:', r.error) : undefined))
      .catch((e) => console.warn('[tempt] shop search failed:', e instanceof Error ? e.message : e))
  );
  return null;
}

/** The shops that may be shown at `time` (open first, closed never), with their prompt lines. */
export function usableShops(batch: ShopsBatch | null, time: string): { list: { shop: TemptShop; open: boolean | null }[]; lines: string[] } {
  const list = batch ? shopsOpenAt(batch.shops, minutesOf(time)).slice(0, 8) : [];
  return { list, lines: shopsPromptLines(list) };
}

/** The diary and learned lines for a prompt. */
export const liveLines = (live: LiveInputs, learn: LearnSummary | null): { habitLines: string[]; learnLines: string[] } => ({
  habitLines: habitPromptLines(live.habits),
  learnLines: learnPromptLines(learn, CAT_VI),
});

export { minutesOf };

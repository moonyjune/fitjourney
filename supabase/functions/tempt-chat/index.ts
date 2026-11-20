// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy tempt-chat
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The temptation challenge with "AI tương tác" on (1.2.0, see _shared/temptChat.ts). Two actions:
// - open: the boss picks the item from the shared pool (tempt_pool) for this player now (one text call over the ~20 best-fitting unseen
//   items, with the player's day, recent foods and weak spots), then writes its opening lines looking at the item's real photo (a
//   second call, with the picture). A photo the model says does not show the item is taken off the item in the pool (withoutPhoto:
//   tempt-me looks for another later) and the pop-up shows none. The item is recorded as shown (tempt_shown), as a plain pop-up is.
// - reply: one call per player line (the "no" button or their own words, teasing the boss back): the boss answers it playfully and
//   insists, tries another angle, switches to another pool item (recorded as shown) or gives up; the player has MAX_TURNS replies and
//   at the last one the boss always gives up (a reply after that is refused without a call).
// 1.5: the candidates are ranked with _shared/temptPick.ts (time slot, weather, events, what the player just ate `meal`, their snacking
// `habits`, both sent by the app; their weak spots count as favourites); the 1.2.0 ranking is the fallback when nothing unseen fits.
// Calls per user per day: app_settings key `ai_quota.temptchat` (default 60; an open is 2 calls, a reply 1). Model (1.7): the
// `temptlive` group (ai_settings model.temptlive, default claude-sonnet-5-5). The calls count on the player's usage and daily budget.
// 1.7: every prompt also carries the player's diary summary (`diary`, eatingHabits.ts), what the boss learned from their own history
// (tempt_interactions, temptLearn.ts; its category boosts go into the ranking) and the open shops cached for their area (`area`,
// temptShops.ts; a missing cache starts a background search). The open names a shop selling that kind of item when one fits, adds the
// "why" line, and records the temptation (its id goes back as `interactionId`); each reply appends the player's line and the boss's
// answer to that record.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { aiAllowance, jsonResponse, runAiCall, serveAi, type AiContext } from '../_shared/ai.ts';
import { imageBlockOf, within } from '../_shared/dishPhotoLookup.ts';
import {
  cleanStoredPoolItem,
  cleanTemptRequest,
  poolAnswer,
  withoutPhoto,
  type PoolRow,
  type TemptPlayer,
  type TemptRequest,
  CHAT_SYSTEM,
  chatCandidates,
  cleanOpen,
  cleanPick,
  cleanTemptChatRequest,
  cleanTurn,
  MAX_TURNS,
  OPEN_TOOL,
  openPrompt,
  PICK_CANDIDATES,
  PICK_TOOL,
  pickPrompt,
  SWITCH_CANDIDATES,
  TURN_TOOL,
  turnPrompt,
} from '../_shared/tempt.ts';
import { cleanHabits, cleanMeal, nowOf, rankRows, tagsOf, type HabitProfile, type PickContext } from '../_shared/temptPick.ts';
import { habitWhyLine } from '../_shared/eatingHabits.ts';
import type { LearnSummary } from '../_shared/temptLearn.ts';
import { liveInputsOf, liveLines, loadLearn, minutesOf, recordShown, recordTurn, shopsForNow, usableShops, type LiveInputs } from '../_shared/temptLive.ts';
import { areaText, matchShop, shopOut } from '../_shared/temptShops.ts';
import { playerDataBlock } from '../_shared/temptSmart.ts';

const POOL = 'tempt_pool';
const SHOWN = 'tempt_shown';
const BUSY = 'Quỷ Cám Dỗ đang chuẩn bị thực đơn mới, lát nữa quay lại nhé.';

const toRows = (data: unknown): PoolRow[] =>
  ((data ?? []) as { id: string; item: unknown; created_at: string }[]).flatMap((r) => {
    const item = cleanStoredPoolItem(r.item);
    return item ? [{ id: r.id, item, createdAt: r.created_at }] : [];
  });

async function loadPool(admin: SupabaseClient, userId: string): Promise<{ rows: PoolRow[]; shown: Map<string, string> } | null> {
  const [pool, shownRows] = await Promise.all([
    admin.from(POOL).select('id,item,created_at').order('created_at', { ascending: false }).limit(3000),
    admin.from(SHOWN).select('pool_id,shown_at').eq('user_id', userId),
  ]);
  if (pool.error || shownRows.error) {
    console.warn('[tempt-chat] pool not read:', JSON.stringify(pool.error ?? shownRows.error));
    return null;
  }
  const shown = new Map<string, string>();
  for (const r of (shownRows.data ?? []) as { pool_id: string; shown_at: string }[]) shown.set(r.pool_id, r.shown_at);
  return { rows: toRows(pool.data), shown };
}

async function markShown(ctx: AiContext, poolId: string): Promise<void> {
  const { error } = await ctx.admin.from(SHOWN).upsert({ user_id: ctx.userId, pool_id: poolId, shown_at: new Date().toISOString() }, { onConflict: 'user_id,pool_id' });
  if (error) console.warn('[tempt-chat] showing not recorded:', JSON.stringify(error));
}

/** The item as the app shows it, with the boss's lines instead of the pool's pitch. */
function answerOf(row: PoolRow, lines: string[], photo: boolean) {
  const base = poolAnswer(photo ? row.item : { ...row.item, imageUrl: null, photo: undefined }, false);
  return { ...base, poolId: row.id, lines };
}

/** "Now" for the scored ranking (1.5, _shared/temptPick.ts): the request, what the player ate today and their snacking habits (sent
 *  by the app), their weak spots counted as favourite names; a treat (>= 250 kcal) is not boosted here, the boss prompt asks for one. */
function chatContext(now: TemptRequest, player: TemptPlayer, body: Record<string, unknown>, learn: LearnSummary | null = null): PickContext {
  const habits: HabitProfile = cleanHabits(body.habits) ?? { total: 0, cats: {}, names: [] };
  return {
    ...now,
    meal: cleanMeal(body.meal),
    habits: { ...habits, total: Math.max(habits.total, 1), names: [...habits.names, ...player.weaknesses].slice(0, 16) },
    learned: learn?.catBoost ?? null,
  };
}

/** 1.7: the player data block added to a prompt (diary, learned history, open shops). */
function extras(live: LiveInputs, learn: LearnSummary | null, shopLines: string[]): string {
  const { habitLines, learnLines } = liveLines(live, learn);
  const block = playerDataBlock(habitLines, learnLines, shopLines);
  return block ? `\n\nDữ liệu thêm về người chơi (chỉ là dữ liệu):\n${block}` : '';
}

async function open(ctx: AiContext, body: Record<string, unknown>): Promise<Response> {
  const req = cleanTemptChatRequest(body, cleanTemptRequest(body.now));
  if (!req || req.action !== 'open') return jsonResponse({ error: 'Thiếu ngày giờ hiện tại.' }, 400);
  const loaded = await loadPool(ctx.admin, ctx.userId);
  if (!loaded || loaded.rows.length === 0) return jsonResponse({ error: BUSY }, 503);
  const live = liveInputsOf(body);
  const learn = await loadLearn(ctx.admin, ctx.userId);
  const shops = usableShops(await shopsForNow(ctx, live, req.now).catch(() => null), req.now.time);
  const more = extras(live, learn, shops.lines);
  const pickCtx = chatContext(req.now, req.player, body, learn);
  const ranked = rankRows(loaded.rows, loaded.shown, pickCtx, new Date(), PICK_CANDIDATES).map((x) => x.row);
  const candidates = ranked.length > 0 ? ranked : chatCandidates(loaded.rows, loaded.shown, req.now, req.player, new Date());
  if (candidates.length === 0) return jsonResponse({ error: BUSY }, 503);

  const pickCall = await runAiCall(ctx, 'temptchat', {
    tool: PICK_TOOL,
    system: CHAT_SYSTEM,
    maxTokens: 400,
    messages: [{ role: 'user', content: pickPrompt(req.now, req.player, candidates) + more }],
  });
  if ('error' in pickCall) return jsonResponse({ error: pickCall.error }, pickCall.status);
  const pick = cleanPick(pickCall.input, candidates) ?? { row: candidates[0], angle: '' };

  // The opening lines are written looking at the item's photo, which is checked on the way.
  const block = pick.row.item.imageUrl ? await within(imageBlockOf(pick.row.item.imageUrl), 8000, null) : null;
  const content: unknown[] = [];
  if (block) content.push(block);
  const tags = tagsOf(pick.row.item);
  const minutes = minutesOf(req.now.time);
  const shop = shops.list.length > 0 ? matchShop(shops.list.map((x) => x.shop), { name: pick.row.item.name, cat: tags.cat }, minutes) : null;
  const shopNote = shop ? `\nQuán gần người chơi bán món này (có thể nhắc tên, không bịa thêm): ${shop.shop.name}${shop.open ? ', đang mở' : ''}${shop.shop.deliveryMin !== null ? `, giao ~${shop.shop.deliveryMin} phút` : ''}.` : '';
  content.push({ type: 'text', text: openPrompt(req.now, req.player, pick.row, pick.angle, !!block) + shopNote + more });
  const openCall = await runAiCall(ctx, 'temptchat', { tool: OPEN_TOOL, system: CHAT_SYSTEM, maxTokens: 700, messages: [{ role: 'user', content }] });
  const opened = 'error' in openCall ? { photoMatches: true, lines: [] } : cleanOpen(openCall.input);
  const photoOk = !!pick.row.item.imageUrl && (!block || opened.photoMatches);
  if (block && !opened.photoMatches) {
    const { error } = await ctx.admin.from(POOL).update({ item: withoutPhoto(pick.row.item) }).eq('id', pick.row.id);
    if (error) console.warn('[tempt-chat] wrong photo not dropped:', JSON.stringify(error));
  }
  await markShown(ctx, pick.row.id);
  const lines = opened.lines.length > 0 ? opened.lines : [pick.row.item.whyNow, pick.row.item.pitch].filter(Boolean);
  const now = nowOf(pickCtx);
  const interactionId = await recordShown(ctx.admin, ctx.userId, {
    poolId: pick.row.id,
    name: pick.row.item.name,
    cat: tags.cat,
    kind: tags.course === 'drink' ? 'drink' : 'food',
    context: {
      slot: now.slot,
      weekday: req.now.weekday,
      weather: now.weather,
      tempC: now.tempC,
      kcalLeft: live.habits?.today.leftKcal ?? null,
      sinceMealMin: pickCtx.meal?.sinceMealMin ?? null,
      area: live.area ? areaText(live.area) : '',
      shop: shop?.shop.name ?? '',
    },
    model: pickCall.model,
    angle: pick.angle,
    turns: lines.map((text) => ({ from: 'boss' as const, text })),
  });
  const why = habitWhyLine(live.habits, { cat: tags.cat, nowMinutes: minutes });
  return jsonResponse({
    result: {
      ...answerOf(pick.row, lines, photoOk),
      ...(shop ? { shop: shopOut(shop.shop, shop.open) } : {}),
      ...(why ? { why } : {}),
      ...(interactionId ? { interactionId } : {}),
    },
  });
}

async function reply(ctx: AiContext, body: Record<string, unknown>): Promise<Response> {
  const req = cleanTemptChatRequest(body, cleanTemptRequest(body.now));
  if (!req || req.action !== 'reply') return jsonResponse({ error: 'Thiếu nội dung trò chuyện.' }, 400);
  if (req.turn >= MAX_TURNS) return jsonResponse({ error: 'Hết lượt đáp trả rồi, Quỷ đã chịu thua.' }, 400);
  const loaded = await loadPool(ctx.admin, ctx.userId);
  const live = liveInputsOf(body);
  const learn = await loadLearn(ctx.admin, ctx.userId);
  const avoid = [req.item.name, ...req.offered];
  const ranked = loaded ? rankRows(loaded.rows, loaded.shown, { ...chatContext(req.now, req.player, body, learn), avoid: [...req.now.avoid, ...avoid] }, new Date(), SWITCH_CANDIDATES).map((x) => x.row) : [];
  const alternatives = ranked.length > 0 ? ranked : loaded ? chatCandidates(loaded.rows, loaded.shown, req.now, req.player, new Date(), avoid, SWITCH_CANDIDATES) : [];
  const call = await runAiCall(ctx, 'temptchat', {
    tool: TURN_TOOL,
    system: CHAT_SYSTEM,
    maxTokens: 600,
    messages: [{ role: 'user', content: turnPrompt(req, alternatives) + extras(live, learn, []) }],
  });
  if ('error' in call) return jsonResponse({ error: call.error }, call.status);
  const turn = cleanTurn(call.input, alternatives, req.turn);
  // 1.7: the exchange goes into the record of this temptation (the player's own line, the boss's answer).
  const mine = [...req.chat].reverse().find((l) => l.from === 'me')?.text ?? '';
  if (typeof body.interactionId === 'string' && mine) await recordTurn(ctx.admin, ctx.userId, body.interactionId, mine, turn.lines, call.model);
  if (turn.switchTo) {
    await markShown(ctx, turn.switchTo.id);
    return jsonResponse({ result: { move: turn.move, lines: turn.lines, item: answerOf(turn.switchTo, [], !!turn.switchTo.item.imageUrl) } });
  }
  return jsonResponse({ result: { move: turn.move, lines: turn.lines } });
}

serveAi('temptchat', async (body, ctx) => {
  // Each action makes its own calls (an open makes two), so the allowance is checked here, before any of them.
  const allowed = await aiAllowance(ctx, 'temptchat');
  if (!allowed.ok) return jsonResponse({ error: allowed.error }, allowed.status);
  if (body.action === 'open') return open(ctx, body);
  if (body.action === 'reply') return reply(ctx, body);
  return jsonResponse({ error: 'Unknown action.' }, 400);
});

// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy tempt-chat
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The temptation challenge with "AI tương tác" on (1.2.0, see _shared/temptChat.ts). Two actions:
// - open: the boss picks the item from the shared pool (tempt_pool) for this player now (one text call over the ~20 best-fitting unseen
//   items, with the player's day, recent foods and weak spots), then writes its opening lines looking at the item's real photo (a
//   second call, with the picture). A photo the model says does not show the item is taken off the item in the pool (withoutPhoto:
//   tempt-me looks for another later) and the pop-up shows none. The item is recorded as shown (tempt_shown), as a plain pop-up is.
// - reply: after the player said no, one call per player line: the boss answers it and insists, tries another angle, switches to
//   another pool item (recorded as shown) or gives up; at the MAX_TURNS-th turn it always gives up.
// Calls per user per day: app_settings key `ai_quota.temptchat` (default 60; an open is 2 calls, a reply 1). Model: the `tempt` group
// (ai_settings model.tempt, default claude-haiku-5-5). The calls count on the player's usage and daily budget.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { aiAllowance, jsonResponse, runAiCall, serveAi, type AiContext } from '../_shared/ai.ts';
import { imageBlockOf, within } from '../_shared/dishPhotoLookup.ts';
import {
  cleanStoredPoolItem,
  cleanTemptRequest,
  poolAnswer,
  withoutPhoto,
  type PoolRow,
  CHAT_SYSTEM,
  chatCandidates,
  cleanOpen,
  cleanPick,
  cleanTemptChatRequest,
  cleanTurn,
  OPEN_TOOL,
  openPrompt,
  PICK_TOOL,
  pickPrompt,
  SWITCH_CANDIDATES,
  TURN_TOOL,
  turnPrompt,
} from '../_shared/tempt.ts';

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

async function open(ctx: AiContext, body: Record<string, unknown>): Promise<Response> {
  const req = cleanTemptChatRequest(body, cleanTemptRequest(body.now));
  if (!req || req.action !== 'open') return jsonResponse({ error: 'Thiếu ngày giờ hiện tại.' }, 400);
  const loaded = await loadPool(ctx.admin, ctx.userId);
  if (!loaded || loaded.rows.length === 0) return jsonResponse({ error: BUSY }, 503);
  const candidates = chatCandidates(loaded.rows, loaded.shown, req.now, req.player, new Date());
  if (candidates.length === 0) return jsonResponse({ error: BUSY }, 503);

  const pickCall = await runAiCall(ctx, 'temptchat', {
    tool: PICK_TOOL,
    system: CHAT_SYSTEM,
    maxTokens: 400,
    messages: [{ role: 'user', content: pickPrompt(req.now, req.player, candidates) }],
  });
  if ('error' in pickCall) return jsonResponse({ error: pickCall.error }, pickCall.status);
  const pick = cleanPick(pickCall.input, candidates) ?? { row: candidates[0], angle: '' };

  // The opening lines are written looking at the item's photo, which is checked on the way.
  const block = pick.row.item.imageUrl ? await within(imageBlockOf(pick.row.item.imageUrl), 8000, null) : null;
  const content: unknown[] = [];
  if (block) content.push(block);
  content.push({ type: 'text', text: openPrompt(req.now, req.player, pick.row, pick.angle, !!block) });
  const openCall = await runAiCall(ctx, 'temptchat', { tool: OPEN_TOOL, system: CHAT_SYSTEM, maxTokens: 700, messages: [{ role: 'user', content }] });
  const opened = 'error' in openCall ? { photoMatches: true, lines: [] } : cleanOpen(openCall.input);
  const photoOk = !!pick.row.item.imageUrl && (!block || opened.photoMatches);
  if (block && !opened.photoMatches) {
    const { error } = await ctx.admin.from(POOL).update({ item: withoutPhoto(pick.row.item) }).eq('id', pick.row.id);
    if (error) console.warn('[tempt-chat] wrong photo not dropped:', JSON.stringify(error));
  }
  await markShown(ctx, pick.row.id);
  const lines = opened.lines.length > 0 ? opened.lines : [pick.row.item.whyNow, pick.row.item.pitch].filter(Boolean);
  return jsonResponse({ result: answerOf(pick.row, lines, photoOk) });
}

async function reply(ctx: AiContext, body: Record<string, unknown>): Promise<Response> {
  const req = cleanTemptChatRequest(body, cleanTemptRequest(body.now));
  if (!req || req.action !== 'reply') return jsonResponse({ error: 'Thiếu nội dung trò chuyện.' }, 400);
  const loaded = await loadPool(ctx.admin, ctx.userId);
  const alternatives = loaded ? chatCandidates(loaded.rows, loaded.shown, req.now, req.player, new Date(), [req.item.name, ...req.offered], SWITCH_CANDIDATES) : [];
  const call = await runAiCall(ctx, 'temptchat', {
    tool: TURN_TOOL,
    system: CHAT_SYSTEM,
    maxTokens: 600,
    messages: [{ role: 'user', content: turnPrompt(req, alternatives) }],
  });
  if ('error' in call) return jsonResponse({ error: call.error }, call.status);
  const turn = cleanTurn(call.input, alternatives, req.turn);
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

// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy report-photo
// No AI call and no extra secret (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are always set).
//
// "Ảnh sai?" (1.5): a signed-in player reports that the photo shown with a dish is wrong. The app has already hidden it for them;
// here it is flagged for everybody, inside the jsonb that holds it (no schema change, see _shared/photoReport.ts):
//   {"kind":"dish","name":"Bún bò Huế","url":"https://…"}            → dish_photos row of the dish (by its core name, as dish-photo
//                                                                      caches it): `photo.photoFlag` = { count, lastAt, url, by }.
//                                                                      dish-photo then serves none for it and searches the web first.
//   {"kind":"tempt","name":"Trà sữa","url":"https://…","poolId":"…"} → tempt_pool row (by id, else by name): `item.photoFlag`.
//                                                                      tempt-me treats a flagged item as needing a new photo.
// Only when the stored photo IS the reported picture (a photo replaced since is left alone). Each player counts once per photo.
// Rate limit: REPORTS_PER_DAY reports per player per day, counted in ai_usage under the feature `photoreport` (calls only, cost 0).
// Answers { result: { flagged, count?, why? } }, or { error } (401 not signed in, 400 bad request, 429 too many reports).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/ai.ts';
import { cacheKey, cleanDishPhotoRequest } from '../_shared/dishPhoto.ts';
import { cleanReportRequest, flagStored, PHOTO_REPORT_FEATURE, poolItemPicture, reportAllowed, reporterTag, REPORTS_PER_DAY } from '../_shared/photoReport.ts';
import { poolNameKey } from '../_shared/tempt.ts';
import { dayKey } from '../_shared/usage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Thiếu Authorization header.' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Không xác thực được người dùng.' }, 401);
    if (!SERVICE_ROLE_KEY) return jsonResponse({ error: 'Server chưa cấu hình khóa dịch vụ (SUPABASE_SERVICE_ROLE_KEY).' }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonResponse({ error: 'Nội dung yêu cầu không hợp lệ.' }, 400);
    }
    const report = cleanReportRequest(raw);
    if (!report) return jsonResponse({ error: 'Thiếu món hoặc ảnh.' }, 400);

    // The day's reports of this player (one ai_usage row per model; reports use the model "none").
    const day = dayKey();
    const { data: usage } = await admin.from('ai_usage').select('calls').eq('user_id', user.id).eq('day', day).eq('feature', PHOTO_REPORT_FEATURE);
    const used = (usage ?? []).reduce((sum, row) => sum + Number((row as { calls?: number }).calls ?? 0), 0);
    if (!reportAllowed(used)) return jsonResponse({ error: `Bạn đã báo ${REPORTS_PER_DAY} ảnh sai hôm nay. Ảnh vẫn được ẩn trên máy bạn.` }, 429);
    const { error: bumpError } = await admin.rpc('ai_usage_bump', { p_user: user.id, p_day: day, p_feature: PHOTO_REPORT_FEATURE, p_in: 0, p_out: 0, p_cost: 0, p_model: 'none' });
    if (bumpError) console.warn('[report-photo] report not counted:', JSON.stringify(bumpError));

    const tag = reporterTag(user.id);
    if (report.kind === 'dish') {
      const dish = cleanDishPhotoRequest({ dishes: [{ name: report.name }] })?.[0];
      if (!dish) return jsonResponse({ error: 'Thiếu tên món.' }, 400);
      const key = cacheKey(dish.key);
      const { data: row, error } = await admin.from('dish_photos').select('photo').eq('dish_key', key).maybeSingle();
      if (error) return jsonResponse({ error: `dish_photos not read: ${error.message}` }, 500);
      const photo = (row?.photo ?? null) as Record<string, unknown> | null;
      const picture = photo && photo.none !== true && typeof photo.url === 'string' ? photo.url : null;
      const out = flagStored(photo, picture, report.url, tag);
      if (!out.ok) return jsonResponse({ result: { flagged: false, why: out.why } });
      // checked_at is left as it was: the flag, not the age, makes dish-photo look again.
      const { error: writeError } = await admin.from('dish_photos').update({ photo: out.value }).eq('dish_key', key);
      if (writeError) return jsonResponse({ error: `dish_photos not written: ${writeError.message}` }, 500);
      console.log('[report-photo] dish flagged', key, 'count', (out.value.photoFlag as { count: number }).count);
      return jsonResponse({ result: { flagged: true, count: (out.value.photoFlag as { count: number }).count } });
    }

    // A temptation challenge picture: the pool item by its id, else by its name.
    const query = admin.from('tempt_pool').select('id,item');
    const { data: poolRow, error: poolError } = await (report.poolId ? query.eq('id', report.poolId) : query.eq('name_key', poolNameKey(report.name))).maybeSingle();
    if (poolError) return jsonResponse({ error: `tempt_pool not read: ${poolError.message}` }, 500);
    if (!poolRow) return jsonResponse({ result: { flagged: false, why: 'none' } });
    const item = poolRow.item as Record<string, unknown>;
    const out = flagStored(item, poolItemPicture(item), report.url, tag);
    if (!out.ok) return jsonResponse({ result: { flagged: false, why: out.why } });
    const { error: writeError } = await admin.from('tempt_pool').update({ item: out.value }).eq('id', poolRow.id);
    if (writeError) return jsonResponse({ error: `tempt_pool not written: ${writeError.message}` }, 500);
    console.log('[report-photo] pool item flagged', poolRow.id, 'count', (out.value.photoFlag as { count: number }).count);
    return jsonResponse({ result: { flagged: true, count: (out.value.photoFlag as { count: number }).count } });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Lỗi không xác định.' }, 500);
  }
});

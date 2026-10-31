// Supabase Edge Function (Deno runtime).
// Deploy with: npx supabase functions deploy tempt-me
// Requires secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The temptation challenge, Hard level: the player switched on a game in which the app now and then tries to tempt them with a food
// or drink. This asks the model for ONE item that fits right now (local date and time, weekday, city, weather) and lets it search the
// web (Anthropic's server-side web search, and web fetch on models that take the newer tool version) for what is trending or new,
// a holiday or event, or a drink for the weather. The picture is a real one: the image URL the model copied from a fetched page, or
// the og:image of the product page it found (fetched here); a URL that no search result or fetched page showed is dropped, never
// shown. When the API key may not use the web tools, the call goes ahead without them and the answer says so (`web: 'unavailable'`).
// Cost: up to 2 searches ($0.01 each) plus the tokens of what was read; usage and cost are logged under the feature `tempt`.
// Calls per user per day: app_settings key `ai_quota.tempt` (default 6).

import { jsonResponse, serveAi } from '../_shared/ai.ts';
import { cleanTemptAnswer, cleanTemptRequest, extractOgImage, publicHttpsUrl, TEMPT_SYSTEM, TEMPT_TOOL, temptPrompt } from '../_shared/tempt.ts';
import { seenInEvidence, webToolsFor } from '../_shared/webtools.ts';

const PAGE_TIMEOUT_MS = 5000;
const PAGE_MAX_BYTES = 400_000;

/** The og:image of a page the search found, or null (not HTML, too slow, an unsafe address, none on the page). */
async function ogImageOf(pageUrl: string): Promise<string | null> {
  const url = publicHttpsUrl(pageUrl);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (FitQuest temptation preview)', accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!response.ok || !publicHttpsUrl(response.url || url)) return null;
    if (!(response.headers.get('content-type') ?? '').includes('html')) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < PAGE_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    const html = new TextDecoder().decode(bytes);
    return extractOgImage(html, response.url || url);
  } catch (error) {
    console.warn('[tempt-me] page not read:', error instanceof Error ? error.message : error);
    return null;
  }
}

serveAi('tempt', async (body) => {
  const req = cleanTemptRequest(body);
  if (!req) return jsonResponse({ error: 'Thiếu ngày giờ hiện tại.' }, 400);
  return {
    responseKey: 'result',
    call: {
      tool: TEMPT_TOOL,
      system: TEMPT_SYSTEM,
      maxTokens: 4000,
      messages: [{ role: 'user', content: `<request>${temptPrompt(req, true)}</request>` }],
      serverTools: (model) => webToolsFor(model, { maxSearches: 2, maxFetches: 1, city: req.city || undefined }),
    },
    shape: async (input, { web: outcome }) => {
      const web = outcome!;
      const item = cleanTemptAnswer(input, (url) => seenInEvidence(url, web.evidence));
      if (!item) return { error: 'empty' };
      if (!item.imageUrl && item.sourceUrl) {
        item.imageUrl = await ogImageOf(item.sourceUrl);
        if (item.imageUrl && !item.sourceDomain) item.sourceDomain = new URL(item.sourceUrl).hostname.replace(/^www\./, '');
      }
      return { ...item, web: !web.available ? 'unavailable' : web.searches > 0 ? 'used' : 'unused' };
    },
  };
});

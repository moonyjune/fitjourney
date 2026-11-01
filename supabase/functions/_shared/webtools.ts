// Anthropic's server-side web tools (web search, web fetch), for the AI calls that may look things up: which tool versions a model
// takes, what the answer showed of the web (so a URL the model reports can be checked against pages it really saw), and how to
// tell that the API key may not use them. Pure (no Deno or network use): unit-tested in jest.
//
// Tool types (Claude API, no beta header): web_search_20260209 / web_fetch_20260209 with dynamic filtering on Opus 4.6+ / Sonnet 4.6+
// (and Fable); older models only get the basic web_search_20250305. Pricing: $10 per 1,000 searches plus the tokens of the results;
// a fetch costs only the tokens of the fetched page.

/** Dollars per web search request ($10 per 1,000). */
export const WEB_SEARCH_USD_PER_REQUEST = 0.01;

/** Models that take the `_20260209` (dynamic filtering) variants. */
const DYNAMIC_FILTERING = /^claude-(opus-(4-[678]|5)|sonnet-(4-6|5)|fable|mythos)/;

export interface WebToolOptions {
  /** Searches at most this many times per request. */
  maxSearches: number;
  /** Fetches at most this many pages per request (0: no fetch tool). */
  maxFetches: number;
  /** Rough location for local results (a city name, cleaned by the caller); the time zone defaults to Vietnam's. A country the
   *  search refuses (VN: "country not supported") is never sent; the city is in the prompt text anyway. */
  city?: string;
  country?: string;
  timezone?: string;
}

/** Countries `user_location.country` refuses. (The same list as in webSearch.ts; kept as its own copy because the shared files
 *  import nothing from each other.) */
const UNSUPPORTED_COUNTRIES = ['VN'];

/** The server tools to declare for `model`: search (and fetch on models with the newer variants, which need no beta header). */
export function webToolsFor(model: string, options: WebToolOptions): Record<string, unknown>[] {
  const dynamic = DYNAMIC_FILTERING.test(model);
  const country = options.country && !UNSUPPORTED_COUNTRIES.includes(options.country.toUpperCase()) ? options.country : undefined;
  const location = {
    type: 'approximate',
    ...(options.city ? { city: options.city } : {}),
    ...(country ? { country } : {}),
    timezone: options.timezone ?? 'Asia/Ho_Chi_Minh',
  };
  const tools: Record<string, unknown>[] = [
    { type: dynamic ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: options.maxSearches, user_location: location },
  ];
  if (dynamic && options.maxFetches > 0) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: options.maxFetches, max_content_tokens: 6000 });
  return tools;
}

/** What one answer showed of the web: every URL of a search result, a fetched page or a citation, and the fetched pages' text. */
export interface WebEvidence {
  urls: string[];
  texts: string[];
}

export const emptyEvidence = (): WebEvidence => ({ urls: [], texts: [] });

const MAX_TEXT_CHARS = 400_000;

function addUrl(into: WebEvidence, url: unknown) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url) && !into.urls.includes(url)) into.urls.push(url);
}

/** Adds what the content blocks of one API answer show of the web to `into` (and returns it). Errors (an object instead of a list,
 *  or a `*_tool_error`) add nothing. */
export function collectWebEvidence(blocks: unknown, into: WebEvidence = emptyEvidence()): WebEvidence {
  if (!Array.isArray(blocks)) return into;
  for (const raw of blocks) {
    const block = raw as Record<string, any> | null;
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const result of block.content) if (result?.type === 'web_search_result') addUrl(into, result.url);
    } else if (block.type === 'web_fetch_tool_result' && block.content?.type === 'web_fetch_result') {
      addUrl(into, block.content.url);
      const data = block.content.content?.source?.data;
      if (typeof data === 'string' && block.content.content?.source?.type === 'text') {
        const used = into.texts.reduce((n, t) => n + t.length, 0);
        if (used < MAX_TEXT_CHARS) into.texts.push(data.slice(0, MAX_TEXT_CHARS - used));
      }
    } else if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const citation of block.citations) addUrl(into, citation?.url);
    }
  }
  return into;
}

/** A URL without its fragment and trailing slash, for comparing. */
export function normalizeUrl(url: string): string {
  return url.replace(/#.*$/, '').replace(/\/+$/, '');
}

/** Whether `url` was really seen in the answer: a result/fetched/cited URL, or written out in a fetched page. */
export function seenInEvidence(url: string, evidence: WebEvidence | undefined): boolean {
  if (!evidence || !url) return false;
  const want = normalizeUrl(url);
  if (evidence.urls.some((u) => normalizeUrl(u) === want)) return true;
  return evidence.texts.some((t) => t.includes(url));
}

/** The API refused the web tools themselves (not enabled for the organisation, not on this model, a bad tool version, a region
 *  web search does not serve): the call is then made again without them. A refused `user_location` alone is tried first without the
 *  location (`isUserLocationRejected` in webSearch.ts, `withoutUserLocation`). */
export function isServerToolUnavailable(status: number, body: string): boolean {
  if (status !== 400 && status !== 403) return false;
  return /web_search|web_fetch|server[ _]tool/i.test(body) || (/\b(country|countries|region|location)\b/i.test(body) && /not supported|unsupported|not available/i.test(body));
}

/** Whether any of the tools carries a `user_location`. */
export const hasUserLocation = (tools: Record<string, unknown>[]): boolean => tools.some((t) => t.user_location !== undefined);

/** The same tools with `user_location` taken out (after the API refused it). */
export function withoutUserLocation(tools: Record<string, unknown>[]): Record<string, unknown>[] {
  return tools.map((t) => {
    if (t.user_location === undefined) return t;
    const { user_location: _dropped, ...rest } = t;
    return rest;
  });
}

/** Cost of the web searches of one call. */
export function webSearchCostUsd(requests: unknown): number {
  return typeof requests === 'number' && Number.isFinite(requests) && requests > 0 ? Math.round(requests) * WEB_SEARCH_USD_PER_REQUEST : 0;
}

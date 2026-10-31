// Anthropic's server-side web search tool, as the AI Edge Functions use it: the tool definition (with fallbacks for a model or
// platform that does not take the newest version), reading what was actually found out of the answer's content blocks (search
// results, citations, error codes), and recognising "web search is not enabled for this organization". Pure (no Deno use),
// unit-tested in jest.
//
// Tool versions (Claude API docs, checked 2026-10-31): `web_search_20260318` (dynamic filtering + response_inclusion; Claude 4.6
// and later), `web_search_20260209` (dynamic filtering), `web_search_20250305` (basic, every model that has web search).
// Dynamic filtering runs the search from code execution (allowed_callers defaults to code execution); a model without
// programmatic tool calling needs `allowed_callers: ["direct"]` (the API answers 400 naming allowed_callers). Dynamic filtering is
// for Claude 4.6 and later; an older model starts on the basic version, so the first request is not spent on a refusal.
// Price: $10 per 1,000 searches (usage.server_tool_use.web_search_requests, priced in usage.ts), plus the tokens of the results;
// a failed search is not billed.

export type WebSearchVariant = 'dynamic' | 'dynamic-direct' | 'basic';

export interface WebSearchOptions {
  /** At most this many searches in one request. */
  maxUses: number;
  /** Localises the results (country = ISO 3166-1 alpha-2, timezone = IANA id). */
  userLocation?: { city?: string; region?: string; country?: string; timezone?: string };
}

export const WEB_SEARCH_TOOL_TYPE = 'web_search_20260318';
export const WEB_SEARCH_BASIC_TYPE = 'web_search_20250305';

/** The tool definition for a variant. */
export function webSearchTool(opts: WebSearchOptions, variant: WebSearchVariant = 'dynamic'): Record<string, unknown> {
  const tool: Record<string, unknown> = {
    type: variant === 'basic' ? WEB_SEARCH_BASIC_TYPE : WEB_SEARCH_TOOL_TYPE,
    name: 'web_search',
    max_uses: Math.max(1, Math.min(10, Math.round(opts.maxUses))),
  };
  if (variant === 'dynamic-direct') tool.allowed_callers = ['direct'];
  if (opts.userLocation && Object.values(opts.userLocation).some(Boolean)) tool.user_location = { type: 'approximate', ...opts.userLocation };
  return tool;
}

/** Models that take the dynamic-filtering versions (Claude 4.6 and later); any other model starts on the basic one. */
const DYNAMIC_MODELS = /^claude-(opus-(4-[678]|5)|sonnet-(4-6|5)|haiku-5|fable|mythos)/;

/** The variant to start with for `model`. */
export const webSearchVariantFor = (model: string): WebSearchVariant => (DYNAMIC_MODELS.test(model) ? 'dynamic' : 'basic');

/** The next variant to try after a 400 that is about the tool (a model without programmatic tool calling or code execution, or
 *  without the newest version, or a field of the tool it does not take); null when the error is about something else, says web
 *  search is off for the organization, or there is nothing left to try. */
export function webSearchVariantAfter(status: number, body: string, current: WebSearchVariant): WebSearchVariant | null {
  if (status !== 400 || current === 'basic' || isWebSearchUnavailable(status, body)) return null;
  if (current === 'dynamic' && /allowed_callers|programmatic|code[ _-]?execution/i.test(body)) return 'dynamic-direct';
  if (/web_search|allowed_callers|response_inclusion|code[ _-]?execution|tools\.\d/i.test(body)) return 'basic';
  return null;
}

/** The organization's admin turned web search off (or the key may not use it): a 400/403 that names web search as not enabled / not
 *  allowed. Not a reason to retry. */
export function isWebSearchUnavailable(status: number, body: string): boolean {
  if (status !== 400 && status !== 403) return false;
  return /web[ _-]?search/i.test(body) && /not enabled|disabled|not allowed|permission|not permitted/i.test(body);
}

export const PLACES_UNAVAILABLE_PREFIX = 'Tìm địa điểm chưa khả dụng';

export interface WebFindings {
  /** Every result URL the search returned and every URL cited, normalised, once each. */
  urls: string[];
  results: { url: string; title: string; pageAge: string | null }[];
  citations: { url: string; title: string; citedText: string }[];
  /** Error codes of searches that failed (max_uses_exceeded, too_many_requests, ...). */
  errors: string[];
}

/** A URL as it is compared: http(s) only, no fragment, host in lower case, no trailing slash. Empty when it is not a web URL. */
export function normalizeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  const m = /^(https?):\/\/([^/?#\s]+)([^#\s]*)/i.exec(s);
  if (!m) return '';
  const rest = m[3].replace(/\/+(\?|$)/, '$1');
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${rest}`;
}

/** The host of a URL without "www." (empty when it is not a web URL). */
export function urlHost(raw: unknown): string {
  const n = normalizeUrl(raw);
  const m = /^https?:\/\/([^/?#:]+)/.exec(n);
  return m ? m[1].replace(/^www\./, '') : '';
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** What the searches of one answer found: the `web_search_tool_result` blocks (direct, or nested under dynamic filtering) and the
 *  `web_search_result_location` citations of text blocks. */
export function collectWebFindings(blocks: unknown[]): WebFindings {
  const seen = new Set<string>();
  const out: WebFindings = { urls: [], results: [], citations: [], errors: [] };
  const add = (url: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.urls.push(url);
    }
  };
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    const b = (raw ?? {}) as Record<string, unknown>;
    if (b.type === 'web_search_tool_result') {
      const content = b.content as unknown;
      if (Array.isArray(content)) {
        for (const r of content) {
          const o = (r ?? {}) as Record<string, unknown>;
          const url = normalizeUrl(o.url);
          if (o.type !== 'web_search_result' || !url) continue;
          if (!seen.has(url)) out.results.push({ url, title: str(o.title, 200), pageAge: str(o.page_age, 40) || null });
          add(url);
        }
      } else if (content && typeof content === 'object') {
        const code = str((content as Record<string, unknown>).error_code, 40);
        if (code) out.errors.push(code);
      }
    } else if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const c of b.citations) {
        const o = (c ?? {}) as Record<string, unknown>;
        const url = normalizeUrl(o.url);
        if (o.type !== 'web_search_result_location' || !url) continue;
        out.citations.push({ url, title: str(o.title, 200), citedText: str(o.cited_text, 300) });
        add(url);
      }
    }
  }
  return out;
}

/** Findings of several answers (a turn continued after `pause_turn`) as one. */
export function mergeFindings(list: WebFindings[]): WebFindings {
  const out: WebFindings = { urls: [], results: [], citations: [], errors: [] };
  const seen = new Set<string>();
  for (const f of list) {
    for (const r of f.results) if (!seen.has(r.url)) out.results.push(r);
    for (const u of f.urls) if (!seen.has(u)) {
      seen.add(u);
      out.urls.push(u);
    }
    out.citations.push(...f.citations);
    out.errors.push(...f.errors);
  }
  return out;
}

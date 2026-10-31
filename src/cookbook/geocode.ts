// Cheat day > "my location": the device position turned into a readable Vietnamese address with OpenStreetMap's Nominatim reverse
// geocoding (free, no key; at most one request per tap, which is within its usage policy). A browser sends its own User-Agent and
// Referer (both identify the app); elsewhere the app names itself. No e-mail is sent. Any failure gives null: the coordinates are
// still used for the search, and the user can type the address.

export const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const TIMEOUT_MS = 8000;

type NominatimAddress = Record<string, string | undefined>;

/** "Thành phố Hồ Chí Minh" as "TP.HCM", "Thành phố Hà Nội" as "Hà Nội" (the way addresses are written in Vietnam). */
function shortCity(name: string): string {
  if (/^(thành phố )?hồ chí minh$/i.test(name)) return 'TP.HCM';
  return name.replace(/^Thành phố\s+/i, '');
}

/** A Nominatim reverse answer as one address line: house number and street, ward, district, city ("123 Lê Lợi, Phường Bến Thành,
 *  Quận 1, TP.HCM"); its display name (first parts) when there are no address details; empty when there is nothing usable. */
export function formatAddress(raw: unknown): string {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { address?: NominatimAddress; display_name?: unknown };
  const a = o.address && typeof o.address === 'object' ? o.address : null;
  const pick = (...keys: string[]) => keys.map((k) => a?.[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '')?.trim() ?? '';
  const parts: string[] = [];
  if (a) {
    const street = [pick('house_number'), pick('road', 'pedestrian', 'footway', 'residential')].filter(Boolean).join(' ');
    const city = pick('city', 'town', 'village', 'municipality', 'state', 'province');
    for (const p of [street || pick('amenity', 'building'), pick('quarter', 'neighbourhood', 'hamlet'), pick('suburb', 'city_district', 'county', 'district'), city ? shortCity(city) : '']) {
      if (p && !parts.some((x) => x.toLowerCase() === p.toLowerCase())) parts.push(p);
    }
  }
  if (parts.length === 0 && typeof o.display_name === 'string') {
    parts.push(...o.display_name.split(',').map((x) => x.trim()).filter((x) => x && !/^\d{5,6}$/.test(x) && !/^(việt nam|vietnam)$/i.test(x)).slice(0, 4));
  }
  return parts.join(', ').replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** The address at a position, in Vietnamese; null when the service fails, is slow (8 s) or knows no address there. */
export async function reverseGeocode(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const url = `${NOMINATIM_REVERSE_URL}?format=jsonv2&addressdetails=1&zoom=18&accept-language=vi&lat=${lat}&lon=${lon}`;
  const inBrowser = typeof document !== 'undefined';
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'Accept-Language': 'vi', ...(inBrowser ? {} : { 'User-Agent': 'FitQuest/1.0 (cheat-day place search)' }) },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return null;
    const text = formatAddress(await res.json());
    return text || null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The position on OpenStreetMap (a marker at the spot), for "see it on the map". */
export const osmUrl = (lat: number, lon: number): string => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;

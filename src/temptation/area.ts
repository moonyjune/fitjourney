import { Platform } from 'react-native';
import { NOMINATIM_REVERSE_URL } from '../cookbook/geocode';
import { roundCoord } from '../../supabase/functions/_shared/temptShops';

// 1.7 "Khu vực của tôi" > "Dùng vị trí hiện tại": the browser's position (web only, low accuracy), rounded to 2 decimals (~1 km) at
// once, then turned into a district and a city with OpenStreetMap's Nominatim (free, no key; one request per tap, at district zoom, with
// the rounded position only). Never a street or house number. Any failure: the rounded position is still kept and the player types
// the district.

const TIMEOUT_MS = 8000;

/** "Thành phố Hồ Chí Minh" as "TP.HCM", "Thành phố Hà Nội" as "Hà Nội". */
export function shortCityName(name: string): string {
  if (/^(thành phố )?hồ chí minh$/i.test(name.trim())) return 'TP.HCM';
  return name.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
}

/** A Nominatim reverse answer as { district, city } (district / county level, the city or province); empty strings when unknown. */
export function areaFromNominatim(raw: unknown): { district: string; city: string } {
  const a = (raw && typeof raw === 'object' ? (raw as { address?: Record<string, unknown> }).address : null) ?? null;
  const pick = (...keys: string[]) => keys.map((k) => a?.[k]).find((v): v is string => typeof v === 'string' && v.trim() !== '')?.trim() ?? '';
  const clean = (s: string) => s.replace(/[<>\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const district = clean(pick('city_district', 'district', 'county', 'suburb', 'town'));
  const cityRaw = pick('city', 'state', 'province', 'municipality');
  const city = clean(cityRaw ? shortCityName(cityRaw) : '');
  return { district: district.toLowerCase() === city.toLowerCase() ? '' : district, city };
}

export type AreaLocate = { district: string; city: string; coords: { lat: number; lon: number } } | { error: 'unsupported' | 'denied' | 'unavailable' };

/** The rounded position and the area read from it; `district` / `city` empty when the reverse lookup failed. */
export async function locateArea(fetchImpl: typeof fetch = fetch): Promise<AreaLocate> {
  const geo = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo) return { error: 'unsupported' };
  const pos = await new Promise<{ lat: number; lon: number } | { error: 'denied' | 'unavailable' }>((resolve) =>
    geo.getCurrentPosition(
      (p) => resolve({ lat: roundCoord(p.coords.latitude), lon: roundCoord(p.coords.longitude) }),
      (err) => resolve({ error: err?.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 }
    )
  );
  if ('error' in pos) return pos;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(`${NOMINATIM_REVERSE_URL}?format=jsonv2&addressdetails=1&zoom=12&accept-language=vi&lat=${pos.lat}&lon=${pos.lon}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'vi' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const area = res.ok ? areaFromNominatim(await res.json()) : { district: '', city: '' };
    return { ...area, coords: pos };
  } catch {
    return { district: '', city: '', coords: pos };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

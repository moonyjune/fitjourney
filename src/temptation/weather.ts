import { Platform } from 'react-native';

// The weather for the Hard level, from Open-Meteo (free, no key). The place is the city typed in the settings (geocoded by Open-Meteo),
// or, on the web only, the browser's location when the user already granted it (never asked here). Anything failing gives null and
// the AI infers from the date and season instead.

const TIMEOUT_MS = 5000;

export interface Weather {
  tempC: number;
  summary: string;
}

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<any> }>;

async function getJson(fetchImpl: Fetch, url: string): Promise<any | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, controller ? { signal: controller.signal } : undefined);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** WMO weather code to a few Vietnamese words (for the prompt). */
export function weatherSummary(code: number): string {
  if (code === 0) return 'trời quang, nắng';
  if (code <= 3) return 'có mây';
  if (code === 45 || code === 48) return 'sương mù';
  if (code >= 51 && code <= 67) return 'mưa';
  if (code >= 71 && code <= 77) return 'tuyết';
  if (code >= 80 && code <= 82) return 'mưa rào';
  if (code >= 95) return 'giông bão';
  return '';
}

/** The browser's position, only when the permission was already granted (no prompt). */
async function grantedBrowserPosition(): Promise<{ lat: number; lon: number } | null> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.permissions || !navigator.geolocation) return null;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { timeout: TIMEOUT_MS, maximumAge: 30 * 60_000 }
      );
    });
  } catch {
    return null;
  }
}

export async function currentWeather(city: string, fetchImpl: Fetch = fetch as unknown as Fetch): Promise<Weather | null> {
  let place: { lat: number; lon: number } | null = null;
  const name = city.trim();
  if (name) {
    const geo = await getJson(fetchImpl, `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=vi&format=json`);
    const hit = geo?.results?.[0];
    if (typeof hit?.latitude === 'number' && typeof hit?.longitude === 'number') place = { lat: hit.latitude, lon: hit.longitude };
  }
  if (!place) place = await grantedBrowserPosition();
  if (!place) return null;
  const data = await getJson(
    fetchImpl,
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(3)}&longitude=${place.lon.toFixed(3)}&current=temperature_2m,weather_code&timezone=auto`
  );
  const tempC = data?.current?.temperature_2m;
  if (typeof tempC !== 'number' || !Number.isFinite(tempC)) return null;
  const code = data?.current?.weather_code;
  return { tempC: Math.round(tempC), summary: typeof code === 'number' ? weatherSummary(code) : '' };
}

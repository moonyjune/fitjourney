// Paste this whole block into the browser DevTools Console on the tab where you're logged in,
// then press Enter. It deletes ALL tracked data for 2026-09-20 (nutrition, workout, weight,
// proof photos) both on Supabase and in this browser's local storage, then reloads the page.
(async () => {
  const SUPABASE_URL = 'https://gngwfqgmhainhcfwzreq.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduZ3dmcWdtaGFpbmhjZnd6cmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MTQ5NDEsImV4cCI6MjEwNTM5MDk0MX0.3X71U5VcvS37krmNsZCrm2z1zF2gVE3VGiIo--R9J1g';
  const DATE_KEY = '2026-09-20';

  // Matches the app's own toDateKey() — local calendar date, not the raw UTC ISO string — so an
  // entry logged late at night still maps to the same day the UI shows it under.
  function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  let accessToken = null, userId = null;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      const parsed = JSON.parse(localStorage.getItem(key));
      accessToken = parsed.access_token;
      userId = parsed.user.id;
    }
  }
  if (!accessToken || !userId) {
    console.error('Không tìm thấy phiên đăng nhập trong localStorage. Hãy chắc chắn bạn đang đăng nhập trên tab này.');
    return;
  }

  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  async function del(table) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}&entry_date=eq.${DATE_KEY}`,
      { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
    );
    const body = await res.json().catch(() => []);
    console.log(`[remote] ${table}:`, res.status, Array.isArray(body) ? `${body.length} row(s) deleted` : body);
    return body;
  }

  // Proof photos: fetch first so we can also remove the underlying Storage files.
  const proofRows = await (await fetch(
    `${SUPABASE_URL}/rest/v1/proof_photos?user_id=eq.${userId}&entry_date=eq.${DATE_KEY}&select=photo_path`,
    { headers }
  )).json();
  for (const row of proofRows) {
    const storageRes = await fetch(`${SUPABASE_URL}/storage/v1/object/proofs/${row.photo_path}`, {
      method: 'DELETE',
      headers,
    });
    console.log('[storage] deleted', row.photo_path, storageRes.status);
  }

  await del('nutrition_logs');
  await del('workout_entries');
  await del('weight_entries');
  await del('proof_photos');

  // Local persisted Zustand state: strip the same date out of each store.
  function patchLocal(storeKey, patchFn) {
    const raw = localStorage.getItem(storeKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    patchFn(parsed.state);
    localStorage.setItem(storeKey, JSON.stringify(parsed));
    console.log(`[local] patched ${storeKey}`);
  }
  patchLocal('nutrition-store', (state) => {
    delete state.logs[DATE_KEY];
  });
  patchLocal('workout-store', (state) => {
    state.entries = state.entries.filter((e) => toDateKey(new Date(e.dateISO)) !== DATE_KEY);
  });
  patchLocal('weight-store', (state) => {
    state.entries = state.entries.filter((e) => toDateKey(new Date(e.dateISO)) !== DATE_KEY);
  });
  patchLocal('proof-store', (state) => {
    state.photos = state.photos.filter((p) => toDateKey(new Date(p.dateISO)) !== DATE_KEY);
  });

  console.log('Xong. Đang reload trang...');
  location.reload();
})();

// Shared bits for the proposal mockups: line icons (QuestIcon-like), status bar, tab bar, boss art.
const P = {
  camp: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/><path d="M4 21h16"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4-4"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9a4 4 0 0 1 6 0l-3 3"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0zM8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  sparkle: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  pin: '<path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a4 4 0 0 0 4 4M16 6h4a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  shield: '<path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z"/>',
  flame: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  ai: '<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M12 2v4M9 12h.01M15 12h.01M9 16h6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
};
function icon(name, extra) {
  return `<span class="ico" ${extra || ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg></span>`;
}
// Boss art: a round monster with horns, tinted per boss; `acc` adds a prop (straw cup, bowl, beer, cake).
function bossSvg(color, size, acc, mood) {
  const dark = '#110D22';
  const prop = {
    tea: `<rect x="70" y="58" width="22" height="30" rx="4" fill="#e9c9a0" stroke="${dark}" stroke-width="3"/><path d="M84 40 80 60" stroke="${dark}" stroke-width="4"/><circle cx="76" cy="80" r="2.5" fill="${dark}"/><circle cx="84" cy="76" r="2.5" fill="${dark}"/><circle cx="81" cy="84" r="2.5" fill="${dark}"/>`,
    beer: `<rect x="70" y="56" width="22" height="30" rx="3" fill="#ffc83d" stroke="${dark}" stroke-width="3"/><path d="M70 60h22" stroke="#fff" stroke-width="6"/><path d="M92 64h6v14h-6" fill="none" stroke="${dark}" stroke-width="3"/>`,
    cake: `<path d="M68 70h26v16H68z" fill="#ffd6e0" stroke="${dark}" stroke-width="3"/><path d="M68 70c4-6 22-6 26 0" fill="#fff" stroke="${dark}" stroke-width="3"/><circle cx="81" cy="62" r="3" fill="#ff5470"/>`,
    noodle: `<path d="M66 70h30a15 15 0 0 1-30 0z" fill="#ffe08a" stroke="${dark}" stroke-width="3"/><path d="M74 66c0-8 4-10 4-16M84 66c0-8 4-10 4-16" stroke="${dark}" stroke-width="3" fill="none"/>`,
    none: '',
  }[acc || 'none'];
  const mouth = mood === 'sad' ? `<path d="M40 70c4-5 16-5 20 0" stroke="${dark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
    : `<path d="M38 64c4 8 20 8 24 0" fill="${dark}"/><path d="M43 65l2 4 2-4M53 65l2 4 2-4" fill="#fff"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><ellipse cx="50" cy="92" rx="30" ry="5" fill="rgba(0,0,0,.35)"/>
  <path d="M24 30 18 10l18 12M76 30l6-20-18 12" fill="${color}" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M50 18c22 0 36 16 36 38 0 22-16 34-36 34S14 78 14 56c0-22 14-38 36-38z" fill="${color}" stroke="${dark}" stroke-width="3.5"/>
  <ellipse cx="38" cy="30" rx="10" ry="5" fill="rgba(255,255,255,.35)" transform="rotate(-20 38 30)"/>
  <path d="M30 46l12 4M70 46l-12 4" stroke="${dark}" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="38" cy="54" r="5" fill="${dark}"/><circle cx="62" cy="54" r="5" fill="${dark}"/><circle cx="39.5" cy="52.5" r="1.6" fill="#fff"/><circle cx="63.5" cy="52.5" r="1.6" fill="#fff"/>
  ${mouth}${prop}</svg>`;
}
function exSvg(kind, size) {
  const s = '#F4F1FF';
  const k = {
    squat: '<circle cx="34" cy="14" r="6"/><path d="M34 20l-4 16 14 2 2 18M30 36 18 40l-2 16M32 26l14 2"/>',
    pushup: '<circle cx="12" cy="30" r="6"/><path d="M18 32l38 8M24 33l0 14M56 40l4 8"/>',
    plank: '<circle cx="10" cy="34" r="6"/><path d="M16 36l40 6M18 38l2 12M56 42l4 8"/>',
    lunge: '<circle cx="32" cy="10" r="6"/><path d="M32 16l0 20M32 36l-14 8 0 12M32 36l14 4 4 16M32 22l10 8"/>',
    run: '<circle cx="38" cy="10" r="6"/><path d="M36 16l-6 18M30 34l10 8-4 14M30 34l-12 6M34 22l12 6M34 22l-12 2"/>',
    glute: '<circle cx="12" cy="44" r="6"/><path d="M18 46l20-10 10 14M38 36l14 4M20 50h38"/>',
  }[kind];
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="${s}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${k}</svg>`;
}
function statusBar(kind) {
  const tag = kind === 'after' ? '<span class="tag after">ĐỀ XUẤT</span>' : '<span class="tag before">HIỆN TẠI</span>';
  return `<div class="status"><span>9:41</span>${tag}<span class="row gap4 t12">▮▮▮ ◔ 82%</span></div>`;
}
function tabBar(active, labels) {
  const l = labels || ['Trại', 'Tập', 'Bản đồ', 'Hồ sơ'];
  const t = (i, ic) => `<div class="tab ${active === i ? 'on' : ''}">${icon(ic)}<span>${l[i]}</span></div>`;
  return `<div class="tabbar">${t(0, 'camp')}${t(1, 'dumbbell')}<div class="fab">${icon('plus')}</div>${t(2, 'map')}${t(3, 'user')}</div>`;
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i]').forEach((el) => { el.outerHTML = icon(el.dataset.i, el.getAttribute('style') ? `style="${el.getAttribute('style')}"` : ''); });
  document.querySelectorAll('[data-boss]').forEach((el) => { el.innerHTML = bossSvg(el.dataset.boss, +el.dataset.size || 64, el.dataset.acc, el.dataset.mood); });
  document.querySelectorAll('[data-ex]').forEach((el) => { el.innerHTML = exSvg(el.dataset.ex, +el.dataset.size || 48); });
  const sb = document.querySelector('[data-status]');
  if (sb) sb.outerHTML = statusBar(sb.dataset.status);
  const tb = document.querySelector('[data-tabbar]');
  if (tb) tb.outerHTML = tabBar(+tb.dataset.tabbar, tb.dataset.labels ? tb.dataset.labels.split(',') : undefined);
  document.querySelectorAll('[data-ring]').forEach((el) => {
    const [pct, color, size, w] = el.dataset.ring.split(',');
    const r = (+size - +w) / 2, c = 2 * Math.PI * r;
    el.insertAdjacentHTML('afterbegin', `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#2A2150" stroke-width="${w}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"/></svg>`);
  });
});

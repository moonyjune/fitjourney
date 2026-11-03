// Hand-drawn vector geometry for the 4 logo options (no generated images).
// Everything is drawn on a 1024 x 1024 grid. Each option has:
//   mark   detailed mark (splash / in-app >= 60 px)
//   small  simplified mark (favicon, in-app <= 40 px, and the app icon where it reads better)
//   box    [x, y, size] square that crops the mark (with a little air) for the transparent mark files
//   bg     the full-bleed icon background (+ extras that only belong to the icon)
//   iconMark  which mark the 1024 app icon uses ('mark' | 'small')
//   mono   single-colour silhouette (white, alpha only) for Android themed icons
//   droidBg  Android adaptive background layer
// `defs` holds the gradients/masks; ids are prefixed per option so several marks can be inlined in one page.

export const PAL = {
  bg: '#110D22', raised: '#241C44', raised2: '#2A2150', gold: '#FFC83D', goldLight: '#FFE08A',
  hp: '#FF5470', mana: '#4CC9F0', xp: '#8BFF6B', text: '#F4F1FF', textSecondary: '#B3AACF',
};

const f = (n) => +n.toFixed(1);

export function star(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 ? r : R;
    pts.push(`${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join(' L')} Z`;
}

export function hex(cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    pts.push(`${f(cx + R * Math.cos(a))} ${f(cy + R * Math.sin(a))}`);
  }
  return `M${pts.join(' L')} Z`;
}

const bgGlow = (p) => `<radialGradient id="${p}bgGlow" cx="50%" cy="46%" r="62%"><stop offset="0" stop-color="#3A2A62"/><stop offset=".6" stop-color="#1C1538"/><stop offset="1" stop-color="#110D22"/></radialGradient>`;

// ---------------------------------------------------------------- A: Lửa trại (campfire whose core is a road)
const A_FLAME = 'M512 150 C566 252 704 330 704 540 C704 684 618 772 512 772 C406 772 320 684 320 540 C320 450 364 390 408 348 C410 410 430 452 462 474 C450 372 468 250 512 150 Z';
// The bright core is a winding road that narrows as it climbs: the journey burning upwards.
const A_ROAD = 'M432 762 C392 676 446 616 490 562 C528 514 538 458 522 392 C574 444 600 508 570 572 C540 632 524 690 592 762 Z';
const A_ROAD_SMALL = 'M418 762 C376 670 434 610 482 556 C520 512 530 452 518 380 C584 440 614 510 580 578 C548 640 532 694 606 762 Z';
const A_ROAD_DASH = 'M496 724 L500 694 M528 616 L540 594';

function aLogs(p, small) {
  const h = small ? 92 : 74;
  const y = 800 - h / 2;
  const end = small ? '' : 1;
  return `<g>
   <g transform="rotate(12 512 800)"><rect x="296" y="${y}" width="432" height="${h}" rx="${h / 2}" fill="#7A4A2D"/>${end ? `<circle cx="333" cy="800" r="24" fill="#D9A06A"/><circle cx="333" cy="800" r="11" fill="#B0754A"/>` : ''}</g>
   <g transform="rotate(-12 512 800)"><rect x="296" y="${y}" width="432" height="${h}" rx="${h / 2}" fill="#8A5634"/>${end ? `<circle cx="691" cy="800" r="24" fill="#D9A06A"/><circle cx="691" cy="800" r="11" fill="#B0754A"/>` : ''}</g>
  </g>`;
}

const A = {
  id: 'A',
  name: 'Lửa trại',
  defs: (p) => `${bgGlow(p)}
   <linearGradient id="${p}flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF6A2B"/><stop offset=".5" stop-color="#FFA234"/><stop offset="1" stop-color="#FFC83D"/></linearGradient>
   <linearGradient id="${p}core" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#FFF6D6"/></linearGradient>
   <radialGradient id="${p}fire" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FF9A3C" stop-opacity=".42"/><stop offset="1" stop-color="#FF9A3C" stop-opacity="0"/></radialGradient>
   <clipPath id="${p}flameClip"><path d="${A_FLAME}"/></clipPath>
   <mask id="${p}mono" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><path d="${A_FLAME}" fill="#fff"/><path d="${A_ROAD_SMALL}" fill="#000"/></mask>`,
  mark: (p) => `${aLogs(p, false)}
   <path d="${A_FLAME}" fill="url(#${p}flame)"/>
   <g clip-path="url(#${p}flameClip)"><path d="${A_ROAD}" fill="url(#${p}core)"/><path d="${A_ROAD_DASH}" stroke="#FFB13B" stroke-width="14" stroke-linecap="round"/></g>
   <circle cx="690" cy="304" r="17" fill="#FFC83D"/><circle cx="742" cy="236" r="12" fill="#FFE08A"/><circle cx="778" cy="180" r="8" fill="#FFF6D6"/>`,
  small: (p) => `<g transform="translate(512 560) scale(1.08) translate(-512 -560)">${aLogs(p, true)}
   <path d="${A_FLAME}" fill="url(#${p}flame)"/>
   <g clip-path="url(#${p}flameClip)"><path d="${A_ROAD_SMALL}" fill="url(#${p}core)"/></g></g>`,
  box: [132, 132, 760],
  smallBox: [112, 124, 800],
  bg: (p) => `<rect width="1024" height="1024" fill="url(#${p}bgGlow)"/><circle cx="512" cy="590" r="420" fill="url(#${p}fire)"/>`,
  droidBg: (p) => `<rect width="1024" height="1024" fill="url(#${p}bgGlow)"/><circle cx="512" cy="560" r="360" fill="url(#${p}fire)"/>`,
  iconMark: 'mark',
  droidR: 400,
  mono: (p) => `<g transform="translate(512 560) scale(1.08) translate(-512 -560)"><rect width="1024" height="1024" fill="#fff" mask="url(#${p}mono)"/>
   <g fill="#fff"><g transform="rotate(12 512 800)"><rect x="296" y="754" width="432" height="92" rx="46"/></g><g transform="rotate(-12 512 800)"><rect x="296" y="754" width="432" height="92" rx="46"/></g></g></g>`,
  colors: ['#FF6A2B', '#FFA234', PAL.gold, PAL.goldLight, '#8A5634', PAL.bg],
};

// ---------------------------------------------------------------- B: Khiên làm gọn (shield + road + gem)
// Chosen direction: stays faithful to assets/splash-icon.png / FitJourneyLogo.tsx. The geometry below is the exact 96-grid
// geometry of FitJourneyLogo.tsx (shield, tapering S-road, dashes, gem); the variants only change weights:
//   mark  = the splash as-is (border 4.5, 4 dashes, two-tone gem)
//   icon  = app icon: border 5.5, 3 bolder dashes, gem x1.1, shield ~88% of the icon height
//   small = <= 40 px / favicon: border 7, road widened, no dashes, gem x1.22
const B_SHIELD = 'M48 5 L85 17.5 V50 C85 72.5 68.5 89 48 95 C27.5 89 11 72.5 11 50 V17.5 Z';
const B_ROAD =
  'M60.8 91.5 L60.2 91.2 L59.7 90.9 L59.2 90.6 L58.7 90.4 L58.3 90.2 L58.0 90.1 L57.6 89.9 L57.3 89.8 L56.9 89.6 L56.6 89.4 L56.3 89.2 L56.0 89.0 L55.7 88.7 L55.5 88.3 L55.2 87.9 L55.0 87.5 L54.8 86.9 L54.7 86.4 L54.6 85.7 L54.5 85.0 L54.5 84.3 L54.4 83.5 L54.5 82.7 L54.5 81.9 L54.6 81.0 L54.8 80.1 L54.9 79.2 L55.1 78.2 L55.3 77.2 L55.5 76.2 L55.7 75.2 L55.9 74.2 L56.2 73.2 L56.4 72.1 L56.6 71.0 L56.8 69.9 L57.0 68.9 L57.2 67.7 L57.4 66.6 L57.5 65.5 L57.6 64.4 L57.7 63.3 L57.7 62.1 L57.7 61.0 L57.7 59.8 L57.6 58.7 L57.4 57.6 L57.1 56.5 L56.8 55.4 L56.5 54.3 L56.0 53.2 L55.5 52.2 L54.9 51.2 L54.3 50.2 L53.6 49.3 L52.8 48.4 L52.0 47.5 L51.1 46.6 L50.1 45.7 L49.1 44.9 L46.9 47.1 L47.6 48.1 L48.1 49.0 L48.6 49.9 L49.0 50.8 L49.3 51.6 L49.5 52.5 L49.6 53.3 L49.6 54.0 L49.6 54.8 L49.5 55.5 L49.4 56.1 L49.2 56.8 L49.0 57.4 L48.8 58.0 L48.5 58.7 L48.1 59.3 L47.8 59.9 L47.4 60.5 L46.9 61.1 L46.5 61.7 L46.0 62.4 L45.5 63.0 L44.9 63.7 L44.4 64.4 L43.8 65.0 L43.2 65.8 L42.5 66.5 L41.9 67.2 L41.2 68.0 L40.5 68.8 L39.8 69.6 L39.1 70.4 L38.4 71.3 L37.7 72.2 L37.0 73.1 L36.3 74.1 L35.6 75.1 L34.9 76.1 L34.2 77.2 L33.5 78.4 L32.9 79.6 L32.2 80.9 L31.7 82.2 L31.1 83.6 L30.6 85.1 L30.2 86.6 L29.9 88.2 L29.6 89.9 L29.5 91.7 L29.4 93.5 L29.4 95.3 L29.6 97.2 L29.9 99.1 L30.3 101.1 L30.8 103.0 L31.4 104.9 L32.2 106.9 L33.1 108.8 L34.1 110.6 L35.2 112.5 Z';
const B_DASHES = [
  ['M42.8 88.3 L42.9 87.2 L43.0 86.1 L43.2 85.0 L43.4 84.0 L43.6 82.9 L43.9 81.9', 2.6],
  ['M46.1 76.3 L46.6 75.4 L47.0 74.5 L47.5 73.6 L47.9 72.7 L48.4 71.8 L48.8 70.9', 2.0],
  ['M51.1 66.1 L51.3 65.4 L51.6 64.7 L51.9 64.0 L52.1 63.3 L52.3 62.6 L52.5 61.9', 1.5],
  ['M53.2 57.7 L53.2 57.1 L53.2 56.6 L53.2 56.1 L53.1 55.6 L53.0 55.0 L52.9 54.5', 1.1],
];
const B_GEM = 'M48 16 L56.5 27 L48 41 L39.5 27 Z';
const B_GEM_TOP = 'M48 16 L56.5 27 L48 30 L39.5 27 Z';
/** 96-grid content centred on the 1024 canvas (grid point 48,50 -> 512,512) at k px per grid unit. */
const g96 = (k, body) => `<g transform="translate(${+(512 - 48 * k).toFixed(2)} ${+(512 - 50 * k).toFixed(2)}) scale(${k})">${body}</g>`;
const gem = (s, light = '#FFE08A', top = '#FFF3C4') =>
  `<g transform="translate(48 28.5) scale(${s}) translate(-48 -28.5)"><path d="${B_GEM}" fill="${light}"/>${top ? `<path d="${B_GEM_TOP}" fill="${top}"/>` : ''}</g>`;
function bShield(p, { border, dashes, gemScale, widen }) {
  return `<path d="${B_SHIELD}" fill="#2A2150"/>
   <g clip-path="url(#${p}sh)"><path d="${B_ROAD}" fill="#FFC83D"${widen ? ` stroke="#FFC83D" stroke-width="${widen}" stroke-linejoin="round"` : ''}/>
    ${dashes.map(([d, w]) => `<path d="${d}" fill="none" stroke="#2A2150" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</g>
   <path d="${B_SHIELD}" fill="none" stroke="#FFC83D" stroke-width="${border}" stroke-linejoin="round"/>
   ${gem(gemScale)}`;
}
const B_MARK = { border: 4.5, dashes: B_DASHES, gemScale: 1 };
const B_ICON = { border: 5.5, dashes: [[B_DASHES[0][0], 3.0], [B_DASHES[1][0], 2.6], [B_DASHES[2][0], 2.1]], gemScale: 1.1, widen: 0.8 };
const B_SMALL = { border: 7, dashes: [], gemScale: 1.22, widen: 1.8 };
const B = {
  id: 'B',
  name: 'Khiên làm gọn',
  defs: (p) => `<radialGradient id="${p}bgGlow" cx="50%" cy="48%" r="68%"><stop offset="0" stop-color="#2C2140"/><stop offset=".55" stop-color="#1B1530"/><stop offset="1" stop-color="#110D22"/></radialGradient>
   <clipPath id="${p}sh"><path d="${B_SHIELD}"/></clipPath>`,
  mark: (p) => g96(10, bShield(p, B_MARK)),
  small: (p) => g96(10, bShield(p, B_SMALL)),
  icon: (p) => g96(9.4, bShield(p, B_ICON)),
  // Android: the shield's shoulder corners are the farthest points (~52.5 grid units from the centre) -> 313 / 52.5 = 5.95 px per unit.
  droidFg: (p) => g96(5.95, bShield(p, B_ICON)),
  monoFull: (p) => g96(5.95, `<g clip-path="url(#${p}sh)"><path d="${B_ROAD}" fill="#fff" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></g>
   <path d="${B_SHIELD}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>${gem(1.22, '#fff', '')}`),
  box: [32, 32, 960],
  smallBox: [20, 20, 984],
  bg: (p) => `<rect width="1024" height="1024" fill="url(#${p}bgGlow)"/>`,
  droidBg: (p) => `<rect width="1024" height="1024" fill="url(#${p}bgGlow)"/>`,
  iconMark: 'small',
  droidR: 525,
  mono: (p) => '',
  colors: [PAL.raised2, PAL.gold, PAL.goldLight, '#FFF3C4', '#2C2140', PAL.bg],
};
// ---------------------------------------------------------------- C: Đỉnh núi (summit + trail + flag)
const C_MTN = 'M104 872 L512 296 L920 872 Z';
const C_SNOW = 'M512 296 L594 412 L556 398 L512 438 L468 398 L430 412 Z';
const C_TRAIL = 'M440 872 C650 812 664 724 558 672 C450 618 428 556 520 500 C580 462 568 432 524 414';
const C_TRAIL_SMALL = 'M430 872 C690 800 640 650 520 610 C420 576 452 484 512 444';
const C = {
  id: 'C',
  name: 'Đỉnh núi',
  defs: (p) => `<linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E2458"/><stop offset="1" stop-color="#110D22"/></linearGradient>
   <linearGradient id="${p}mtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E5CC0"/><stop offset="1" stop-color="#3A2E72"/></linearGradient>
   <mask id="${p}moon" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><circle cx="812" cy="214" r="62" fill="#fff"/><circle cx="840" cy="196" r="56" fill="#000"/></mask>
   <mask id="${p}mono" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024"><path d="${C_MTN}" fill="#fff"/>
    <path d="${C_TRAIL_SMALL}" fill="none" stroke="#000" stroke-width="64" stroke-linecap="round"/></mask>`,
  mark: (p) => `<path d="${C_MTN}" fill="url(#${p}mtn)"/>
   <path d="M512 296 L920 872 H700 Z" fill="#000" opacity=".16"/>
   <path d="${C_SNOW}" fill="#F4F1FF"/>
   <path d="${C_TRAIL}" fill="none" stroke="#FFC83D" stroke-width="40" stroke-linecap="round" stroke-dasharray="58 38"/>
   <rect x="503" y="150" width="18" height="160" rx="9" fill="#FFC83D"/>
   <path d="M521 158 L684 204 L521 252 Z" fill="#FF5470"/>`,
  small: (p) => `<path d="${C_MTN}" fill="url(#${p}mtn)"/>
   <path d="M512 296 L594 412 L548 396 L512 430 L476 396 L430 412 Z" fill="#F4F1FF"/>
   <path d="${C_TRAIL_SMALL}" fill="none" stroke="#FFC83D" stroke-width="58" stroke-linecap="round"/>
   <rect x="498" y="120" width="28" height="186" rx="14" fill="#FFC83D"/>
   <path d="M524 128 L734 196 L524 266 Z" fill="#FF5470"/>`,
  box: [112, 111, 800],
  smallBox: [100, 96, 824],
  bg: (p) => `<rect width="1024" height="1024" fill="url(#${p}sky)"/>
   <rect width="1024" height="1024" fill="#FFE08A" mask="url(#${p}moon)"/>
   <circle cx="210" cy="220" r="9" fill="#F4F1FF"/><circle cx="330" cy="140" r="6" fill="#F4F1FF" opacity=".8"/><circle cx="700" cy="110" r="7" fill="#F4F1FF" opacity=".8"/>
   <path d="M-40 940 L250 600 L560 940 Z" fill="#241C44"/>`,
  iconFg: (p) => `<rect y="868" width="1024" height="156" fill="#110D22"/>`,
  droidBg: (p) => `<rect width="1024" height="1024" fill="url(#${p}sky)"/>`,
  iconMark: 'small',
  droidR: 500,
  mono: (p) => `<rect width="1024" height="1024" fill="#fff" mask="url(#${p}mono)"/>
   <g fill="#fff"><rect x="498" y="120" width="28" height="186" rx="14"/><path d="M524 128 L734 196 L524 266 Z"/></g>`,
  colors: ['#6E5CC0', '#3A2E72', PAL.gold, PAL.hp, PAL.text, PAL.goldLight, PAL.bg],
};

// ---------------------------------------------------------------- D: Huy hiệu cấp (level badge: F + falling trend to a star)
const D_HEX = hex(512, 512, 392);
const D_F = 'M322 268 H636 V364 H420 V462 H590 V556 H420 V748 H322 Z';
const D_TREND = 'M474 616 L560 680 L612 640 L676 690';
const D_STAR = star(722, 700, 62, 27);
const D_TREND_SMALL = 'M480 626 L578 704 L640 668';
const D_STAR_SMALL = star(712, 690, 84, 37);
const D = {
  id: 'D',
  name: 'Huy hiệu cấp',
  defs: (p) => `${bgGlow(p)}
   <linearGradient id="${p}gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#FFB627"/></linearGradient>`,
  mark: (p) => `<path d="${D_HEX}" fill="#2A2150" stroke="#FFC83D" stroke-width="48" stroke-linejoin="round"/>
   <path d="${hex(512, 512, 326)}" fill="none" stroke="#4A3C86" stroke-width="10" stroke-linejoin="round"/>
   <path d="${D_F}" fill="url(#${p}gold)" stroke="url(#${p}gold)" stroke-width="16" stroke-linejoin="round"/>
   <path d="${D_TREND}" fill="none" stroke="#8BFF6B" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="${D_STAR}" fill="#8BFF6B" stroke="#8BFF6B" stroke-width="14" stroke-linejoin="round"/>`,
  small: (p) => `<path d="${D_HEX}" fill="#2A2150" stroke="#FFC83D" stroke-width="64" stroke-linejoin="round"/>
   <path d="M306 254 H650 V370 H430 V462 H600 V566 H430 V760 H306 Z" fill="url(#${p}gold)" stroke="url(#${p}gold)" stroke-width="16" stroke-linejoin="round"/>
   <path d="${D_TREND_SMALL}" fill="none" stroke="#8BFF6B" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="${D_STAR_SMALL}" fill="#8BFF6B" stroke="#8BFF6B" stroke-width="16" stroke-linejoin="round"/>`,
  box: [96, 96, 832],
  smallBox: [86, 86, 852],
  bg: (p) => `<rect width="1024" height="1024" fill="url(#${p}bgGlow)"/>`,
  droidBg: (p) => `<rect width="1024" height="1024" fill="url(#${p}bgGlow)"/>`,
  iconMark: 'mark',
  droidR: 445,
  mono: (p) => `<g fill="#fff"><path d="${D_HEX}" fill="none" stroke="#fff" stroke-width="64" stroke-linejoin="round"/>
   <path d="M306 254 H650 V370 H430 V462 H600 V566 H430 V760 H306 Z" stroke="#fff" stroke-width="16" stroke-linejoin="round"/>
   <path d="${D_TREND_SMALL}" fill="none" stroke="#fff" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="${D_STAR_SMALL}" stroke="#fff" stroke-width="16" stroke-linejoin="round"/></g>`,
  colors: [PAL.raised2, PAL.gold, PAL.goldLight, '#FFB627', PAL.xp, PAL.bg],
};

export const OPTIONS = [A, B, C, D];

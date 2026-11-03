// node Design/logo-proposal/build-pages.mjs  ->  options/<X>.html (kit page per option) + board.html
// Strings copied from the app: intro.tagline / intro.loading (src/game/strings.ts), auth.title / auth.subtitleSignIn (src/i18n/strings.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPTIONS, PAL } from './marks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'options'), { recursive: true });

const VERSION = 'v0.27.1';
const TAGLINE = 'Mỗi ngày một nhiệm vụ. Mỗi tuần một boss. Một hành trình giảm cân bền vững.';
const LOADING = 'Đang vào trại';
const AUTH_TITLE = 'FitJourney';
const AUTH_SUB = 'Đăng nhập để đồng bộ dữ liệu của bạn.';

const TEXT = {
  A: {
    title: 'Lửa trại',
    idea: 'Ngọn lửa trại = đốt calo mỗi ngày, chuỗi 🔥 và tab "Trại". Lõi sáng của ngọn lửa là một <b>con đường uốn lượn thu nhỏ dần lên đỉnh</b>: hành trình giảm cân "cháy" đều từng ngày. Ba tàn lửa bay chéo lên như những bước tiến.',
    changed: ['Lõi lửa đổi từ giọt tròn thành con đường (nối với ý "hành trình" của logo cũ)', 'Củi phẳng màu, có mặt cắt gỗ ở hai đầu; bỏ viền nâu đậm', 'Tàn lửa xếp thành vệt bay lên thay vì rải rác', 'Bản nhỏ: bỏ tàn lửa và mặt cắt, củi dày hơn, con đường to hơn'],
    pros: ['Hình khối đơn giản nhất, đọc được cả ở 16 px', 'Màu cam ấm nổi bật giữa các icon xanh / trắng trên Màn hình chính', 'Gắn trực tiếp với "đốt calo", chuỗi ngày và Trại'],
    cons: ['Con đường trong lõi lửa chỉ thấy rõ từ ~60 px; nhỏ hơn thì chỉ còn là ngọn lửa', 'Lửa là hình phổ biến (nhiều app thể thao / streak dùng)'],
  },
  B: {
    title: 'Khiên làm gọn',
    chosen: true,
    idea: 'Giữ đúng hình của màn khởi động (assets/splash-icon.png, FitJourneyLogo.tsx): <b>chiếc khiên</b> (bảo vệ sức khoẻ, chất RPG), <b>con đường</b> uốn lên thu nhỏ dần và <b>viên ngọc</b> mục tiêu ở cuối đường. Cùng tỉ lệ, cùng màu; chỉ đổi độ đậm nét theo cỡ hiển thị.',
    changed: ['Hình học lấy nguyên từ FitJourneyLogo.tsx (lưới 96): khiên, đường, ngọc không đổi tỉ lệ', 'Icon app: khiên to hơn (~88% chiều cao, bản 0.27.1 ~80%), viền 5.5 thay 4.5, đường đậm hơn, 3 vạch đứt to thay 4 vạch mảnh, ngọc ×1.1', 'Bản nhỏ (≤ 40 px, favicon): viền 7, đường to, bỏ vạch đứt, ngọc ×1.22 — ở 16 px vẫn thấy khiên + đường + ngọc', 'Bản splash (mark) giữ nguyên như hiện tại'],
    pros: ['Đổi ít nhất: người dùng hiện tại vẫn nhận ra, splash không đổi', 'Ở 29 px vẫn thấy khiên + đường + ngọc', 'Hợp phong cách huy hiệu RPG của app'],
    cons: ['Vẫn 3 thành phần, kém "một nét nhìn là nhớ" hơn A / D', 'Khiên vàng trên nền tím giống nhiều icon game / bảo mật'],
  },
  C: {
    title: 'Đỉnh núi',
    idea: 'Ngọn núi đêm, <b>con đường vàng</b> uốn từ chân núi lên đỉnh có <b>cờ đỏ</b>: hành trình tới cân nặng mục tiêu (mốc "Đích"). Trăng và sao chỉ có ở icon lớn để tạo không khí trại đêm.',
    changed: ['Bỏ núi phụ khỏi logo (chỉ còn bóng mờ ở nền icon)', 'Núi sáng hơn (#6E5CC0) để tách khỏi nền trời', 'Icon và bản nhỏ dùng đường liền, dày 58; bản lớn giữ nét đứt dày 40', 'Cờ to gần gấp đôi, cột cờ dày'],
    pros: ['Kể chuyện "hành trình tới đích" rõ nhất', 'Hợp tab Hành trình, mốc cân nặng và boss tuần', 'Cờ đỏ là điểm nhấn dễ nhận ra'],
    cons: ['Vẫn là một "cảnh" nhiều lớp: ở 16–29 px chỉ còn tam giác + cờ', 'Hình núi + cờ khá phổ biến (app leo núi, mục tiêu)'],
  },
  D: {
    title: 'Huy hiệu cấp',
    idea: 'Huy hiệu lục giác như phần thưởng lên cấp, <b>chữ F</b> đậm vuông vức (FitJourney). Mũi tên cũ được thay bằng <b>đường xu hướng đi xuống kết thúc bằng ngôi sao</b>: cân nặng giảm dần và chạm mục tiêu, như biểu đồ cân của app.',
    changed: ['Chữ F vẽ lại bằng khối vuông: thân, gạch trên dài, gạch giữa ngắn — không còn đọc nhầm thành Γ', 'Bỏ mũi tên "↘" (dễ hiểu là mất điểm) → đường xu hướng + ngôi sao XP', 'Bỏ 3 chấm cấp cho gọn', 'Bản nhỏ: F to hơn, đường 2 đoạn, ngôi sao lớn'],
    pros: ['Gọn và "ra dáng thương hiệu" nhất, chữ F dễ nhớ', 'Hợp hệ thống huy hiệu / cấp độ trong app', 'Đơn sắc (Android themed) rất rõ'],
    cons: ['Ngôi sao + đường xu hướng chỉ rõ từ ~40 px', 'Chữ cái trong khung là kiểu logo phổ biến, ít "câu chuyện" hơn C'],
  },
};

const FONT = '<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=swap" rel="stylesheet">';
const CSS = `
:root { --bg:#110D22; --r1:#241C44; --r2:#2A2150; --gold:#FFC83D; --goldL:#FFE08A; --t:#F4F1FF; --t2:#B3AACF; --line:#3A3270; }
* { box-sizing:border-box; }
body { margin:0; background:#0B0818; color:var(--t); font:15px/1.45 "Chakra Petch",-apple-system,sans-serif; padding:36px 44px 56px; }
a { color:var(--goldL); }
h1 { margin:0 0 4px; font-size:34px; } h1 b { color:var(--gold); margin-right:10px; }
h2 { margin:0 0 14px; font-size:19px; letter-spacing:.3px; } h2 small { color:var(--t2); font-weight:500; font-size:13px; margin-left:8px; }
.sub { color:var(--t2); margin-bottom:24px; }
.sec { background:var(--r1); border:1px solid var(--line); border-radius:22px; padding:24px 26px; margin-bottom:22px; }
.row { display:flex; gap:28px; align-items:flex-start; flex-wrap:wrap; }
.ios { border-radius:22.37%; display:block; }
.lbl { color:var(--t2); font-size:12px; text-align:center; margin-top:6px; }
.sizes { display:flex; align-items:flex-end; gap:22px; flex-wrap:wrap; }
.cell { display:flex; flex-direction:column; align-items:center; }
.zoom canvas { image-rendering:pixelated; border-radius:4px; }
ul { margin:6px 0 0; padding-left:18px; } li { margin:3px 0; }
.k { color:var(--t2); font-size:13px; text-transform:uppercase; letter-spacing:1.2px; margin:14px 0 4px; }
.sw { display:flex; gap:10px; flex-wrap:wrap; margin-top:6px; } .sw div { font-size:12px; color:var(--t2); text-align:center; } .sw i { display:block; width:58px; height:38px; border-radius:8px; border:1px solid #ffffff22; margin-bottom:4px; }
.home { width:390px; height:500px; border-radius:40px; padding:54px 22px 0; position:relative; overflow:hidden; font-family:-apple-system,"SF Pro Text",sans-serif; }
.home.dark { background:linear-gradient(165deg,#24305a,#0d1124 70%); } .home.light { background:linear-gradient(165deg,#f8dcc8,#bccbf0); }
.home .grid { display:grid; grid-template-columns:repeat(4,60px); justify-content:space-between; row-gap:22px; }
.home .app { width:60px; text-align:center; font-size:11px; } .home.dark .app { color:#fff; } .home.light .app { color:#1b1b1f; }
.home .app span { display:block; margin-top:5px; white-space:nowrap; }
.home .ph { width:60px; height:60px; border-radius:22.37%; }
.home .dock { position:absolute; left:14px; right:14px; bottom:14px; height:92px; border-radius:32px; display:grid; grid-template-columns:repeat(4,60px); justify-content:space-around; align-items:center; }
.home.dark .dock { background:#ffffff26; } .home.light .dock { background:#ffffff66; }
.home .time { position:absolute; top:16px; left:44px; font-weight:600; font-size:16px; } .home.dark .time { color:#fff; } .home.light .time { color:#111; }
.droid { position:relative; overflow:hidden; }
.droid img { position:absolute; }
.phone { width:390px; height:844px; border-radius:52px; background:var(--bg); border:10px solid #2c2840; position:relative; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:space-between; padding:56px 0; }
.intro-c { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; }
.shieldWrap { width:251px; height:251px; position:relative; display:flex; align-items:center; justify-content:center; }
.glow { position:absolute; width:317px; height:317px; left:-33px; top:-33px; background:radial-gradient(circle, rgba(255,200,61,.34) 0%, rgba(255,200,61,.10) 55%, rgba(255,200,61,0) 100%); border-radius:50%; }
.vt { font-weight:500; font-size:11px; color:var(--t2); letter-spacing:1.2px; text-align:center; }
.nm { font-weight:700; font-size:34px; letter-spacing:4px; text-align:center; }
.tg { font-weight:500; font-size:13px; color:var(--t2); line-height:19px; text-align:center; padding:0 32px; margin-top:8px; }
.foot { display:flex; flex-direction:column; align-items:center; gap:10px; }
.eb { font-weight:700; font-size:11px; color:var(--t2); letter-spacing:1.6px; }
.track { width:220px; height:8px; border-radius:4px; background:var(--r1); overflow:hidden; } .track i { display:block; width:68%; height:8px; border-radius:4px; background:var(--gold); }
.auth { width:390px; background:var(--bg); border-radius:28px; border:10px solid #2c2840; padding:36px 24px 30px; display:flex; flex-direction:column; align-items:center; gap:8px; }
.auth .tt { font-weight:700; font-size:26px; } .auth .st { font-weight:500; font-size:14px; color:var(--t2); }
.auth .seg { margin-top:16px; width:100%; height:44px; border-radius:12px; background:var(--r1); display:grid; grid-template-columns:1fr 1fr; padding:4px; font-weight:600; font-size:14px; } .auth .seg div { display:flex; align-items:center; justify-content:center; border-radius:9px; color:var(--t2); } .auth .seg .on { background:var(--r2); color:var(--t); }
.lock { display:flex; align-items:center; gap:18px; padding:26px 30px; border-radius:18px; }
.lock .w { font-weight:700; letter-spacing:.5px; } .lock .w em { font-style:normal; color:var(--gold); }
.lock.light { background:#F4F1FF; } .lock.light .w { color:#1C1538; } .lock.light .w em { color:#C8901A; }
.lock.dark { background:var(--bg); }
.files { font-family:ui-monospace,Menlo,monospace; font-size:13px; color:var(--t2); }
`;

// Canvas helpers: draw an SVG at its true pixel size (optionally through the iOS rounded mask, or tinted for the
// Android themed icon), then show it enlarged with hard pixels so the real-size rendering can be judged.
const SCRIPT = `<script>
function load(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});}
function rr(c,s,rad){c.beginPath();c.moveTo(rad,0);c.arcTo(s,0,s,s,rad);c.arcTo(s,s,0,s,rad);c.arcTo(0,s,0,0,rad);c.arcTo(0,0,s,0,rad);c.closePath();}
(async()=>{for(const cv of document.querySelectorAll('canvas[data-src]')){
 const s=+cv.dataset.size, z=+(cv.dataset.zoom||1), img=await load(cv.dataset.src);
 cv.width=s;cv.height=s;cv.style.width=s*z+'px';cv.style.height=s*z+'px';const c=cv.getContext('2d');
 if(cv.dataset.tint){c.fillStyle=cv.dataset.bgc;c.beginPath();c.arc(s/2,s/2,s/2,0,7);c.fill();
  const o=document.createElement('canvas');o.width=s*1.5;o.height=s*1.5;const oc=o.getContext('2d');oc.drawImage(img,0,0,s*1.5,s*1.5);
  oc.globalCompositeOperation='source-in';oc.fillStyle=cv.dataset.tint;oc.fillRect(0,0,s*1.5,s*1.5);c.save();c.beginPath();c.arc(s/2,s/2,s/2,0,7);c.clip();c.drawImage(o,-s/4,-s/4);c.restore();continue;}
 if(cv.dataset.round){c.save();rr(c,s,s*0.2237);c.clip();}
 c.drawImage(img,0,0,s,s);}
 document.body.dataset.ready=1;})();
</script>`;

const sv = (x, kind) => `../svg/${x}-${kind}.svg`;
const ios = (src, s) => `<img class="ios" src="${src}" width="${s}" height="${s}">`;
const cv = (src, s, zoom, extra = '') => `<canvas data-src="${src}" data-size="${s}" data-zoom="${zoom}" ${extra}></canvas>`;

const PH = [['#34C759', 'Tin nhắn'], ['#0A84FF', 'Thời tiết'], ['#FF9F0A', 'Ghi chú'], ['#5E5CE6', 'Podcast'], ['#FF375F', 'Nhạc'], [null], ['#30D158', 'Bản đồ'], ['#64D2FF', 'Tệp'], ['#FFD60A', 'Lịch'], ['#BF5AF2', 'Ảnh'], ['#8E8E93', 'Cài đặt'], ['#FF453A', 'Sức khoẻ']];
function home(x, cls) {
  const apps = PH.map(([c, n]) => (c ? `<div class="app"><div class="ph" style="background:${c}"></div><span>${n}</span></div>` : `<div class="app">${ios(sv(x, 'icon'), 60)}<span>FitJourney</span></div>`)).join('');
  const dock = ['#34C759', '#0A84FF', '#FF9F0A', '#5E5CE6'].map((c) => `<div class="ph" style="background:${c}"></div>`).join('');
  return `<div class="home ${cls}"><div class="time">9:41</div><div class="grid">${apps}</div><div class="dock">${dock}</div></div>`;
}

function droid(x, size, radius) {
  const L = size * 1.5;
  const o = -size * 0.25;
  return `<div class="droid" style="width:${size}px;height:${size}px;border-radius:${radius}">
   <img src="${sv(x, 'android-background')}" width="${L}" height="${L}" style="left:${o}px;top:${o}px">
   <img src="${sv(x, 'android-foreground')}" width="${L}" height="${L}" style="left:${o}px;top:${o}px"></div>`;
}

function safeZone(x) {
  // the full 108 dp layer with the 72 dp viewport (square) and the 66 dp safe circle drawn on top
  const S = 216;
  return `<div style="position:relative;width:${S}px;height:${S}px;background:#00000040;border-radius:8px">
   <img src="${sv(x, 'android-background')}" width="${S}" style="position:absolute;opacity:.55">
   <img src="${sv(x, 'android-foreground')}" width="${S}" style="position:absolute">
   <div style="position:absolute;left:${S / 6}px;top:${S / 6}px;width:${(S * 2) / 3}px;height:${(S * 2) / 3}px;border:1px dashed #ffffff88"></div>
   <div style="position:absolute;left:${(S * 21) / 108}px;top:${(S * 21) / 108}px;width:${(S * 66) / 108}px;height:${(S * 66) / 108}px;border:1.5px dashed #8BFF6B;border-radius:50%"></div></div>`;
}

const swatch = (c) => `<div><i style="background:${c}"></i>${c}</div>`;

function kit(o) {
  const x = o.id;
  const t = TEXT[x];
  const big = [180, 120, 87, 60, 40, 29];
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Logo ${x} · ${t.title}</title>${FONT}<style>${CSS} body{width:1500px}</style></head><body>
<h1><b>${x}</b>${t.title}${t.chosen ? ' <span style="font-size:15px;color:#110D22;background:var(--gold);border-radius:8px;padding:3px 10px;vertical-align:middle">ĐÃ CHỌN</span>' : ''}</h1>
<div class="sub">Bộ logo đầy đủ · vẽ vector tay · <a href="../board.html">← về bảng so sánh</a> · file gốc trong <span class="files">Design/logo-proposal/svg/${x}-*.svg</span></div>

<div class="sec"><div class="row">
 <div>${ios(sv(x, 'icon'), 360)}<div class="lbl">${x}-icon.svg · 1024 tràn viền (iOS tự bo góc)</div></div>
 <div style="flex:1;min-width:520px">
  <div class="k" style="margin-top:0">Ý nghĩa</div><div>${t.idea}</div>
  <div class="k">Đã sửa so với bảng đầu</div><ul>${t.changed.map((s) => `<li>${s}</li>`).join('')}</ul>
  <div class="row" style="gap:40px">
   <div><div class="k">Ưu</div><ul>${t.pros.map((s) => `<li>${s}</li>`).join('')}</ul></div>
   <div><div class="k">Nhược</div><ul style="color:var(--t2)">${t.cons.map((s) => `<li>${s}</li>`).join('')}</ul></div>
  </div>
  <div class="k">Màu dùng</div><div class="sw">${o.colors.map(swatch).join('')}</div>
 </div>
 <div style="display:flex;flex-direction:column;gap:14px;align-items:center">
  <div style="background:var(--bg);border-radius:16px;padding:14px"><img src="${sv(x, 'mark')}" width="150" height="150"></div><div class="lbl" style="margin-top:-8px">${x}-mark.svg (nền trong)</div>
  <div style="background:var(--bg);border-radius:16px;padding:14px"><img src="${sv(x, 'mark-small')}" width="96" height="96"></div><div class="lbl" style="margin-top:-8px">${x}-mark-small.svg</div>
 </div>
</div></div>

<div class="sec"><h2>Cỡ thật <small>vẽ từ SVG đúng số điểm ảnh (1×), không thu nhỏ ảnh lớn · iOS chỉ nhận 1 file 1024 rồi tự thu nhỏ, nên icon phải tự rõ ở 29 px</small></h2>
 <div class="sizes">${big.map((s) => `<div class="cell">${cv(sv(x, 'icon'), s, 1, 'data-round="1"')}<div class="lbl">${s}${s === 180 ? ' · iPhone' : s === 87 ? ' · Cài đặt @3x' : s === 29 ? ' · Cài đặt @1x' : ''}</div></div>`).join('')}
  <div class="cell" style="margin-left:24px">${cv(sv(x, 'favicon'), 32, 1)}<div class="lbl">favicon 32</div></div>
  <div class="cell">${cv(sv(x, 'favicon'), 16, 1)}<div class="lbl">16</div></div>
  <div class="cell" style="margin-left:24px;background:var(--bg);padding:10px;border-radius:10px">${cv(sv(x, 'mark-small'), 40, 1)}<div class="lbl">mark-small 40</div></div>
  <div class="cell" style="background:var(--bg);padding:10px;border-radius:10px">${cv(sv(x, 'mark-small'), 24, 1)}<div class="lbl">24</div></div>
 </div>
 <div class="k" style="margin-top:22px">Phóng to 5× để soi điểm ảnh (vẫn là bản vẽ ở cỡ thật)</div>
 <div class="sizes zoom">
  <div class="cell">${cv(sv(x, 'icon'), 29, 5, 'data-round="1"')}<div class="lbl">icon 29</div></div>
  <div class="cell">${cv(sv(x, 'icon'), 40, 5, 'data-round="1"')}<div class="lbl">icon 40</div></div>
  <div class="cell">${cv(sv(x, 'favicon'), 16, 5)}<div class="lbl">favicon 16</div></div>
  <div class="cell">${cv(sv(x, 'favicon'), 32, 5)}<div class="lbl">favicon 32</div></div>
 </div>
</div>

<div class="sec"><h2>Màn hình chính iPhone <small>icon 60 pt, cạnh các app giả (ô màu)</small></h2>
 <div class="row">${home(x, 'dark')}${home(x, 'light')}</div></div>

<div class="sec"><h2>Android adaptive <small>nền + tiền cảnh 108 dp, logo nằm trong vùng an toàn 66 dp (vòng xanh)</small></h2>
 <div class="row" style="align-items:flex-end">
  <div class="cell">${safeZone(x)}<div class="lbl">lớp 108 dp · khung 72 dp · vùng an toàn 66 dp</div></div>
  <div class="cell">${droid(x, 132, '50%')}<div class="lbl">hình tròn</div></div>
  <div class="cell">${droid(x, 132, '34%')}<div class="lbl">squircle</div></div>
  <div class="cell">${droid(x, 132, '50% 50% 50% 14%')}<div class="lbl">giọt nước</div></div>
  <div class="cell">${droid(x, 48, '50%')}<div class="lbl">48 dp</div></div>
  <div class="cell" style="margin-left:20px;background:#EEF1FA;padding:14px;border-radius:16px">${cv(sv(x, 'monochrome'), 132, 1, 'data-tint="#2E4A7D" data-bgc="#D6E3FF"')}<div class="lbl" style="color:#445">themed · sáng</div></div>
  <div class="cell" style="background:#11151C;padding:14px;border-radius:16px">${cv(sv(x, 'monochrome'), 132, 1, 'data-tint="#C8DBFF" data-bgc="#2A3A55"')}<div class="lbl">themed · tối</div></div>
  <div class="cell" style="background:#11151C;padding:14px;border-radius:16px">${cv(sv(x, 'monochrome'), 48, 1, 'data-tint="#C8DBFF" data-bgc="#2A3A55"')}<div class="lbl">48</div></div>
 </div></div>

<div class="row" style="gap:22px">
 <div class="sec" style="margin:0"><h2>Màn hình khởi động <small>như AppIntro</small></h2>
  <div class="phone">
   <div class="intro-c">
    <div class="shieldWrap"><div class="glow"></div><img src="${sv(x, 'mark')}" width="132" height="132" style="position:relative"></div>
    <div class="vt" style="margin-top:-20px">${VERSION}</div>
    <div><div class="nm">${'FitJourney'.toUpperCase()}</div><div class="tg">${TAGLINE}</div></div>
   </div>
   <div class="foot"><div class="eb">${LOADING.toUpperCase()}</div><div class="track"><i></i></div></div>
  </div></div>
 <div style="display:flex;flex-direction:column;gap:22px;flex:1">
  <div class="sec" style="margin:0"><h2>Đầu màn hình đăng nhập <small>logo 76 px</small></h2>
   <div class="auth"><img src="${sv(x, 'mark')}" width="76" height="76"><div class="vt">${VERSION}</div><div class="tt">${AUTH_TITLE}</div><div class="st">${AUTH_SUB}</div>
    <div class="seg"><div class="on">Đăng nhập</div><div>Đăng ký</div></div></div></div>
  <div class="sec" style="margin:0"><h2>Logo chữ ngang <small>mark + "FitJourney" Chakra Petch 700</small></h2>
   <div style="display:flex;flex-direction:column;gap:14px">
    <div class="lock dark"><img src="${sv(x, 'mark')}" width="88" height="88"><div class="w" style="font-size:52px">Fit<em>Journey</em></div></div>
    <div class="lock light"><img src="${sv(x, 'mark')}" width="88" height="88"><div class="w" style="font-size:52px">Fit<em>Journey</em></div></div>
    <div class="row" style="gap:14px">
     <div class="lock dark" style="padding:14px 18px;gap:10px"><img src="${sv(x, 'mark-small')}" width="32" height="32"><div class="w" style="font-size:22px">Fit<em>Journey</em></div></div>
     <div class="lock light" style="padding:14px 18px;gap:10px"><img src="${sv(x, 'mark-small')}" width="32" height="32"><div class="w" style="font-size:22px">Fit<em>Journey</em></div></div>
    </div>
   </div></div>
 </div>
</div>

<div class="sec" style="margin-top:22px"><h2>File</h2><div class="files">${['icon', 'mark', 'mark-small', 'android-foreground', 'android-background', 'monochrome', 'favicon'].map((k) => `svg/${x}-${k}.svg`).join(' · ')}</div></div>
${SCRIPT}</body></html>`;
}

function board() {
  const card = (o) => {
    const x = o.id;
    const t = TEXT[x];
    return `<a class="card" href="options/${x}.html">
     <div>${ios(sv(x, 'icon').replace('../', ''), 260)}</div>
     <div><div class="name"><b>${x}</b>${t.title}${t.chosen ? ' <span style="font-size:13px;color:#110D22;background:var(--gold);border-radius:6px;padding:2px 8px">ĐÃ CHỌN</span>' : ''} <span class="go">mở bộ logo →</span></div>
      <div class="why">${t.idea}</div>
      <ul class="pros">${t.pros.slice(0, 2).map((s) => `<li>+ ${s}</li>`).join('')}<li class="c">− ${t.cons[0]}</li></ul>
      <div class="sizes" style="margin-top:14px">${[120, 60, 29].map((s) => `<div class="cell">${cv(`svg/${x}-icon.svg`, s, 1, 'data-round="1"')}<div class="lbl">${s}</div></div>`).join('')}
       <div class="cell" style="margin-left:10px">${cv(`svg/${x}-favicon.svg`, 16, 1)}<div class="lbl">16</div></div>
       <div class="cell" style="margin-left:16px;background:var(--bg);padding:10px;border-radius:12px"><img src="svg/${x}-mark.svg" width="76" height="76"><div class="lbl">mark 76</div></div></div>
     </div></a>`;
  };
  const cmp = (s) => `<div class="cmp">${OPTIONS.map((o) => `<div class="cell">${cv(`svg/${o.id}-icon.svg`, s, 1, 'data-round="1"')}<div class="lbl">${o.id}</div></div>`).join('')}
    <div class="cell" style="margin-left:18px">${cv('../../assets/icon.png', s, 1, 'data-round="1"')}<div class="lbl">0.27.1</div></div></div>`;
  const cmpZoom = `<div class="cmp zoom">${OPTIONS.map((o) => `<div class="cell">${cv(`svg/${o.id}-icon.svg`, 29, 4, 'data-round="1"')}<div class="lbl">${o.id}</div></div>`).join('')}
    <div class="cell" style="margin-left:18px">${cv('../../assets/icon.png', 29, 4, 'data-round="1"')}<div class="lbl">0.27.1</div></div></div>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Logo icon app</title>${FONT}<style>${CSS}
body { width:2000px; }
.grid2 { display:grid; grid-template-columns:repeat(2,1fr); gap:24px; }
.card { background:var(--r1); border:1px solid var(--line); border-radius:24px; padding:24px; display:grid; grid-template-columns:260px 1fr; gap:24px; color:inherit; text-decoration:none; }
.name { font-size:24px; font-weight:700; } .name b { color:var(--gold); margin-right:8px; } .go { font-size:13px; color:var(--goldL); font-weight:500; margin-left:10px; }
.why { color:var(--t2); margin:8px 0 12px; } .why b { color:var(--t); font-weight:600; }
.pros { font-size:13.5px; margin:0; padding-left:18px; list-style:none; } .pros .c { color:var(--t2); }
.cmp { display:flex; gap:22px; align-items:flex-end; }
</style></head><body>
<h1>Logo icon ứng dụng · 4 phương án hoàn chỉnh</h1>
<div class="sub">Vẽ vector tay, bảng màu của app (#110D22 · tím #2A2150 · vàng #FFC83D). Bấm vào từng phương án để xem bộ đầy đủ: cỡ thật, Màn hình chính, Android adaptive + đơn sắc, màn khởi động, đăng nhập, logo chữ. Mọi cỡ nhỏ ở đây đều vẽ từ SVG đúng số điểm ảnh.</div>
<div class="sec"><h2>So sánh cỡ nhỏ <small>4 phương án và icon hiện tại (assets/icon.png, 0.27.1)</small></h2>
 <div class="row" style="gap:60px;align-items:flex-end">
  <div><div class="k" style="margin-top:0">60 px (Màn hình chính @1x)</div>${cmp(60)}</div>
  <div><div class="k" style="margin-top:0">29 px (Cài đặt)</div>${cmp(29)}</div>
  <div><div class="k" style="margin-top:0">29 px phóng to 4×</div>${cmpZoom}</div>
 </div></div>
<div class="grid2">${OPTIONS.map(card).join('')}</div>
${SCRIPT}</body></html>`;
}

for (const o of OPTIONS) writeFileSync(join(here, 'options', `${o.id}.html`), kit(o));
writeFileSync(join(here, 'board.html'), board());
console.log('pages written');

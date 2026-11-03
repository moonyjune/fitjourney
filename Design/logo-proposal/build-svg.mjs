// node Design/logo-proposal/build-svg.mjs  ->  writes Design/logo-proposal/svg/<X>-*.svg from marks.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPTIONS } from './marks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'svg');
mkdirSync(out, { recursive: true });

const svg = (viewBox, defs, body, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">\n <defs>${defs}</defs>\n ${body}\n</svg>\n`;

/** Place content whose crop square is `box` so that square becomes `target` px wide, centred on the 1024 canvas. */
const vb = ([x, y, s]) => `${x} ${y} ${s} ${s}`;

const place = (box, target, body) => {
  const [x, y, s] = box;
  const k = target / s;
  return `<g transform="translate(512 512) scale(${+k.toFixed(4)}) translate(${-(x + s / 2)} ${-(y + s / 2)})">${body}</g>`;
};

// Android adaptive layers are 108 dp; launchers may mask down to the centre 66 dp circle (the safe zone): 626 px of 1024.
// Each option gives droidR = the farthest point of its content from the crop-square centre (grid units), so it fits r 313.
export const SAFE_R = 313;
const droidTarget = (o, box) => Math.round((SAFE_R / o.droidR) * box[2]);

export function files(o) {
  const p = `${o.id}_`;
  const d = o.defs(p);
  const iconBody = o.icon ? o.icon(p) : o.iconMark === 'small' ? o.small(p) : o.mark(p);
  const iconBox = o.iconMark === 'small' ? o.smallBox : o.box;
  return {
    [`${o.id}-icon.svg`]: svg('0 0 1024 1024', d, `${o.bg(p)}\n ${iconBody}\n ${o.iconFg ? o.iconFg(p) : ''}`),
    [`${o.id}-mark.svg`]: svg(vb(o.box), d, o.mark(p), 512),
    [`${o.id}-mark-small.svg`]: svg(vb(o.smallBox), d, o.small(p), 64),
    [`${o.id}-android-foreground.svg`]: svg('0 0 1024 1024', d, o.droidFg ? o.droidFg(p) : place(iconBox, droidTarget(o, iconBox), iconBody)),
    [`${o.id}-android-background.svg`]: svg('0 0 1024 1024', d, o.droidBg(p)),
    [`${o.id}-monochrome.svg`]: svg('0 0 1024 1024', d, o.monoFull ? o.monoFull(p) : place(o.smallBox, droidTarget(o, o.smallBox), o.mono(p))),
    [`${o.id}-favicon.svg`]: svg(
      '0 0 1024 1024',
      d,
      `<rect width="1024" height="1024" rx="224" fill="${o.id === 'C' ? `url(#${p}sky)` : '#1C1538'}"/>\n ${place(o.smallBox, 1010, o.small(p))}`,
      32
    ),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const o of OPTIONS) for (const [name, body] of Object.entries(files(o))) writeFileSync(join(out, name), body);
  console.log('svg written to', out);
}

#!/usr/bin/env node
/**
 * make-art.js — generates the illustrated room scenes in assets/img/.
 *
 * Every visual on the site is a hand-drawn SVG so the whole thing stays
 * self-contained (no stock photos, no CDN, works offline). Scenes are built
 * from shared primitives — walls, arches, furniture, motifs — and recoloured
 * per project, which keeps 14 illustrations looking like one art direction.
 *
 * Swap in real photography later by replacing the <img src> in the HTML.
 *
 *   node tools/make-art.js
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'img');
const W = 800, H = 560;
const FLOOR = 400;                       // horizon line: wall above, floor below

/* ---------------------------------------------------------------- helpers */

// Seeded RNG so regenerating the art produces byte-identical files.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n = v => Math.round(v * 100) / 100;
const rr = (x, y, w, h, r, fill, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}" ${extra}/>`;

/** Pointed jharokha arch as a closed path. */
function archPath(x, y, w, h, springRatio = 0.55) {
  const x2 = x + w, cx = x + w / 2, yb = y + h;
  const sp = y + h * springRatio;                 // where the curve springs from
  return `M${n(x)},${n(yb)} L${n(x)},${n(sp)} `
       + `C${n(x)},${n(sp - h * 0.3)} ${n(x + w * 0.16)},${n(y + h * 0.06)} ${n(cx - w * 0.05)},${n(y + h * 0.02)} `
       + `C${n(cx - w * 0.02)},${n(y - h * 0.02)} ${n(cx + w * 0.02)},${n(y - h * 0.02)} ${n(cx + w * 0.05)},${n(y + h * 0.02)} `
       + `C${n(x2 - w * 0.16)},${n(y + h * 0.06)} ${n(x2)},${n(sp - h * 0.3)} ${n(x2)},${n(sp)} `
       + `L${n(x2)},${n(yb)} Z`;
}

/** Six-petal flower used throughout as the house motif. */
function flower(cx, cy, r, petal, core) {
  let s = `<g transform="translate(${n(cx)},${n(cy)})">`;
  for (let i = 0; i < 6; i++) {
    s += `<ellipse cx="0" cy="${n(-r * 0.62)}" rx="${n(r * 0.3)}" ry="${n(r * 0.55)}" `
       + `fill="${petal}" transform="rotate(${i * 60})"/>`;
  }
  s += `<circle r="${n(r * 0.26)}" fill="${core}"/></g>`;
  return s;
}

/** Tree of life — the motif that fills most arch niches. */
function treeOfLife(cx, baseY, h, ink, bloom) {
  const g = [];
  g.push(`<path d="M${cx},${n(baseY)} C${cx - 5},${n(baseY - h * .3)} ${cx + 5},${n(baseY - h * .55)} ${cx},${n(baseY - h * .72)}"
    stroke="${ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`);

  const levels = [
    { y: .30, len: .30, up: .16 },
    { y: .46, len: .24, up: .14 },
    { y: .60, len: .17, up: .11 },
  ];
  for (const lv of levels) {
    const by = baseY - h * lv.y;
    for (const dir of [-1, 1]) {
      const ex = cx + dir * h * lv.len, ey = by - h * lv.up;
      g.push(`<path d="M${cx},${n(by)} Q${n(cx + dir * h * lv.len * .55)},${n(by - h * .02)} ${n(ex)},${n(ey)}"
        stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
      // leaves riding the branch
      for (let t = .35; t <= 1.001; t += .32) {
        const lx = cx + dir * h * lv.len * t, ly = by - h * lv.up * t * t;
        g.push(`<ellipse cx="${n(lx)}" cy="${n(ly - 6)}" rx="4.5" ry="8"
          fill="${ink}" opacity=".75" transform="rotate(${dir * 32} ${n(lx)} ${n(ly - 6)})"/>`);
      }
      g.push(flower(ex, ey - 4, 9, bloom, ink));
    }
  }
  g.push(flower(cx, baseY - h * .76, 12, bloom, ink));
  return g.join('');
}

/** Lattice screen (jali) clipped to any shape. */
function jali(x, y, w, h, color, id, step = 26) {
  let cells = '';
  for (let cy = y; cy < y + h; cy += step) {
    for (let cx = x; cx < x + w; cx += step) {
      cells += `<path d="M${n(cx + step / 2)},${n(cy)} L${n(cx + step)},${n(cy + step / 2)} `
             + `L${n(cx + step / 2)},${n(cy + step)} L${n(cx)},${n(cy + step / 2)} Z"
             fill="none" stroke="${color}" stroke-width="1.6"/>`;
    }
  }
  return `<g clip-path="url(#${id})">${cells}</g>`;
}

/* ------------------------------------------------------------ scene parts */

function wall(p) {
  return `
  <rect width="${W}" height="${FLOOR}" fill="${p.wall}"/>
  <rect y="${FLOOR - 74}" width="${W}" height="74" fill="${p.wallLo}" opacity=".55"/>
  <rect y="${FLOOR - 78}" width="${W}" height="4" fill="${p.trim}" opacity=".5"/>`;
}

function floor(p, seed = 4) {
  const r = rng(seed);
  let planks = '';
  for (let i = 0; i < 7; i++) {
    const y = FLOOR + 12 + i * 24;
    planks += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${p.floorLine}" stroke-width="1.2" opacity=".4"/>`;
    for (let k = 0; k < 4; k++) {
      const x = r() * W;
      planks += `<line x1="${n(x)}" y1="${y}" x2="${n(x)}" y2="${y + 24}" stroke="${p.floorLine}" stroke-width="1.2" opacity=".28"/>`;
    }
  }
  return `<rect y="${FLOOR}" width="${W}" height="${H - FLOOR}" fill="${p.floor}"/>${planks}
    <rect y="${FLOOR}" width="${W}" height="10" fill="#000" opacity=".07"/>`;
}

function archNiche(p, x, y, w, h, fill, contents) {
  const id = 'a' + Math.round(x + y + w);
  return `
  <defs><clipPath id="${id}"><path d="${archPath(x, y, w, h)}"/></clipPath></defs>
  <path d="${archPath(x - 9, y - 9, w + 18, h + 9)}" fill="${p.trim}" opacity=".9"/>
  <path d="${archPath(x, y, w, h)}" fill="${fill}"/>
  <g clip-path="url(#${id})">${contents}</g>
  <path d="${archPath(x + 11, y + 11, w - 22, h - 11)}" fill="none" stroke="${p.arcLine}" stroke-width="1.6" opacity=".55"/>`;
}

function rug(p, cx, y, w, h) {
  const x = cx - w / 2;
  let fringe = '';
  for (let i = 0; i <= w; i += 13) {
    fringe += `<line x1="${n(x + i)}" y1="${n(y)}" x2="${n(x + i)}" y2="${n(y - 7)}" stroke="${p.rug2}" stroke-width="2"/>`
            + `<line x1="${n(x + i)}" y1="${n(y + h)}" x2="${n(x + i)}" y2="${n(y + h + 7)}" stroke="${p.rug2}" stroke-width="2"/>`;
  }
  let medallion = '';
  for (let i = -1; i <= 1; i++) medallion += flower(cx + i * 62, y + h / 2, 15, p.rug2, p.rug3);
  return `
  <ellipse cx="${cx}" cy="${n(y + h / 2)}" rx="${n(w / 2 + 16)}" ry="${n(h / 2 + 10)}" fill="#000" opacity=".05"/>
  ${fringe}
  ${rr(x, y, w, h, 5, p.rug1)}
  ${rr(x + 12, y + 9, w - 24, h - 18, 3, 'none', `stroke="${p.rug2}" stroke-width="3"`)}
  ${rr(x + 22, y + 16, w - 44, h - 32, 3, 'none', `stroke="${p.rug3}" stroke-width="1.6" opacity=".8"`)}
  ${medallion}`;
}

function sofa(p, cx, baseY, w = 330) {
  const x = cx - w / 2, h = 96, backH = 74, armW = 30;
  let cushions = '';
  const cw = (w - armW * 2 - 24) / 3;
  for (let i = 0; i < 3; i++) {
    const bx = x + armW + 8 + i * (cw + 4);
    cushions += rr(bx, baseY - h - backH + 16, cw, backH - 6, 8, p.cush, `opacity=".95"`);
    cushions += flower(bx + cw / 2, baseY - h - backH / 2 + 16, 11, p.cushMotif, p.cush);
  }
  return `
  <ellipse cx="${cx}" cy="${n(baseY + 6)}" rx="${n(w / 2 + 12)}" ry="10" fill="#000" opacity=".10"/>
  ${rr(x + 6, baseY - h - backH, w - 12, backH + 20, 12, p.sofa)}
  ${cushions}
  ${rr(x, baseY - h, armW, h - 12, 12, p.sofaDark)}
  ${rr(x + w - armW, baseY - h, armW, h - 12, 12, p.sofaDark)}
  ${rr(x + armW - 4, baseY - h + 4, w - armW * 2 + 8, h - 26, 10, p.sofaSeat)}
  ${rr(x + 18, baseY - 14, 12, 16, 3, p.wood2)}
  ${rr(x + w - 30, baseY - 14, 12, 16, 3, p.wood2)}`;
}

/** Almond leaf from origin to (tx,ty), bulging by `w` either side of the midrib. */
function leafShape(tx, ty, w) {
  const mx = tx * .5, my = ty * .5;
  const L = Math.hypot(tx, ty) || 1;
  const ux = -ty / L, uy = tx / L;
  return `M0,0 Q${n(mx + ux * w)},${n(my + uy * w)} ${n(tx)},${n(ty)} `
       + `Q${n(mx - ux * w)},${n(my - uy * w)} 0,0 Z`;
}

function plant(p, x, baseY, s = 1) {
  // Broad fanned leaves — reads as a potted palm rather than a clump of grass.
  const specs = [
    [-52, -34, 15], [-38, -70, 16], [-16, -94, 17], [8, -98, 17],
    [30, -78, 16], [50, -44, 14], [-22, -54, 12], [20, -52, 12],
  ];
  let g = '';
  for (const [tx, ty, w] of specs) {
    g += `<path d="${leafShape(tx, ty, w)}" fill="${p.leaf}"/>`;
    g += `<path d="M0,0 Q${n(tx * .45)},${n(ty * .62)} ${n(tx)},${n(ty)}"
      stroke="${p.leafDark}" stroke-width="1.3" fill="none" opacity=".65"/>`;
  }
  return `<g transform="translate(${n(x)},${n(baseY)}) scale(${s})">
    <ellipse cx="0" cy="4" rx="34" ry="8" fill="#000" opacity=".10"/>
    <g transform="translate(0,-32)">${g}</g>
    <path d="M-26,-30 L26,-30 L20,2 L-20,2 Z" fill="${p.pot}"/>
    <rect x="-29" y="-36" width="58" height="10" rx="3" fill="${p.potDark}"/>
    <path d="M-20,-16 L20,-16" stroke="${p.potDark}" stroke-width="2" opacity=".5"/>
  </g>`;
}

/** Dining / office chair, drawn front-on. `backH` tunes tall dining vs. low task chair. */
function chair(p, x, baseY, backH = 108, backFill) {
  const top = baseY - 42 - backH;
  const back = backFill || p.wood2;          // wood back reads as furniture, not appliance
  return `
  <ellipse cx="${n(x)}" cy="${n(baseY + 4)}" rx="30" ry="7" fill="#000" opacity=".09"/>
  ${rr(x - 25, top, 50, backH, 10, back)}
  ${rr(x - 18, top + 8, 36, backH - 16, 7, 'none', `stroke="${p.bloom}" stroke-width="2" opacity=".55"`)}
  ${flower(x, top + backH / 2, 9, p.bloom, back)}
  ${rr(x - 28, baseY - 46, 56, 12, 5, p.wood3)}
  <path d="M${n(x - 21)},${n(baseY - 34)} L${n(x - 23)},${n(baseY)} M${n(x + 21)},${n(baseY - 34)} L${n(x + 23)},${n(baseY)}"
    stroke="${p.wood3}" stroke-width="6" stroke-linecap="round"/>`;
}

/** Round cane mudda / pouffe. */
function pouffe(p, x, baseY, r = 40) {
  let ribs = '';
  for (let i = -2; i <= 2; i++) {
    ribs += `<path d="M${n(x + i * r * .38)},${n(baseY - 48)} Q${n(x + i * r * .46)},${n(baseY - 24)} ${n(x + i * r * .38)},${n(baseY - 2)}"
      stroke="${p.bloom}" stroke-width="1.6" fill="none" opacity=".45"/>`;
  }
  return `<ellipse cx="${n(x)}" cy="${n(baseY + 3)}" rx="${n(r)}" ry="8" fill="#000" opacity=".10"/>
    ${rr(x - r, baseY - 50, r * 2, 50, 16, p.sofa)}
    <ellipse cx="${n(x)}" cy="${n(baseY - 50)}" rx="${n(r)}" ry="9" fill="${p.sofaSeat}"/>
    ${ribs}`;
}

/** Desktop monitor on a stand. */
function monitor(p, x, deskY) {
  return `${rr(x - 34, deskY - 44, 68, 40, 4, p.sofaDark)}
    ${rr(x - 29, deskY - 39, 58, 30, 2, p.metalLight, 'opacity=".55"')}
    ${rr(x - 5, deskY - 6, 10, 8, 2, p.metal)}
    ${rr(x - 15, deskY - 4, 30, 4, 2, p.metal)}`;
}

function pendant(p, x, dropTo, r = 32) {
  return `<g>
    <line x1="${x}" y1="0" x2="${x}" y2="${n(dropTo - r * .5)}" stroke="${p.metal}" stroke-width="2.5"/>
    <path d="M${n(x - r)},${n(dropTo)} Q${x},${n(dropTo - r * 1.5)} ${n(x + r)},${n(dropTo)} Z" fill="${p.metal}"/>
    <ellipse cx="${x}" cy="${n(dropTo)}" rx="${n(r)}" ry="5" fill="${p.metalLight}"/>
    <ellipse cx="${x}" cy="${n(dropTo + 26)}" rx="${n(r * 1.5)}" ry="22" fill="${p.glow}" opacity=".3"/>
  </g>`;
}

function artFrame(p, x, y, w, h, motif = 'flower') {
  const inner = motif === 'flower'
    ? flower(x + w / 2, y + h / 2, Math.min(w, h) * .28, p.artInk, p.artBg2)
    : `<path d="M${n(x + w * .2)},${n(y + h * .78)} Q${n(x + w * .5)},${n(y + h * .1)} ${n(x + w * .8)},${n(y + h * .78)}"
         stroke="${p.artInk}" stroke-width="3" fill="none"/>`;
  return `
  ${rr(x - 5, y - 5, w + 10, h + 10, 3, p.frame)}
  ${rr(x, y, w, h, 1, p.artBg)}
  ${inner}`;
}

function archWindow(p, x, y, w, h) {
  const id = 'w' + Math.round(x + y);
  let bars = '';
  for (let i = 1; i < 3; i++) bars += `<line x1="${n(x + (w / 3) * i)}" y1="${y}" x2="${n(x + (w / 3) * i)}" y2="${n(y + h)}" stroke="${p.trim}" stroke-width="4"/>`;
  bars += `<line x1="${x}" y1="${n(y + h * .62)}" x2="${n(x + w)}" y2="${n(y + h * .62)}" stroke="${p.trim}" stroke-width="4"/>`;
  return `
  <defs><clipPath id="${id}"><path d="${archPath(x, y, w, h)}"/></clipPath></defs>
  <path d="${archPath(x - 8, y - 8, w + 16, h + 8)}" fill="${p.trim}"/>
  <path d="${archPath(x, y, w, h)}" fill="${p.sky}"/>
  <g clip-path="url(#${id})">
    <ellipse cx="${n(x + w * .3)}" cy="${n(y + h * .8)}" rx="${n(w * .5)}" ry="${n(h * .3)}" fill="${p.skyFar}" opacity=".7"/>
    <ellipse cx="${n(x + w * .8)}" cy="${n(y + h * .88)}" rx="${n(w * .45)}" ry="${n(h * .26)}" fill="${p.skyFar}" opacity=".5"/>
    ${bars}
  </g>`;
}

function sideTable(p, x, baseY, w = 62) {
  return `
  <ellipse cx="${n(x)}" cy="${n(baseY + 4)}" rx="${n(w * .55)}" ry="7" fill="#000" opacity=".09"/>
  ${rr(x - w / 2, baseY - 62, w, 9, 4, p.wood2)}
  <path d="M${n(x - w * .3)},${n(baseY - 53)} L${n(x - w * .18)},${n(baseY)} M${n(x + w * .3)},${n(baseY - 53)} L${n(x + w * .18)},${n(baseY)}"
    stroke="${p.wood2}" stroke-width="5" stroke-linecap="round"/>`;
}

function diya(p, x, baseY, s = 1) {
  return `<g transform="translate(${n(x)},${n(baseY)}) scale(${s})">
    <path d="M-14,0 Q-14,10 0,10 Q14,10 14,0 Z" fill="${p.pot}"/>
    <ellipse cx="0" cy="0" rx="14" ry="4" fill="${p.potDark}"/>
    <path d="M0,-2 Q-5,-10 0,-18 Q5,-10 0,-2 Z" fill="${p.flame}"/>
    <circle cy="-10" r="13" fill="${p.flame}" opacity=".18"/>
  </g>`;
}

/* ------------------------------------------------------------ scene types */

const build = {
  living(p) {
    return `${wall(p)}
      ${archNiche(p, 285, 78, 230, 322, p.accent, treeOfLife(400, 380, 250, p.accentInk, p.bloom))}
      ${artFrame(p, 108, 132, 96, 116)}
      ${artFrame(p, 620, 148, 88, 100, 'hill')}
      ${pendant(p, 168, 96, 30)}
      ${floor(p, 11)}
      ${rug(p, 400, 452, 420, 88)}
      ${sofa(p, 400, 452)}
      ${plant(p, 686, 470, 1.05)}
      ${sideTable(p, 172, 468)}
      ${diya(p, 172, 468 - 62, .8)}`;
  },

  bedroom(p) {
    const bedW = 360, cx = 400, baseY = 502;
    let pillows = '';
    for (const dx of [-66, 66]) pillows += rr(cx + dx - 62, baseY - 122, 124, 44, 12, p.cush);
    let tufting = '';
    for (const dx of [-84, -28, 28, 84]) tufting += `<circle cx="${cx + dx}" cy="${baseY - 138}" r="3.5" fill="${p.bloom}" opacity=".5"/>`;
    return `${wall(p)}
      ${archNiche(p, 262, 60, 276, 300, p.accent, treeOfLife(400, 348, 236, p.accentInk, p.bloom))}
      ${artFrame(p, 122, 150, 82, 96)}
      ${pendant(p, 640, 120, 26)}
      ${floor(p, 23)}
      ${rug(p, 400, 506, 470, 56)}
      <ellipse cx="${cx}" cy="${baseY + 8}" rx="${bedW / 2 + 18}" ry="13" fill="#000" opacity=".10"/>
      ${rr(cx - bedW / 2 + 14, baseY - 200, bedW - 28, 124, 14, p.sofa)}
      ${rr(cx - bedW / 2 + 26, baseY - 190, bedW - 52, 104, 10, 'none', `stroke="${p.bloom}" stroke-width="2" opacity=".45"`)}
      ${tufting}
      ${pillows}
      ${rr(cx - bedW / 2, baseY - 84, bedW, 46, 9, p.cush)}
      ${rr(cx - bedW / 2 - 8, baseY - 54, bedW + 16, 32, 7, p.cushMotif)}
      ${rr(cx - bedW / 2 + 6, baseY - 26, bedW - 12, 22, 5, p.wood2)}
      ${rr(cx - bedW / 2 + 10, baseY - 6, 14, 10, 3, p.wood3)}
      ${rr(cx + bedW / 2 - 24, baseY - 6, 14, 10, 3, p.wood3)}
      ${sideTable(p, 138, 490)} ${diya(p, 138, 428, .85)}
      ${sideTable(p, 662, 490)}
      ${plant(p, 736, 498, .78)}`;
  },

  dining(p) {
    const cx = 400, top = 430;
    let chairs = '';
    // Seated outside the 420px tabletop so the silhouettes stay readable
    for (const dx of [-258, 258]) chairs += chair(p, cx + dx, top + 96);
    return `${wall(p)}
      ${archWindow(p, 300, 66, 200, 250)}
      ${jaliPanelInline(p, 96, 140, 118, 200)}
      ${artFrame(p, 606, 156, 96, 108)}
      ${pendant(p, 340, 112, 26)} ${pendant(p, 460, 132, 26)}
      ${floor(p, 31)}
      ${chairs}
      <ellipse cx="${cx}" cy="${top + 100}" rx="216" ry="17" fill="#000" opacity=".10"/>
      ${rr(cx - 210, top - 8, 420, 20, 9, p.wood2)}
      ${rr(cx - 200, top + 12, 380, 8, 4, p.wood3)}
      <path d="M${cx - 150},${top + 20} L${cx - 140},${top + 96} M${cx + 150},${top + 20} L${cx + 140},${top + 96}"
        stroke="${p.wood3}" stroke-width="12" stroke-linecap="round"/>
      ${flowerVase(p, cx, top - 8)}
      ${plant(p, 724, 490, .88)}`;
  },

  kitchen(p) {
    let uppers = '', tiles = '', lowers = '';
    for (let i = 0; i < 4; i++) {
      const x = 96 + i * 96;
      uppers += rr(x, 118, 88, 108, 6, p.sofaDark)
              + rr(x + 8, 126, 72, 92, 4, 'none', `stroke="${p.bloom}" stroke-width="1.6" opacity=".4"`)
              + rr(x + 34, 210, 20, 5, 2, p.metalLight);
    }
    for (let y = 244; y < 340; y += 24)
      for (let x = 90; x < 500; x += 24)
        tiles += rr(x, y, 22, 22, 3, p.accent, 'opacity=".28"');
    for (let i = 0; i < 5; i++) {
      const x = 88 + i * 96;
      lowers += rr(x, 358, 88, 96, 6, p.sofa)
              + rr(x + 8, 366, 72, 80, 4, 'none', `stroke="${p.bloom}" stroke-width="1.6" opacity=".35"`)
              + rr(x + 34, 372, 20, 5, 2, p.metalLight);
    }
    return `${wall(p)}
      ${tiles}
      ${uppers}
      ${rr(80, 340, 500, 20, 5, p.wood2)}
      ${archWindow(p, 616, 120, 132, 190)}
      ${pendant(p, 300, 100, 24)} ${pendant(p, 400, 100, 24)}
      ${floor(p, 47)}
      ${lowers}
      ${rr(210, 300, 82, 40, 6, p.metalLight)}
      ${flowerVase(p, 500, 340)}
      ${plant(p, 690, 480, .8)}`;
  },

  office(p) {
    // Arched arcade along the back wall keeps the commercial scene on-brand.
    let arcade = '', desks = '';
    for (let i = 0; i < 4; i++) {
      const x = 88 + i * 158;
      arcade += `<path d="${archPath(x, 92, 116, 194)}" fill="${p.accent}" opacity=".2"/>
        <path d="${archPath(x, 92, 116, 194)}" fill="none" stroke="${p.trim}" stroke-width="3" opacity=".55"/>
        ${flower(x + 58, 196, 17, p.bloom, p.accent)}`;
    }
    for (let i = 0; i < 3; i++) {
      const x = 158 + i * 190, deskY = 424;
      // Chair drawn last so it sits in front of the desk — reads as a workstation
      desks += rr(x - 76, deskY, 152, 13, 5, p.wood2)
             + `<path d="M${x - 62},${deskY + 13} L${x - 58},${deskY + 74} M${x + 62},${deskY + 13} L${x + 58},${deskY + 74}"
                 stroke="${p.metal}" stroke-width="7" stroke-linecap="round"/>`
             + monitor(p, x, deskY)
             + chair(p, x, 524, 64, p.sofaDark);
    }
    return `${wall(p)}
      ${arcade}
      ${rr(80, 300, 640, 5, 3, p.trim, 'opacity=".6"')}
      ${pendant(p, 250, 70, 32)} ${pendant(p, 550, 70, 32)}
      ${floor(p, 59)}
      ${rug(p, 400, 486, 600, 62)}
      ${desks}
      ${plant(p, 736, 498, .9)}
      ${plant(p, 58, 492, .7)}`;
  },

  courtyard(p) {
    const id = 'cj';
    let cols = '';
    for (const x of [96, 704]) {
      cols += `${rr(x - 22, 120, 44, 300, 6, p.trim)}
               ${rr(x - 30, 108, 60, 20, 5, p.wood2)}
               ${rr(x - 28, 408, 56, 18, 5, p.wood2)}`;
    }
    return `${wall(p)}
      <defs><clipPath id="${id}"><path d="${archPath(230, 44, 340, 356)}"/></clipPath></defs>
      <path d="${archPath(222, 36, 356, 364)}" fill="${p.trim}"/>
      <path d="${archPath(230, 44, 340, 356)}" fill="${p.sky}"/>
      <g clip-path="url(#${id})">
        <ellipse cx="330" cy="380" rx="190" ry="130" fill="${p.skyFar}" opacity=".65"/>
        <ellipse cx="520" cy="392" rx="170" ry="110" fill="${p.skyFar}" opacity=".45"/>
        ${treeOfLife(400, 396, 230, p.accentInk, p.bloom)}
      </g>
      ${cols}
      ${jali(96, 120, 90, 300, p.arcLine, id, 30)}
      ${floor(p, 71)}
      ${rug(p, 400, 452, 300, 76)}
      ${sofa(p, 400, 452, 250)}
      ${plant(p, 656, 480, 1)} ${plant(p, 148, 484, .8)}
      ${diya(p, 250, 470, .9)} ${diya(p, 550, 470, .9)}`;
  },

  pooja(p) {
    let steps = '';
    for (let i = 0; i < 3; i++) steps += rr(330 - i * 26, 372 + i * 22, 140 + i * 52, 22, 4, i % 2 ? p.wood2 : p.wood3);
    return `${wall(p)}
      ${archNiche(p, 268, 44, 264, 330, p.accent, `
        ${treeOfLife(400, 356, 250, p.accentInk, p.bloom)}
        <circle cx="400" cy="140" r="46" fill="${p.bloom}" opacity=".35"/>`)}
      ${jaliPanelInline(p, 92, 130, 120, 230)}
      ${jaliPanelInline(p, 588, 130, 120, 230)}
      ${pendant(p, 400, 60, 22)}
      ${floor(p, 83)}
      ${steps}
      ${diya(p, 316, 372, 1)} ${diya(p, 400, 372, 1.15)} ${diya(p, 484, 372, 1)}
      ${rug(p, 400, 486, 330, 58)}
      ${plant(p, 700, 488, .78)} ${plant(p, 104, 490, .7)}`;
  },

  furniture(p) {
    let shelves = '', wares = '';
    for (let i = 0; i < 3; i++) {
      const y = 140 + i * 84;
      shelves += rr(78, y + 62, 250, 10, 4, p.wood2);
      for (let k = 0; k < 4; k++) wares += flower(112 + k * 66, y + 40, 15, p.bloom, p.accentInk);
    }
    return `${wall(p)}
      ${shelves}${wares}
      ${archNiche(p, 470, 96, 210, 260, p.accent, treeOfLife(575, 340, 200, p.accentInk, p.bloom))}
      ${pendant(p, 200, 88, 26)}
      ${floor(p, 97)}
      ${rug(p, 430, 462, 380, 80)}
      <ellipse cx="430" cy="490" rx="130" ry="14" fill="#000" opacity=".10"/>
      ${rr(340, 400, 180, 14, 6, p.wood2)}
      <path d="M360,414 L356,486 M500,414 L504,486" stroke="${p.wood2}" stroke-width="11" stroke-linecap="round"/>
      ${rr(352, 372, 156, 30, 7, p.sofaSeat)}
      ${flowerVase(p, 430, 400)}
      ${pouffe(p, 646, 494, 44)}
      ${plant(p, 736, 500, .78)}`;
  },

  /** Deliberately drab "before" state for the reveal slider. */
  bare(p, variant) {
    const grey = { ...p };
    let clutter = '';
    if (variant === 'living') {
      clutter = `
        ${rr(230, 400, 150, 90, 6, '#B9AFA2')}
        ${rr(238, 384, 134, 24, 5, '#A79C8E')}
        ${rr(470, 430, 84, 64, 3, '#C0B4A2')}
        <path d="M470,446 L554,446" stroke="#A79C8E" stroke-width="3"/>`;
    } else if (variant === 'bedroom') {
      clutter = `
        ${rr(250, 418, 300, 74, 6, '#C6BBAC')}
        ${rr(258, 404, 284, 20, 5, '#B3A796')}
        ${rr(600, 440, 70, 52, 3, '#C0B4A2')}`;
    } else {
      clutter = `
        ${rr(90, 372, 420, 18, 3, '#B3A796')}
        ${rr(96, 390, 408, 92, 4, '#C6BBAC')}
        ${rr(560, 430, 76, 62, 3, '#C0B4A2')}`;
    }
    return `
      <rect width="${W}" height="${FLOOR}" fill="#CFC7BA"/>
      <rect y="${FLOOR - 70}" width="${W}" height="70" fill="#C4BCAE"/>
      <path d="M120,60 L128,150 L118,232" stroke="#B0A697" stroke-width="2.5" fill="none"/>
      <path d="M640,90 L648,168" stroke="#B0A697" stroke-width="2.5" fill="none"/>
      ${rr(300, 96, 190, 150, 2, '#C4BCAE')}
      ${rr(300, 96, 190, 150, 2, 'none', 'stroke="#B0A697" stroke-width="3"')}
      <line x1="395" y1="96" x2="395" y2="246" stroke="#B0A697" stroke-width="3"/>
      <line x1="300" y1="171" x2="490" y2="171" stroke="#B0A697" stroke-width="3"/>
      <line x1="200" y1="0" x2="200" y2="120" stroke="#9E948A" stroke-width="2"/>
      <circle cx="200" cy="132" r="13" fill="#E4DED2"/>
      <circle cx="200" cy="132" r="30" fill="#E4DED2" opacity=".22"/>
      <rect y="${FLOOR}" width="${W}" height="${H - FLOOR}" fill="#B5AA9A"/>
      <rect y="${FLOOR}" width="${W}" height="9" fill="#000" opacity=".08"/>
      <line x1="0" y1="452" x2="${W}" y2="452" stroke="#A2978A" stroke-width="1.5"/>
      <line x1="0" y1="502" x2="${W}" y2="502" stroke="#A2978A" stroke-width="1.5"/>
      ${clutter}`;
  },
};

function jaliPanelInline(p, x, y, w, h) {
  const id = 'jp' + Math.round(x + y + w);
  return `<defs><clipPath id="${id}"><path d="${archPath(x, y, w, h)}"/></clipPath></defs>
    <path d="${archPath(x, y, w, h)}" fill="${p.accent}" opacity=".9"/>
    ${jali(x, y, w, h, p.bloom, id, 24)}
    <path d="${archPath(x, y, w, h)}" fill="none" stroke="${p.trim}" stroke-width="5"/>`;
}

function flowerVase(p, x, baseY) {
  return `<g transform="translate(${n(x)},${n(baseY)})">
    <path d="M-16,0 Q-22,-26 -10,-40 L10,-40 Q22,-26 16,0 Z" fill="${p.metalLight}"/>
    <path d="M0,-40 Q-14,-62 -22,-76" stroke="${p.leafDark}" stroke-width="2" fill="none"/>
    <path d="M0,-40 Q10,-64 20,-78" stroke="${p.leafDark}" stroke-width="2" fill="none"/>
    <path d="M0,-40 L0,-84" stroke="${p.leafDark}" stroke-width="2" fill="none"/>
    ${flower(-22, -78, 11, p.bloom, p.accent)}
    ${flower(20, -80, 10, p.flame, p.accent)}
    ${flower(0, -86, 12, p.bloom, p.accent)}
  </g>`;
}

/* ---------------------------------------------------------------- palettes */

const base = {
  trim: '#8B5E3C', wood2: '#8B5E3C', wood3: '#6F4A2E', floorLine: '#7A5334',
  arcLine: '#FFF7E8', metal: '#B8862F', metalLight: '#E9C079', glow: '#FFE9B0',
  leaf: '#2E4A3B', leafDark: '#1E3227', pot: '#C44536', potDark: '#9E3427',
  flame: '#F0A03A', artBg: '#FFF7E8', artBg2: '#EAD9C1', artInk: '#C44536', frame: '#8B5E3C',
  sky: '#CBE3DC', skyFar: '#8FBFB2',
};

const palettes = {
  terracotta: {
    ...base, wall: '#F6E7D0', wallLo: '#EAD9C1', floor: '#A9724A',
    accent: '#C44536', accentInk: '#FFF7E8', bloom: '#E9C079',
    sofa: '#1F6D6A', sofaDark: '#175450', sofaSeat: '#2E8A85',
    cush: '#EAD9C1', cushMotif: '#C44536',
    rug1: '#C44536', rug2: '#E9C079', rug3: '#FFF7E8',
  },
  forest: {
    ...base, wall: '#EFEDDC', wallLo: '#E2E0CB', floor: '#8B5E3C',
    accent: '#2E4A3B', accentInk: '#E9C079', bloom: '#D8A03A',
    sofa: '#C44536', sofaDark: '#9E3427', sofaSeat: '#D8604F',
    cush: '#FFF7E8', cushMotif: '#2E4A3B',
    rug1: '#2E4A3B', rug2: '#D8A03A', rug3: '#EAD9C1',
  },
  mustard: {
    ...base, wall: '#FBF1DA', wallLo: '#F2E3C5', floor: '#9C6B44',
    accent: '#D8A03A', accentInk: '#2E4A3B', bloom: '#FFF7E8',
    sofa: '#2E4A3B', sofaDark: '#22382C', sofaSeat: '#436B55',
    cush: '#EAD9C1', cushMotif: '#C44536',
    rug1: '#EAD9C1', rug2: '#C44536', rug3: '#2E4A3B',
  },
  teal: {
    ...base, wall: '#E8F0EC', wallLo: '#D8E5DF', floor: '#96693F',
    accent: '#1F6D6A', accentInk: '#FFF7E8', bloom: '#E9C079',
    sofa: '#D8A03A', sofaDark: '#B4832A', sofaSeat: '#E9BB60',
    cush: '#FFF7E8', cushMotif: '#1F6D6A',
    rug1: '#1F6D6A', rug2: '#E9C079', rug3: '#FFF7E8',
  },
  coral: {
    ...base, wall: '#FDEDE6', wallLo: '#F6DCD1', floor: '#A5714B',
    accent: '#F08A75', accentInk: '#22382C', bloom: '#FFF7E8',
    sofa: '#2E4A3B', sofaDark: '#22382C', sofaSeat: '#456C57',
    cush: '#FFF7E8', cushMotif: '#F08A75',
    rug1: '#F08A75', rug2: '#2E4A3B', rug3: '#FFF7E8',
  },
  sand: {
    ...base, wall: '#F4EADB', wallLo: '#E6D6BE', floor: '#8E6039',
    accent: '#B0763A', accentInk: '#FFF7E8', bloom: '#E9C079',
    sofa: '#1F6D6A', sofaDark: '#175450', sofaSeat: '#37847F',
    cush: '#EAD9C1', cushMotif: '#B0763A',
    rug1: '#EAD9C1', rug2: '#B0763A', rug3: '#1F6D6A',
  },
};

/* ------------------------------------------------------------------ output */

const scenes = [
  // Portfolio + service artwork
  ['room-living',    'living',    'terracotta'],
  ['room-bedroom',   'bedroom',   'forest'],
  ['room-dining',    'dining',    'mustard'],
  ['room-kitchen',   'kitchen',   'teal'],
  ['room-office',    'office',    'forest'],
  ['room-courtyard', 'courtyard', 'terracotta'],
  ['room-pooja',     'pooja',     'mustard'],
  ['room-furniture', 'furniture', 'sand'],
  ['room-living-2',  'living',    'coral'],
  ['room-bedroom-2', 'bedroom',   'teal'],
  ['room-dining-2',  'dining',    'terracotta'],
  ['room-office-2',  'office',    'teal'],
  // Before / after pairs
  ['after-living',   'living',    'terracotta'],
  ['after-bedroom',  'bedroom',   'forest'],
  ['after-kitchen',  'kitchen',   'teal'],
];

const bares = [
  ['before-living',  'living'],
  ['before-bedroom', 'bedroom'],
  ['before-kitchen', 'kitchen'],
];

fs.mkdirSync(OUT, { recursive: true });

function wrapSvg(body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
<title>${title}</title>
${body}
</svg>`;
}

/* ------------------------------------------------------- signature motifs */

const C = { terracotta: '#C44536', mustard: '#D8A03A', forest: '#2E4A3B', teal: '#1F6D6A', cream: '#FFF7E8', coral: '#F08A75' };

function peacock() {
  const cx = 200, baseY = 352;
  let back = '', fan = '';
  // Under-layer of short feathers adds depth behind the main fan
  for (let i = 0; i < 21; i++) {
    const a = (-118 + (i / 20) * 236) * Math.PI / 180;
    const L = 126 + Math.sin((i / 20) * Math.PI) * 26;
    back += `<line x1="${cx}" y1="${baseY}" x2="${n(cx + Math.sin(a) * L)}" y2="${n(baseY - Math.cos(a) * L)}"
      stroke="${C.teal}" stroke-width="2" opacity=".3"/>`;
  }
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const a = (-112 + t * 224) * Math.PI / 180;
    const L = 158 + Math.sin(t * Math.PI) * 44;
    const tx = cx + Math.sin(a) * L, ty = baseY - Math.cos(a) * L;
    const mx = cx + Math.sin(a) * L * .55, my = baseY - Math.cos(a) * L * .55;
    fan += `<path d="M${cx},${baseY} Q${n(mx + Math.cos(a) * 12)},${n(my + Math.sin(a) * 12)} ${n(tx)},${n(ty)}"
      stroke="${C.forest}" stroke-width="2.4" fill="none" opacity=".85"/>`;
    // barbs
    for (let k = .6; k < .95; k += .1) {
      const bx = cx + Math.sin(a) * L * k, by = baseY - Math.cos(a) * L * k;
      fan += `<line x1="${n(bx)}" y1="${n(by)}" x2="${n(bx + Math.cos(a) * 9)}" y2="${n(by + Math.sin(a) * 9)}" stroke="${C.teal}" stroke-width="1.4" opacity=".5"/>`
           + `<line x1="${n(bx)}" y1="${n(by)}" x2="${n(bx - Math.cos(a) * 9)}" y2="${n(by - Math.sin(a) * 9)}" stroke="${C.teal}" stroke-width="1.4" opacity=".5"/>`;
    }
    fan += `<ellipse cx="${n(tx)}" cy="${n(ty)}" rx="15" ry="18" fill="${C.teal}" transform="rotate(${n(a * 180 / Math.PI)} ${n(tx)} ${n(ty)})"/>
      <ellipse cx="${n(tx)}" cy="${n(ty)}" rx="10" ry="12" fill="${C.mustard}" transform="rotate(${n(a * 180 / Math.PI)} ${n(tx)} ${n(ty)})"/>
      <circle cx="${n(tx)}" cy="${n(ty)}" r="5" fill="${C.terracotta}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="Peacock motif">
<title>Peacock motif</title>
${back}${fan}
<ellipse cx="${cx}" cy="330" rx="30" ry="42" fill="${C.teal}"/>
<path d="M200,300 C184,272 184,240 194,216" stroke="${C.teal}" stroke-width="19" fill="none" stroke-linecap="round"/>
<circle cx="196" cy="208" r="18" fill="${C.forest}"/>
<path d="M212,206 L234,213 L212,219 Z" fill="${C.mustard}"/>
<circle cx="202" cy="203" r="3.4" fill="${C.cream}"/>
<g stroke="${C.forest}" stroke-width="2" fill="none">
  <path d="M188,192 L182,174"/><path d="M196,190 L196,170"/><path d="M204,192 L210,174"/>
</g>
<circle cx="182" cy="171" r="4" fill="${C.mustard}"/>
<circle cx="196" cy="167" r="4" fill="${C.mustard}"/>
<circle cx="210" cy="171" r="4" fill="${C.mustard}"/>
</svg>`;
}

function elephant() {
  let anklets = '', tassels = '', blooms = '';
  for (const x of [120, 166, 250, 292]) {
    anklets += rr(x, 268, 34, 8, 3, C.mustard);
  }
  for (const x of [170, 208, 246, 284]) {
    tassels += `<line x1="${x}" y1="207" x2="${x}" y2="228" stroke="${C.mustard}" stroke-width="2.5"/>
                <circle cx="${x}" cy="232" r="5" fill="${C.mustard}"/>`;
  }
  for (const [x, y] of [[186, 158], [228, 150], [270, 158]]) blooms += flower(x, y, 13, C.mustard, C.cream);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320" role="img" aria-label="Decorated elephant motif">
<title>Decorated elephant motif</title>
${rr(118, 232, 38, 42, 12, C.forest)}
${rr(164, 232, 36, 42, 12, C.forest)}
${rr(248, 232, 36, 42, 12, C.forest)}
${rr(290, 232, 38, 42, 12, C.forest)}
${anklets}
<ellipse cx="232" cy="180" rx="98" ry="72" fill="${C.forest}"/>
<path d="M320,150 C344,140 350,166 336,178" stroke="${C.forest}" stroke-width="7" fill="none" stroke-linecap="round"/>
<circle cx="338" cy="182" r="9" fill="${C.mustard}"/>
<circle cx="142" cy="182" r="64" fill="${C.forest}"/>
<path d="M108,196 C88,216 82,246 88,268" stroke="${C.forest}" stroke-width="31" fill="none" stroke-linecap="round"/>
<path d="M88,268 C92,284 108,292 120,283" stroke="${C.forest}" stroke-width="23" fill="none" stroke-linecap="round"/>
<path d="M120,283 C130,275 128,263 118,261" stroke="${C.forest}" stroke-width="15" fill="none" stroke-linecap="round"/>
<path d="M112,236 C98,244 96,262 104,274" stroke="${C.cream}" stroke-width="2" fill="none" opacity=".45"/>
<path d="M126,232 C142,252 168,250 176,236" fill="${C.cream}" opacity=".9"/>
<path d="M150,140 C196,132 202,196 158,224 C132,236 116,206 120,176 C123,154 134,142 150,140 Z" fill="${C.terracotta}"/>
<path d="M148,158 C176,154 180,192 154,210" fill="none" stroke="${C.mustard}" stroke-width="2.5" opacity=".8"/>
<circle cx="126" cy="164" r="4.5" fill="${C.cream}"/>
<path d="M158,148 C204,116 286,120 312,152 L308,204 Q288,228 268,204 Q248,228 228,204 Q208,228 188,204 Q170,226 156,200 Z" fill="${C.terracotta}"/>
<path d="M160,152 C204,122 284,126 308,156" fill="none" stroke="${C.mustard}" stroke-width="4"/>
${blooms}${tassels}
</svg>`;
}

function mandala() {
  let rings = '';
  const cx = 200, cy = 200;
  const specs = [
    { r: 178, n: 32, pr: 14, fill: C.terracotta, op: .5 },
    { r: 146, n: 24, pr: 18, fill: C.mustard,    op: .7 },
    { r: 112, n: 16, pr: 22, fill: C.terracotta, op: .6 },
    { r: 78,  n: 12, pr: 20, fill: C.mustard,    op: .8 },
    { r: 46,  n: 8,  pr: 18, fill: C.terracotta, op: .7 },
  ];
  for (const s of specs) {
    for (let i = 0; i < s.n; i++) {
      const a = (i / s.n) * Math.PI * 2;
      rings += `<ellipse cx="${n(cx + Math.cos(a) * s.r)}" cy="${n(cy + Math.sin(a) * s.r)}"
        rx="${s.pr * .48}" ry="${s.pr}" fill="${s.fill}" opacity="${s.op}"
        transform="rotate(${n(a * 180 / Math.PI + 90)} ${n(cx + Math.cos(a) * s.r)} ${n(cy + Math.sin(a) * s.r)})"/>`;
    }
    rings += `<circle cx="${cx}" cy="${cy}" r="${s.r - s.pr}" fill="none" stroke="${s.fill}" stroke-width="1.5" opacity=".45"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="Mandala pattern">
<title>Mandala pattern</title>
${rings}
${flower(cx, cy, 30, C.terracotta, C.mustard)}
</svg>`;
}

function toran() {
  let hang = '';
  for (let i = 0; i <= 11; i++) {
    const x = 26 + i * 50;
    const drop = i % 2 ? 40 : 58;
    hang += `<path d="M${x},18 L${x},${18 + drop - 14}" stroke="${C.forest}" stroke-width="2"/>
      <path d="M${x},${18 + drop - 14} q-13,10 0,24 q13,-14 0,-24 Z" fill="${C.forest}"/>
      ${flower(x, 18 + drop + 18, 9, C.mustard, C.terracotta)}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 100" role="img" aria-label="Toran garland">
<title>Toran garland</title>
<path d="M0,18 Q300,42 600,18" fill="none" stroke="${C.terracotta}" stroke-width="4"/>
${hang}
</svg>`;
}

const motifFiles = { peacock, elephant, mandala, toran };

let count = 0;
for (const [name, fn] of Object.entries(motifFiles)) {
  fs.writeFileSync(path.join(OUT, name + '.svg'), fn());
  count++;
}
for (const [name, type, pal] of scenes) {
  const svg = wrapSvg(build[type](palettes[pal]), `${type} interior illustration`);
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
  count++;
}
for (const [name, variant] of bares) {
  const svg = wrapSvg(build.bare(palettes.sand, variant), `undesigned ${variant} before renovation`);
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
  count++;
}

console.log(`Wrote ${count} illustrations to assets/img/`);

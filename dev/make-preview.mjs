// Renders a standalone comparison page: the same tweets at a ladder of intensity settings,
// so the wash strength can be chosen by eye instead of guessed at. Uses the same wash maths
// as content.js.
import { writeFileSync } from 'node:fs';

const PALETTE = { red:'#dd1706', orange:'#f88100', brown:'#a25900', yellow:'#fad200', green:'#00a02a',
  teal:'#00c7a6', 'dark blue':'#004e60', 'light blue':'#0081f8', indigo:'#3444da', purple:'#841bb9',
  'light pink':'#fcbaff', 'hot pink':'#ff8cd0', gray:'#9e9e9e' };

// Measured from jev on these exact tweets.
const DATA = [
  ['stormseeker', "absolutely furious. they cancelled the flight AGAIN with no explanation and now i'm stuck here for 9 hours", [['red',1]]],
  ['ops_notices', "reminder that the quarterly compliance training is due friday. takes about 20 minutes.", [['gray',1]]],
  ['nightowl', "can't sleep. keep replaying that conversation. why did i say that. why did i say that.", [['dark blue',0.53],['indigo',0.47]]],
  ['catlogic', "my cat has decided the printer is her enemy and attacks it every time it makes a noise 😹", [['yellow',0.70],['orange',0.21],['hot pink',0.09]]],
  ['boxofphotos', "found a shoebox of disposable camera photos from 2003. everyone looks so young and the colours are all wrong.", [['indigo',0.38],['light pink',0.30],['brown',0.19],['orange',0.13]]],
];

const LEVELS = [0.10, 0.20, 0.30, 0.45, 0.70];
const DEFAULT = 0.45;

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255}, ${(n>>8)&255}, ${n&255}, ${a.toFixed(3)})`; };

function washCss(id, layers, intensity) {
  const r = rng(hash(id));
  const angle = Math.floor(r() * 360);
  const peak = Math.min(0.62, 0.30 * intensity);
  const stops = []; let at = 0;
  layers.forEach(({ hex, weight }, i) => {
    const span = weight * 100;
    const a = peak * (0.5 + 0.5 * weight);
    if (i === 0) stops.push(`${rgba(hex, a)} 0%`);
    stops.push(`${rgba(hex, a)} ${(at + span / 2).toFixed(1)}%`);
    at += span;
    if (i === layers.length - 1) stops.push(`${rgba(hex, a)} 100%`);
  });
  const spectrum = `linear-gradient(${angle}deg, ${stops.join(', ')})`;
  const blooms = layers.slice(0, 3).map(({ hex, weight }) => {
    const x = 10 + r() * 80, y = 10 + r() * 80, w = 90 + r() * 90, h = 220 + r() * 260;
    const a = Math.min(0.55, peak * weight * 0.55);
    return `radial-gradient(ellipse ${w.toFixed(0)}% ${h.toFixed(0)}% at ${x.toFixed(0)}% ${y.toFixed(0)}%, ${rgba(hex, a)} 0%, ${rgba(hex, a*0.4)} 45%, ${rgba(hex, 0)} 80%)`;
  });
  return [...blooms, spectrum].join(', ');
}

const section = (intensity) => {
  const cards = DATA.map(([handle, text, mix], i) => {
    const layers = mix.map(([name, weight]) => ({ name, hex: PALETTE[name], weight }));
    return `<article style="background-image:${washCss(String(1000 + i), layers, intensity)}">
      <div class="row"><span class="name">${handle}</span><span class="handle">@${handle}</span><span class="dot">· 2h</span></div>
      <div class="txt">${text.replace(/</g, '&lt;')}</div></article>`;
  }).join('\n');
  const alpha = (0.30 * intensity).toFixed(3);
  return `<section><h2>${intensity.toFixed(2)}${intensity === DEFAULT ? ' &nbsp;<em>new default</em>' : ''}
    <span class="a">peak alpha ${alpha}</span></h2>${cards}</section>`;
};

writeFileSync(new URL('./preview.html', import.meta.url), `<!doctype html>
<meta charset="utf-8"><title>Watercolour intensity ladder</title>
<style>
  :root { --bg:#fff; --fg:#0f1419; --muted:#536471; --line:#eff3f4; }
  body.dark { --bg:#000; --fg:#e7e9ea; --muted:#71767b; --line:#2f3336; }
  body { background:var(--bg); color:var(--fg); font:15px/1.45 -apple-system,system-ui,sans-serif; margin:0; }
  header,section { max-width:620px; margin:0 auto; padding:0 16px; }
  header { padding-top:22px; }
  h1 { font-size:17px; margin:0 0 4px; }
  header p { color:var(--muted); margin:0 0 6px; font-size:13px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
       margin:26px 0 6px; padding-bottom:5px; border-bottom:1px solid var(--line); display:flex; align-items:baseline; }
  h2 em { font-style:normal; color:var(--fg); text-transform:none; letter-spacing:0; }
  .a { margin-left:auto; font:11px ui-monospace,monospace; text-transform:none; letter-spacing:0; }
  article { border-bottom:1px solid var(--line); padding:13px 14px; border-radius:12px;
            background-repeat:no-repeat; background-size:cover; }
  .row { display:flex; gap:8px; align-items:baseline; }
  .name { font-weight:700; } .handle,.dot { color:var(--muted); }
  .txt { margin-top:3px; white-space:pre-wrap; }
  button { position:fixed; top:12px; right:12px; padding:7px 12px; border-radius:8px;
           border:1px solid var(--line); background:var(--bg); color:var(--fg); cursor:pointer; }
</style>
<button onclick="document.body.classList.toggle('dark')">toggle dark</button>
<header>
  <h1>Wash intensity ladder</h1>
  <p>Same five tweets, same washes, five settings. The old minimum was alpha 0.310 — stronger than
  anything below. Pick a row and I will make it the default.</p>
</header>
${LEVELS.map(section).join('\n')}
<div style="height:60px"></div>
`);
console.log('wrote dev/preview.html —', LEVELS.length, 'levels x', DATA.length, 'tweets');

// Renders a standalone preview page with the washes baked in, so the look can be judged
// without loading the extension. Uses the same wash maths as content.js.
import { writeFileSync, readFileSync } from 'node:fs';

const PALETTE = { red:'#dd1706', orange:'#f88100', brown:'#a25900', yellow:'#fad200', green:'#00a02a',
  teal:'#00c7a6', 'dark blue':'#004e60', 'light blue':'#0081f8', indigo:'#3444da', purple:'#841bb9',
  'light pink':'#fcbaff', 'hot pink':'#ff8cd0', gray:'#9e9e9e' };

// Measured from jev on these exact tweets.
const DATA = [
  ['stormseeker', "absolutely furious. they cancelled the flight AGAIN with no explanation and now i'm stuck here for 9 hours", [['red',1]]],
  ['quietfern', "my grandmother passed this morning. she taught me to make bread and i never wrote the recipe down.", [['dark blue',1]]],
  ['maeve_r', "SHE SAID YES!!! 💍 still shaking, best day of my entire life", [['hot pink',0.72],['yellow',0.28]]],
  ['lakeside', "morning fog on the water, nobody else at the lake. just me and a thermos of tea. perfect.", [['teal',0.71],['light blue',0.29]]],
  ['ops_notices', "reminder that the quarterly compliance training is due friday. takes about 20 minutes.", [['gray',1]]],
  ['nightowl', "can't sleep. keep replaying that conversation. why did i say that. why did i say that.", [['dark blue',0.53],['indigo',0.47]]],
  ['catlogic', "my cat has decided the printer is her enemy and attacks it every time it makes a noise 😹", [['yellow',0.70],['orange',0.21],['hot pink',0.09]]],
  ['perf_eng', "shipped the new caching layer today. p99 latency down from 400ms to 38ms.", [['teal',0.68],['light blue',0.27],['green',0.05]]],
  ['boxofphotos', "found a shoebox of disposable camera photos from 2003. everyone looks so young and the colours are all wrong.", [['indigo',0.38],['light pink',0.30],['brown',0.19],['orange',0.13]]],
];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255}, ${(n>>8)&255}, ${n&255}, ${a.toFixed(3)})`; };

function washCss(id, layers, intensity = 1) {
  const r = rng(hash(id));
  const angle = Math.floor(r() * 360);
  const peak = Math.min(0.62, 0.16 + 0.5 * intensity);
  const stops = []; let at = 0;
  layers.forEach(({ hex, weight }, i) => {
    const span = weight * 100;
    const a = peak * (0.55 + 0.45 * weight);
    if (i === 0) stops.push(`${rgba(hex, a)} 0%`);
    stops.push(`${rgba(hex, a)} ${(at + span / 2).toFixed(1)}%`);
    at += span;
    if (i === layers.length - 1) stops.push(`${rgba(hex, a)} 100%`);
  });
  const spectrum = `linear-gradient(${angle}deg, ${stops.join(', ')})`;
  const blooms = layers.slice(0, 3).map(({ hex, weight }) => {
    const x = 10 + r() * 80, y = 10 + r() * 80, w = 90 + r() * 90, h = 220 + r() * 260;
    const a = Math.min(0.55, peak * weight * 0.9);
    return `radial-gradient(ellipse ${w.toFixed(0)}% ${h.toFixed(0)}% at ${x.toFixed(0)}% ${y.toFixed(0)}%, ${rgba(hex, a)} 0%, ${rgba(hex, a*0.4)} 45%, ${rgba(hex, 0)} 80%)`;
  });
  return [...blooms, spectrum].join(', ');
}

const cards = DATA.map(([handle, text, mix], i) => {
  const layers = mix.map(([name, weight]) => ({ name, hex: PALETTE[name], weight }));
  const css = washCss(String(1000 + i), layers);
  const label = mix.map(([n, w]) => `${n} ${Math.round(w * 100)}%`).join(' + ');
  return `<article style="background-image:${css}">
    <div class="row"><span class="name">${handle}</span><span class="handle">@${handle}</span><span class="dot">· 2h</span></div>
    <div class="txt">${text.replace(/</g, '&lt;')}</div>
    <div class="mix">${label}</div>
  </article>`;
}).join('\n');

writeFileSync(new URL('./preview.html', import.meta.url), `<!doctype html>
<meta charset="utf-8"><title>Tweet Watercolour preview</title>
<style>
  :root { --bg:#fff; --fg:#0f1419; --muted:#536471; --line:#eff3f4; }
  body.dark { --bg:#000; --fg:#e7e9ea; --muted:#71767b; --line:#2f3336; }
  body { background:var(--bg); color:var(--fg); font:15px/1.45 -apple-system,system-ui,sans-serif; margin:0; transition:background .2s; }
  header { max-width:620px; margin:0 auto; padding:22px 16px 8px; }
  h1 { font-size:17px; margin:0 0 4px; }
  p { color:var(--muted); margin:0; font-size:13px; }
  #feed { max-width:620px; margin:0 auto; padding-bottom:40px; }
  article { border-bottom:1px solid var(--line); padding:14px 16px; border-radius:12px; background-repeat:no-repeat; background-size:cover; }
  .row { display:flex; gap:8px; align-items:baseline; }
  .name { font-weight:700; } .handle,.dot { color:var(--muted); }
  .txt { margin-top:3px; white-space:pre-wrap; }
  .mix { margin-top:8px; font:11px ui-monospace,monospace; color:var(--muted); opacity:.75; }
  button { position:fixed; top:12px; right:12px; padding:7px 12px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--fg); cursor:pointer; }
</style>
<button onclick="document.body.classList.toggle('dark')">toggle dark</button>
<header><h1>Tweet Watercolour</h1>
<p>Each wash is mixed from jev's probability distribution over the Bitframes palette. The label under each tweet is the actual mix.</p></header>
<div id="feed">
${cards}
</div>
`);
console.log('wrote dev/preview.html');

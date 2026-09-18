// Content script: watches the timeline, feeds a bounded queue, paints washes.
(() => {
  'use strict';

  const CFG = {
    maxQueue: 16,    // tweets held at once; overflow evicts the OLDEST
    batchSize: 8,    // tweets per gateway request (9 measured at 622ms, so this is cheap)
    workers: 1,
    minChars: 12,    // below this there is no mood to read
    tickMs: 120,
    maxRules: 400,   // stylesheet rules kept before the oldest are pruned
  };

  let enabled = true;
  let intensity = 1;
  let debug = true;

  const log = (...a) => { if (debug) console.log('%c[hue]', 'color:#841bb9;font-weight:600', ...a); };
  const warn = (...a) => console.warn('%c[hue]', 'color:#dd1706;font-weight:600', ...a);

  const washes = new Map();   // tweetId -> { choice, layers }
  const inflight = new Set();
  const visible = new Map();
  const queue = [];
  let activeWorkers = 0;
  let painted = 0;

  // ---------------------------------------------------------------------------
  // Every wash is a different colour, so it cannot live in a static stylesheet, and it cannot
  // be an inline style either: React owns the `style` attribute on these nodes and wipes it.
  // So each tweet gets its own RULE, keyed by a data attribute. React leaves data-* attributes
  // it did not set alone, which is the one thing we know survives a rerender.
  // ---------------------------------------------------------------------------
  const sheet = document.createElement('style');
  sheet.id = 'jev-watercolour';
  document.documentElement.appendChild(sheet);
  const rules = new Map();
  let flushQueued = false;

  // setTimeout, not requestAnimationFrame. rAF is suspended in a hidden tab, so with the
  // timeline open in a background tab the flush never ran and the stylesheet stayed empty --
  // every tweet tagged, none painted. Writing a stylesheet is not animation work anyway.
  function flush() {
    if (flushQueued) return;
    flushQueued = true;
    setTimeout(() => {
      flushQueued = false;
      if (rules.size > CFG.maxRules) {
        for (const k of [...rules.keys()].slice(0, rules.size - CFG.maxRules)) rules.delete(k);
      }
      sheet.textContent = [...rules.values()].join('\n');
    }, 16);
  }

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
  };

  // A tweet is short and wide (roughly 340x45), so percentage-sized ellipses came out as
  // slivers that faded to transparent well inside the element -- the first version was almost
  // invisible and raising the intensity multiplier did nothing, because the problem was
  // coverage, not opacity.
  //
  // So the wash is built in two parts: a linear spectrum underneath, whose stops are sized by
  // each colour's weight and which is guaranteed to cover the whole element, and a couple of
  // oversized radial blooms on top for the mottling that makes it read as paint rather than
  // as a UI gradient. Angle and bloom placement are seeded from the tweet id, so a tweet looks
  // identical every time it scrolls back into view.
  function washCss(id, layers) {
    const r = rng(hash(id));
    const angle = Math.floor(r() * 360);
    const peak = Math.min(0.62, 0.16 + 0.5 * intensity);

    // Spectrum: each colour takes a share of the sweep proportional to its weight.
    const stops = [];
    let at = 0;
    layers.forEach(({ hex, weight }, i) => {
      const span = weight * 100;
      const a = peak * (0.55 + 0.45 * weight);
      if (i === 0) stops.push(`${rgba(hex, a)} 0%`);
      stops.push(`${rgba(hex, a)} ${(at + span / 2).toFixed(1)}%`);
      at += span;
      if (i === layers.length - 1) stops.push(`${rgba(hex, a)} 100%`);
    });
    const spectrum = `linear-gradient(${angle}deg, ${stops.join(', ')})`;

    // Blooms: deliberately oversized so they reach past the element on a short wide box.
    const blooms = layers.slice(0, 3).map(({ hex, weight }) => {
      const x = 10 + r() * 80;
      const y = 10 + r() * 80;
      const w = 90 + r() * 90;
      const h = 220 + r() * 260;
      const a = Math.min(0.55, peak * weight * 0.9);
      return `radial-gradient(ellipse ${w.toFixed(0)}% ${h.toFixed(0)}% at ${x.toFixed(0)}% ${y.toFixed(0)}%, ` +
             `${rgba(hex, a)} 0%, ${rgba(hex, a * 0.4)} 45%, ${rgba(hex, 0)} 80%)`;
    });

    // Blooms first so they sit above the spectrum in CSS layer order.
    return [...blooms, spectrum].join(', ');
  }

  function paint(el, id) {
    const w = washes.get(id);
    if (!enabled || !w?.layers?.length) return;
    el.dataset.jevHue = id;
    const rule = `article[data-jev-hue="${id}"]{background-image:${washCss(id, w.layers)}!important;` +
                 `background-repeat:no-repeat!important;background-size:cover!important;}`;
    if (rules.get(id) !== rule) { rules.delete(id); rules.set(id, rule); flush(); }
  }

  function unpaintAll() {
    rules.clear();
    sheet.textContent = '';
    document.querySelectorAll('[data-jev-hue]').forEach((el) => delete el.dataset.jevHue);
  }

  chrome.storage.local.get({ enabled: true, intensity: 1, debug: true, apiKey: '' }).then((s) => {
    enabled = s.enabled; intensity = s.intensity; debug = s.debug;
    log(`active — batch ${CFG.batchSize}, queue ${CFG.maxQueue}, intensity ${intensity}`);
    if (!s.apiKey) warn('no API key set — open the extension popup and paste your Vercel AI Gateway key');
  });

  chrome.storage.onChanged.addListener((c) => {
    if (c.debug) debug = c.debug.newValue;
    if (c.intensity) {
      intensity = c.intensity.newValue;
      rules.clear();
      for (const [id, el] of visible) if (washes.has(id)) paint(el, id);
      flush();
    }
    if (c.enabled) {
      enabled = c.enabled.newValue;
      if (!enabled) unpaintAll(); else scan();
      log(enabled ? 'enabled' : 'disabled');
    }
  });

  const idOf = (a) => { const l = a.querySelector('a[href*="/status/"]'); const m = l && l.getAttribute('href').match(/\/status\/(\d+)/); return m ? m[1] : null; };
  const textOf = (a) => { const n = a.querySelector('[data-testid="tweetText"]'); return n ? n.innerText.trim() : ''; };

  function drop(id) { const i = queue.indexOf(id); if (i !== -1) queue.splice(i, 1); }

  function enqueue(id) {
    if (washes.has(id) || inflight.has(id) || queue.includes(id)) return;
    queue.push(id);
    // Scroll fast and older unpainted tweets fall out the far end rather than being paid for
    // long after they left the screen.
    while (queue.length > CFG.maxQueue) drop(queue[0]);
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = idOf(e.target);
      if (!id) continue;
      if (e.isIntersecting) {
        visible.set(id, e.target);
        if (washes.has(id)) paint(e.target, id); else enqueue(id);
      } else {
        visible.delete(id);
        drop(id);
      }
    }
  }, { rootMargin: '250px 0px' });

  function scan() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach((el) => {
      if (!el.dataset.jevSeen) { el.dataset.jevSeen = '1'; io.observe(el); }
      const id = idOf(el);
      if (id && washes.has(id)) paint(el, id);  // reapply after a rerender, from cache
    });
  }

  // childList alone is not enough: Twitter rewrites className on hover and rerender, and an
  // attribute mutation does not fire a childList observer.
  let scanQueued = false;
  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => { scanQueued = false; scan(); }, 16);  // see flush(): rAF stalls when hidden
  };
  new MutationObserver(queueScan).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
  });
  scan();

  async function pump() {
    if (!enabled || activeWorkers >= CFG.workers) return;

    // Top up from what is on screen. A tweet evicted by queue overflow while still visible
    // would otherwise never be painted: it stays intersecting, so no new IntersectionObserver
    // event ever fires to re-enqueue it, and it sits blank forever. That is exactly what
    // happened to the first tweet in a nine-tweet viewport with a queue of eight.
    for (const id of visible.keys()) {
      if (!washes.has(id) && !inflight.has(id) && !queue.includes(id)) enqueue(id);
    }

    const batch = [];
    while (queue.length && batch.length < CFG.batchSize) {
      const id = queue.shift();
      if (!visible.has(id) || washes.has(id) || inflight.has(id)) continue;
      const text = textOf(visible.get(id));
      if (text.length < CFG.minChars) { washes.set(id, { layers: [] }); continue; }
      batch.push({ id, text });
    }
    if (!batch.length) return;

    activeWorkers++;
    batch.forEach((b) => inflight.add(b.id));
    const t0 = performance.now();
    try {
      const res = await chrome.runtime.sendMessage({ type: 'colour', items: batch });
      const ms = Math.round(performance.now() - t0);
      if (!res?.ok) {
        const err = res?.error ?? 'no response from service worker';
        if (err === 'no-key') warn('no API key set — open the popup and paste your key');
        else if (err === 'timeout') warn(`batch of ${batch.length} timed out after 8s — left unpainted`);
        else warn(`batch of ${batch.length} failed: ${err}`, res?.detail ?? '');
        return;
      }
      log(`painted ${Object.keys(res.washes).length} in ${ms}ms${res.cost ? `, $${res.cost.toFixed(6)}` : ''}`);
      for (const [id, w] of Object.entries(res.washes)) {
        washes.set(id, w);
        painted++;
        const mix = w.layers.map((l) => `${l.name} ${(l.weight * 100).toFixed(0)}%`).join(' + ');
        log(`%c  ${w.choice}%c  ${mix}`, `color:${w.layers[0]?.hex};font-weight:700`, 'color:inherit');
        const el = visible.get(id);
        if (el) paint(el, id);
      }
    } catch (e) {
      warn('message to service worker failed:', e.message);
    } finally {
      activeWorkers--;
      batch.forEach((b) => inflight.delete(b.id));
    }
  }

  setInterval(pump, CFG.tickMs);
})();

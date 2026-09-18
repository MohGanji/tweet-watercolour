// Service worker: the only place that holds the API key and talks to the gateway.
// MV3 content scripts are bound by page CORS, so every request is funnelled here.

import { questionFor, PALETTE } from './palette.js';

const ENDPOINT = 'https://ai-gateway.vercel.sh/v4/ai/evaluation-model';
const MODEL = 'typesafe-ai/jev';

// jev's median is ~300ms but its tail is brutal: one call in eight has been seen to stall for
// 151s. A wash that arrives a minute late is worthless, so give up and let the tweet stay plain.
const TIMEOUT_MS = 8000;

// Anything below this is noise in the mix and only muddies the wash.
const MIN_WEIGHT = 0.04;
const MAX_LAYERS = 5;

async function colourBatch(items) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) return { ok: false, error: 'no-key' };

  const state = items.map((it, i) => ({ tweet: i, text: it.text }));
  const questions = Object.fromEntries(items.map((_, i) => ['c' + i, questionFor(i)]));

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'ai-model-id': MODEL,
        'ai-evaluation-model-specification-version': '4',
        'ai-gateway-protocol-version': '0.0.1',
      },
      body: JSON.stringify({ state, questions, providerOptions: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'timeout' : String(e) };
  }
  if (!res.ok) return { ok: false, error: `http-${res.status}`, detail: (await res.text()).slice(0, 300) };

  const data = await res.json();
  const washes = {};
  items.forEach((it, i) => {
    const a = data.answers?.['c' + i];
    if (!a?.probabilities) return;
    // The distribution IS the gradient. Keep the meaningful weights, renormalise, and hand
    // the content script colours rather than colour names.
    const kept = Object.entries(a.probabilities)
      .filter(([, p]) => p >= MIN_WEIGHT)
      .sort((x, y) => y[1] - x[1])
      .slice(0, MAX_LAYERS);
    const total = kept.reduce((s, [, p]) => s + p, 0) || 1;
    washes[it.id] = {
      choice: a.choice,
      layers: kept.map(([name, p]) => ({ name, hex: PALETTE[name], weight: p / total })),
    };
  });

  const cost = Number(data.providerMetadata?.gateway?.cost ?? 0);
  bumpStats(items.length, cost);
  return { ok: true, washes, cost, usage: data.usage };
}

async function bumpStats(painted, cost) {
  const s = await chrome.storage.local.get({ statPainted: 0, statCost: 0 });
  await chrome.storage.local.set({
    statPainted: s.statPainted + painted,
    statCost: s.statCost + (Number.isFinite(cost) ? cost : 0),
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'colour') {
    colourBatch(msg.items).then(sendResponse);
    return true; // keep the channel open for the async reply
  }
});

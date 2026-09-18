import { PALETTE } from './palette.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { apiKey: '', enabled: true, debug: true, intensity: 1, statPainted: 0, statCost: 0 };

$('swatches').innerHTML = Object.values(PALETTE)
  .map((hex) => `<i style="background:${hex}" title="${hex}"></i>`).join('');

chrome.storage.local.get(DEFAULTS).then((s) => {
  $('key').value = s.apiKey;
  $('enabled').checked = s.enabled;
  $('debug').checked = s.debug;
  $('intensity').value = s.intensity;
  $('intensityVal').textContent = Number(s.intensity).toFixed(1);
  $('painted').textContent = s.statPainted;
  $('cost').textContent = s.statCost.toFixed(4);
});

for (const id of ['enabled', 'debug']) {
  $(id).addEventListener('change', () => chrome.storage.local.set({ [id]: $(id).checked }));
}

$('intensity').addEventListener('input', () => {
  const v = Number($('intensity').value);
  $('intensityVal').textContent = v.toFixed(1);
  chrome.storage.local.set({ intensity: v });
});

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ apiKey: $('key').value.trim() });
  $('saved').classList.add('on');
  setTimeout(() => $('saved').classList.remove('on'), 1200);
});

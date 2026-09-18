// Bitframes palette 0x00 "Colorful" — https://github.com/mattdesl/bitframes
// Thirteen chromatic slots (the background/black/white slots are left out: they are the page,
// not a mood). Each gets a one-line sense description, which is the entire prompt.
//
// The gradient comes from jev's PROBABILITIES, not its choice. A choice question returns a
// weight for every option, so one call yields a distribution across the whole palette — and a
// distribution over colours is already a gradient. Tweets with a single strong feeling spike
// to one colour and wash flat; ambivalent ones spread across three or four and come out
// genuinely mixed. Nothing had to be built for that; it falls out of the answer shape.

export const PALETTE = {
  red: '#dd1706',
  orange: '#f88100',
  brown: '#a25900',
  yellow: '#fad200',
  green: '#00a02a',
  teal: '#00c7a6',
  'dark blue': '#004e60',
  'light blue': '#0081f8',
  indigo: '#3444da',
  purple: '#841bb9',
  'light pink': '#fcbaff',
  'hot pink': '#ff8cd0',
  gray: '#9e9e9e',
};

export const SENSES = {
  red: 'anger, alarm, urgency, blood, heat',
  orange: 'energy, warmth, enthusiasm, autumn',
  brown: 'earth, dullness, routine, wood, decay',
  yellow: 'joy, brightness, sunlight, optimism',
  green: 'growth, nature, health, envy, calm life',
  teal: 'clarity, cool water, freshness, poise',
  'dark blue': 'sadness, depth, night, solemnity, grief',
  'light blue': 'openness, sky, clarity, ease',
  indigo: 'thought, introspection, mystery, distance',
  purple: 'imagination, strangeness, luxury, the surreal',
  'light pink': 'tenderness, affection, softness, innocence',
  'hot pink': 'excitement, flirtation, loudness, delight',
  gray: 'neutrality, boredom, bureaucracy, flatness, the unremarkable',
};

export const questionFor = (i) => ({
  type: 'choice',
  instructions:
    `What colour is tweet #${i}? Judge by its feeling, mood and imagery, the way a painter ` +
    `would choose a wash for it — not by any colour words it happens to contain.`,
  criteria: SENSES,
});

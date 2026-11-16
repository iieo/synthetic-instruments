// Wave RAM images: 32 steps of 4 bits, written as 32 hex digits.
const hex = (s) => Uint8Array.from(s, (c) => parseInt(c, 16));

export const WAVES = {
  'soft-bass': hex('9bdefffeeddccbba9865432100001347'),
  organ: hex('8dfeeecaaa99a9757a86566555311102'),
  saw: hex('00112233445566778899aabbccddeeff'),
  'square-ish': hex('9cefffffffffffeca630000000000013'),
  'vocal-a': hex('7889987788887777887667788602fe86'),
  'vocal-o': hex('8887788998788877678988886303efc9'),
  'vocal-e': hex('9856476889876655577979541010fbeb'),
  'bell-0': hex('fcb97888dd988ac8479ac9871046765a'),
  'bell-1': hex('ffdb999beecaabb978abba851025668c'),
  'bell-2': hex('effdccdeffeddccba99aa8631012469c'),
  'bell-3': hex('bcdeeefffffedcba9987543100013579'),
  'harp-0': hex('fdcbabaa99b98a988897797776652019'),
  'harp-1': hex('efeccccbbbbaaaa99988777766541039'),
  'harp-2': hex('ceffeddddccbbaa99887765554210148'),
  'harp-3': hex('acefffeeeddccba99876554321000247'),
  'harp-4': hex('9bceffffeeedcba98765432210001346'),
  'harp-5': hex('89bcdeffffedcba98754321000012356'),
};
// Pulse tables with 1 to 16 of 32 steps high.
for (let k = 1; k <= 16; k++) WAVES[`pulse-${k}`] = Uint8Array.from({ length: 32 }, (_, i) => (i < k ? 15 : 0));

const range = (pre, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${pre}${a + i}`);

// waves: the sequence the sound driver writes into wave RAM; anim: how it walks through it
// ('once' stops at the end, 'loop', 'pingpong'), frames: driver frames per wave at morph 0.5.
// shifts: [frame, volume shift added to the chosen one]; a total of 3 or more mutes and ends the note.
export const PRESETS = {
  'soft-bass': { waves: ['soft-bass'], gain: 1.52 },
  organ: { waves: ['organ'], gain: 1.27 },
  saw: { waves: ['saw'], gain: 0.877 },
  'square-ish': { waves: ['square-ish'], gain: 1.12 },
  vocal: { waves: ['vocal-a', 'vocal-o', 'vocal-e', 'vocal-o'], anim: 'loop', frames: 14, gain: 0.894 },
  bell: {
    waves: range('bell-', 0, 3), anim: 'once', frames: 9, gain: 1.33,
    shifts: [[0, 0], [14, 1], [40, 2], [90, 3]],
  },
  'bit-harp': {
    waves: range('harp-', 0, 5), anim: 'once', frames: 3, gain: 1.19,
    shifts: [[0, 0], [10, 1], [28, 2], [70, 3]],
  },
  'pwm-sweep': { waves: range('pulse-', 1, 16), anim: 'pingpong', frames: 2, gain: 0.8 },
};

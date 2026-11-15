import { SR } from '../../lib/audio.mjs';
import { OnePole } from '../synth/dsp.mjs';

// Number of seconds until the echoes have fallen below about -66 dB.
export function echoTail({ time, feedback, mix }) {
  if (!time || !mix) return 0;
  const k = Math.ceil(Math.log(5e-4 / mix) / Math.log(Math.max(1e-3, feedback)));
  return Math.min(4, Math.max(1, k) * time);
}

// Ping-pong echo with a fixed time in seconds (no tempo sync). The first repeat comes on the left,
// the next on the right; each pass through the loop is band-limited, so later repeats get darker
// and thinner like a tape or bucket-brigade echo.
export function pingPong(L, R, { time, feedback, mix, lp = 3800, hp = 220 }) {
  if (!time || !mix) return;
  const d = Math.max(1, Math.round(time * SR));
  const bl = new Float64Array(d), br = new Float64Array(d);
  const flp = new OnePole(lp), fhp = new OnePole(hp);
  for (let i = 0; i < L.length; i++) {
    const k = i % d;
    const outL = bl[k], outR = br[k];
    const inMono = 0.5 * (L[i] + R[i]);
    bl[k] = fhp.hp(flp.lp(inMono + feedback * outR));
    br[k] = outL;
    L[i] += mix * outL;
    R[i] += mix * outR;
  }
}

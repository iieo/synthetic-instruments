# Hardstyle Kick

Eine gestimmte Bassdrum für Hardstyle und Rave: ein sauberer Punch mit schnellem Pitch-Sweep, danach
ein verzerrter Tail, der genau auf dem gespielten Ton steht. Damit spielt die Kick selbst die
Basslinie. Alles entsteht aus Oszillator, Filtern und Verzerrerstufen, ohne Samples.

```js
import { render, meta } from './instruments/hardstyle-kick.mjs';
const hit = render({ preset: 'euphoric', midi: 30, velocity: 0.9 });        // Float64Array, mono, 48 kHz
const bass = render({ preset: 'raw', midi: 33, duration: 0.36 });           // Tail genau 0,36 s, dann Release
const beat = render({ preset: 'reverse-bass', midi: 30, bpm: 150 });        // eine Viertel: Kick plus Swell
```

`meta.presets` ist `['euphoric', 'raw', 'reverse-bass']`, `meta.range` ist `[28, 52]` (E1 bis E3).
Gleicher Seed, gleiche Samples. Jeder Schlag beginnt und endet bei exakt null.

Demo: `node demos/hardstyle-kick.mjs` schreibt `out/hardstyle-kick.wav` (26 s). Erst jedes Preset
allein, dann acht Takte mit 150 BPM, in denen die Kick eine eigene Basslinie spielt (vier Takte
`euphoric`, vier Takte `raw`), zum Schluss vier Takte `reverse-bass` auf derselben Linie.

## Parameter

| Parameter | Bedeutung |
| --- | --- |
| `preset` | `euphoric`, `raw`, `reverse-bass` |
| `midi` | Ton des Tails. Auch der Sweep endet auf diesem Ton |
| `velocity` | 0 bis 1. Pegel, Tiefe des Sweeps, Drive und Klick |
| `seed` | Kleine Streuung der Sweep-Zeit und Rauschen im Klick |
| `duration` | Gate in Sekunden: so lange klingt der Tail, danach folgt der Release. Ohne Angabe 0,45 bis 0,5 s |
| `bpm` | Nur `reverse-bass` ohne `duration`: Länge einer Viertel |
| `oversample` | Überabtastung der Verzerrung, Standard 8 (nur für Messungen ändern) |

In einer Basslinie bekommt jede Kick `duration = Viertel − Release`, dann endet sie vor der nächsten
und die Kicks überlappen nicht, wie bei einem monophonen Kick-Kanal.

## Signalweg

1. **Oszillator.** Ein Sinus mit stetiger Phase, dessen Frequenz im Logarithmus fällt:
   `f(t) = fT · 2^(a·e^(−t/τ1) + b·e^(−t/τ2))`. `fT` ist der gespielte Ton, der langsame Term
   (τ1 16 bis 24 ms, drei bis dreieinhalb Oktaven) ist der Körper, der schnelle (τ2 1,2 ms) der
   Punch. Weil der Sinus phasenstetig in den Ton übergeht, gibt es zwischen Punch und Tail keinen
   Bruch. Der Oszillator läuft direkt mit 384 kHz.
2. **Punch.** Derselbe Sinus, unverzerrt, hält 15 bis 20 ms und fällt dann mit 25 bis 30 ms ab.
3. **Tail.** Derselbe Sinus mit einer langsam fallenden Drive-Hüllkurve geht durch Vorfilter und
   eine Kette von Verzerrerstufen, alles achtfach überabgetastet:
   - `soft`: die glatte Sigmoide `x/√(1+x²)` mit Arbeitspunkt-Verschiebung für gerade Obertöne,
   - `clip`: kubische Begrenzung mit stetiger Steigung,
   - `fold`: Sinusfalter, der die Welle oberhalb einer Vierteldrehung zurückbiegt.
   Der statische Anteil der Verschiebung wird abgezogen, Stille bleibt null. Zwischen den Stufen
   sitzen Glockenfilter, die bestimmen, welche Obertöne in die nächste Stufe laufen.
   Der Tail wird über 12 bis 30 ms eingeblendet, während der Punch abklingt.
4. **Dezimierung.** Kaiser-Sinc-FIR, eben bis 20 kHz, mindestens 100 dB Dämpfung ab 24 kHz.
5. **Nachbearbeitung bei 48 kHz.** Klangfilter je Preset, Hochpass 24 Hz, Klick (bandpassgefiltertes
   Rauschen plus eine Periode eines hohen Sinus), fester Ausgangspegel, Raised-Cosine-Kanten.

### Presets

| Preset | Kette | Charakter |
| --- | --- | --- |
| `euphoric` | soft (8, Bias 0,2), Glocke 750 Hz, soft (2), Tiefpass 4,2 kHz | runder Tail mit Mitten, deutlicher Punch |
| `raw` | soft (12, Bias 0,35), Glocke +9 dB bei 1,3 kHz, fold (1,7), clip (1,4), Tiefpass 7 kHz | dicht, kreischend, Verzerrung schon ab dem Anschlag |
| `reverse-bass` | Kick wie `euphoric`, kurz; Swell mit soft (8), Glocke 900 Hz, clip | Kick auf dem Schlag, rückwärts laufender Bass auf dem Offbeat |

### Reverse Bass

Eine Viertel wird geteilt. In der ersten Hälfte liegt eine kurze Kick. Für die zweite wird nur der
verzerrte Tail gerechnet (ohne Punch und Klick, mit schnell abklingender Hüllkurve und einem
kleinen Pitch-Abfall), dann zeitlich umgedreht. So schwillt er auf dem Offbeat an, steigt dabei
leicht in den Ton hinein und reißt kurz vor der nächsten Kick ab (4 ms Raised-Cosine). Nach dem
Umdrehen läuft ein zweiter Hochpass, sonst bliebe vom ersten ein Gleichanteil übrig.

## Messungen

**Pegel.** Jedes Preset, jeder Ton von 28 bis 52, Velocity 1 und 0,5, Gate Standard, 0,1 s und 1,5 s:
höchste Spitze −1,4 dBFS (`reverse-bass`), −1,5 (`raw`), −1,7 (`euphoric`). Kein NaN, erstes und
letztes Sample immer exakt null. Der feste Pegel pro Preset kommt aus dieser Messung, normiert wird
pro Ton nicht. Größter Sprung von Sample zu Sample 0,34 (der Klick bei `raw`).

**Aliasing.** Gerendert mit Gate 1 s, Spektrum des Tails von 0,2 bis 0,7 s (Blackman-Harris),
Energie oberhalb 500 Hz, die mehr als 14 Hz neben jedem Vielfachen des Grundtons liegt. Das ist
gespiegelte Energie, weil der Tail sonst rein harmonisch ist:

| Fall | 1-fach | 2-fach | 8-fach | 32-fach |
| --- | --- | --- | --- | --- |
| `raw`, Ton 52 | −55 dB | −75 dB | −90 dB | −90 dB |
| `raw`, Ton 31 | −85 dB | −89 dB | −89 dB | −89 dB |
| `euphoric`, Ton 31 und 52 | −88 dB | −88 dB | −88 dB | −88 dB |

Achtfach liegt schon auf dem Messboden der 32-fachen Referenz. Im Spektrogramm der Demo gibt es keine
fallenden Spiegellinien.

**Demo** (`out/hardstyle-kick.wav`): −14,3 LUFS integriert, LRA 3,1 LU, Spitze −1,0 dBFS, True Peak
−1,0 dBTP, Gleichanteil 6·10⁻⁵, größter Sprung 0,35. Normalisiert wird linear auf −1 dBFS, höchstens
−0,5 dBTP, ohne Limiter.

## Grenzen

- Die Verzerrerstufen sind statische Kennlinien mit Filtern dazwischen, kein Schaltungsmodell.
- Der Tail hat eine feste Hüllkurve. Lautstärkekurven, wie man sie in Produktionen mit der Hand
  zeichnet, gibt es nicht.
- Sehr hohe Töne (über etwa 47) klingen eher nach Bass-Synth als nach Kick, weil der Sweep auf dem
  hohen Ton endet.

## Quellen

- V. Zavalishin: The Art of VA Filter Design, Native Instruments 2012.
- J. F. Kaiser: Nonrecursive Digital Filter Design Using the I0-sinh Window Function, Proc. IEEE
  ISCAS 1974.
- F. J. Harris: On the Use of Windows for Harmonic Analysis with the Discrete Fourier Transform,
  Proc. IEEE 66 (1), 1978.
- R. Bristow-Johnson: Cookbook Formulae for Audio EQ Biquad Filter Coefficients.

Filter, Dezimierung und True Peak kommen aus `instruments/techno-kick/dsp.mjs`. Der Code ist
vollständig selbst geschrieben.

# Breakbeat

Ein Drum'n'Bass- und Jungle-Kit, von Grund auf synthetisiert: kurze Kick, enge Snare mit Körper,
Ghost-Snare, Hi-Hat und Ride. Dazu ein eigenes, synkopiertes Two-Step-Pattern. Kein Break wird
abgespielt oder nachgebaut, jede Stimme kommt aus Oszillatoren, Rauschen und Filtern.

```js
import { render, renderBreak, meta } from './instruments/breakbeat.mjs';
const snare = render({ voice: 'snare', velocity: 0.9, seed: 3 });         // Float64Array, mono
const loop = renderBreak({ bpm: 174, bars: 8, seed: 5, withRide: true });  // [L, R]
```

`meta.voices` ist `['kick', 'snare', 'ghost', 'hat', 'ride']`. Gleicher Seed, gleiche Samples.
Jeder Schlag beginnt und endet bei exakt null.

Demo: `node demos/breakbeat.mjs` schreibt `out/breakbeat.wav` (30 s, stereo). Erst jede Stimme mit
zwei Velocities, dann acht Takte Pattern mit 174 BPM auf Hi-Hats, dann acht Takte mit Ride.

## Parameter

| Parameter | Bedeutung |
| --- | --- |
| `voice` | `kick`, `snare`, `ghost`, `hat`, `ride` |
| `velocity` | 0 bis 1. Pegel (Potenz 1,3), Sweep der Kick, Drive der Snare, Helligkeit der Hats |
| `seed` | Streuung von Frequenzen, Rauschen und Teiltönen |
| `tune` | Halbtöne, nur `kick`, `snare`, `ghost`, gemessen von −12 bis +12 |
| `decay` | Faktor auf die Abklingzeiten, 0,25 bis 3 (Werte außerhalb werden begrenzt) |

`renderBreak({ bpm, bars, seed, velocity, withRide, fill, tail })` gibt `[L, R]` zurück. `withRide`
legt die Ride auf die Viertel, `fill` macht den letzten Takt zum Fill, `tail` hängt Sekunden an.

## Stimmen

- **Kick.** Ein phasenstetiger Sinus fällt in etwa 15 ms um gut zwei Oktaven auf 54 Hz, mit einem
  noch schnelleren Chirp am Anfang. Hält 12 ms, klingt dann mit 75 ms ab. Eine sanfte Sättigung
  (`x/√(1+x²)`) läuft vierfach überabgetastet. Dazu ein Klick aus bandpassgefiltertem Rauschen bei
  4,2 kHz. Kurz und trocken, damit sie bei 170 BPM Platz lässt.
- **Snare.** Drei Moden des Fells bei 205, 328 und 462 Hz mit kurzem Pitch-Abfall (der Schlag
  spannt das Fell kurz nach), die Teppichsaiten als Rauschen durch einen Bandpass bei 4,8 kHz
  (Abklingzeit 65 ms plus ein leiser, langsamer Anteil) und ein Crack aus hochpassgefiltertem
  Rauschen mit 3,5 ms. Die Summe geht vierfach überabgetastet durch die Sättigung, das macht den
  Anschlag dicht und eng.
- **Ghost.** Dieselbe Snare, nur angetippt: weniger Körper, kaum Crack, Teppich klingt nach 35 ms ab,
  fester Pegel etwa 6 dB unter der Snare.
- **Hat.** 28 Sinus-Teiltöne zwischen 3 und 14 kHz, paarweise leicht verstimmt, dazu Rauschen über
  7 kHz, Abklingzeit 24 ms, Hochpass um 6,5 kHz.
- **Ride.** 280 Sinus-Teiltöne zwischen 700 Hz und 16 kHz, paarweise um 0,7 bis 3 Hz verstimmt, so
  dass sie gegeneinander schweben. Hohe Teiltöne klingen schneller ab. Drei Glockenteiltöne,
  Rauschen über 6 kHz für das Waschen und ein kurzer Stockanschlag. Die Teiltöne laufen als
  gedämpfte Drehung (zwei Multiplikationen pro Sample), nicht über `Math.sin`.

Alle Oszillatoren sind Sinus, also bandbegrenzt. Die Sättigung läuft vierfach überabgetastet mit
Kaiser-Filtern (100 dB).

## Pattern

16 Schritte pro Takt, selbst geschrieben. Grundidee Two-Step: Kick auf 1 und auf der „und“ der 3,
Snare auf 2 und 4, Ghosts dazwischen. Vier Taktvarianten:

| Takt | Kick | Snare | Ghost |
| --- | --- | --- | --- |
| A | 0, 10 | 4, 12 | 7, 14 |
| B | 0, 10, 11 | 4, 12 | 9, 15 |
| C | 0, 6, 10 | 4, 12 | 2, 7, 11, 13 |
| D (Fill) | 0, 10 | 4, 12, 14, 15 | 7, 9, 11, 13 |

Reihenfolge A B A C A B C D, der letzte Takt wird zum Fill. Hats auf den Achteln, betont auf dem
Offbeat. Der Seed fügt pro Takt mit 50 % einen Ghost dazu, lässt Ghosts mit 15 % weg, streut
Velocities um ±8 % und setzt Ghosts 2 bis 5 ms zu spät. Velocities werden auf 1/32 gerundet und
jede Stimme wechselt zwischen vier Seeds, dann kommen Wiederholungen aus einem Cache (8 Takte in
etwa 1,2 s). Panorama: Hats 0,3 rechts, Ride 0,35 links, Ghosts leicht rechts.

## Messungen

**Pegel** (40 Seeds, Velocity 1 und 0,6, Tune −12, −4, 0, +4, +12, Decay 0,25 bis 3): höchste
Spitze −1,2 dBFS (Kick), −1,3 (Snare), −6,6 (Ghost), −1,3 (Hat), −1,4 (Ride). Kein NaN, Kanten exakt null, Gleichanteil unter
3·10⁻⁴. Größter Sprung 1,29 bei der Hat und 0,87 bei der Ride: beides breitbandiges hohes Rauschen,
dort sind große Sprünge zwischen benachbarten Samples normal. `renderBreak` bei Velocity 1: höchste
Spitze −2,3 dBFS.

**Demo** (`out/breakbeat.wav`): −14,7 LUFS integriert, LRA 4,7 LU, Spitze −1,0 dBFS, True Peak
−0,7 dBTP, Gleichanteil 9·10⁻⁵, größter Sprung 1,19 (Hats). Linear normalisiert, ohne Limiter.

## Grenzen

- Die Snare ist kein Membranmodell, sondern drei Moden plus gefiltertes Rauschen.
- Keine offene Hi-Hat mit Choke, `decay` verlängert nur die geschlossene.
- Das Pattern ist fest, mit kleinen Zufallsabweichungen. Eigene Patterns baut man mit `render` und
  `mixInto` aus `lib/audio.mjs`.

Filter, Überabtastung und Dezimierung kommen aus `instruments/techno-kick/dsp.mjs`. Der Code ist
vollständig selbst geschrieben.

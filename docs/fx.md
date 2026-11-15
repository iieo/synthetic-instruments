# FX

Übergangseffekte für Rave, Drum'n'Bass und Hardstyle: Riser, Downlifter, Impact, Snare-Roll,
Laser und Sweep. Alles stereo, aus Rauschen, bandbegrenzten Oszillatoren und zeitvarianten Filtern.

```js
import { render, meta } from './instruments/fx.mjs';
const [L, R] = render({ voice: 'riser', bpm: 150, beats: 16 });   // 16 Viertel bei 150 BPM
const boom = render({ voice: 'impact', seconds: 3 });
```

`meta.voices` ist `['riser', 'downlifter', 'impact', 'snareRoll', 'laser', 'sweep']`. Rückgabe ist
immer `[L, R]`. Gleicher Seed, gleiche Samples, erstes und letztes Sample exakt null.

Demo: `node demos/fx.mjs` schreibt `out/fx.wav` (30 s). Erst einzelne Effekte, dann im Kontext:
Riser über 16 Viertel in einen Impact und vier Takte Hardstyle Kick mit Lasern und Sweep, danach
ein Snare-Roll mit 174 BPM in einen Impact mit Breakbeat und einen Downlifter.

## Parameter

| Parameter | Bedeutung |
| --- | --- |
| `voice` | einer der sechs Effekte |
| `velocity` | 0 bis 1, Pegel (Potenz 1,2) |
| `seed` | Rauschen, Phasen der Oszillatoren |
| `bpm` | Tempo für die Länge in Vierteln, Standard 150 |
| `beats` | Länge in Vierteln |
| `seconds` | Länge in Sekunden, hat Vorrang vor `beats` |

Standardlängen: `riser` 8 Viertel, `downlifter` 4, `snareRoll` 8, `sweep` 4, `impact` 2,5 s,
`laser` 0,35 s. Erlaubt sind 0,05 bis 32 s.

## Effekte

- **Riser.** Weißes Rauschen pro Kanal durch einen Bandpass, dessen Mitte exponentiell von 300 Hz auf
  11 kHz steigt, während die Güte von 1 auf 3,5 wächst. Darunter drei verstimmte Sägezähne pro Seite
  (links −11, 0, +7 Cent, rechts −7, 0, +11), die über die Länge zwei Oktaven steigen (A2 bis A4),
  hinter einem Tiefpass, der von 250 Hz auf 9 kHz aufgeht. Rauschen mit `u^2,2`, Ton mit `u^1,6`
  lauter. Am Ende 12 ms Raised-Cosine: er hört genau auf dem Drop auf.
- **Downlifter.** Rauschen durch einen fallenden Tiefpass (12 kHz auf 160 Hz) und ein Sinus, der von
  1,1 kHz auf 45 Hz fällt. Mitte und Seite aus getrenntem Rauschen, die Seite wird mit dem Ausklingen
  schmaler.
- **Impact.** Sub-Boom: ein Sinus fällt in etwa 35 ms von gut 160 Hz auf 34 Hz und klingt über ein
  Drittel der Länge ab. Dazu ein kurzer Rauschstoß unter 5 kHz und eine lange, links und rechts
  unkorrelierte Rauschfahne über 2,5 kHz.
- **Snare-Roll.** Die Snare aus dem Breakbeat auf einem Raster, das sich jedes Viertel der Länge
  verdoppelt: Viertel, Achtel, Sechzehntel, Zweiunddreißigstel. Velocity, Stimmung (bis +7
  Halbtöne) und Lautstärke steigen, die Snare wird kürzer, ein Hochpass geht von 90 auf 700 Hz auf.
  Die Schläge pendeln leicht zwischen links und rechts. Die Startzeit jedes Schlags wird einmal auf
  ein ganzes Sample gerundet.
- **Laser.** Additives Rechteck aus ungeraden Sinus-Harmonischen bis 15, die über 16 kHz ausgeblendet
  werden. Die Grundfrequenz fällt von knapp 4 kHz auf 180 Hz. Rechts 18 Cent höher und 7 ms später,
  das macht ihn breit.
- **Sweep.** Rauschen durch einen Bandpass, der von 200 Hz auf 8 kHz und zurück läuft, mit
  `sin(πu)^1,3` als Hüllkurve, dabei von links nach rechts geschwenkt. Ein leiser gegenphasiger Anteil
  gibt Breite.

Sägezähne mit PolyBLEP-Korrektur, Laser additiv, alle übrigen Töne Sinus. Die Filter sind
Zustandsvariablenfilter in trapezförmiger Diskretisierung mit Frequenz und Güte pro Sample.
Keine Verzerrung, also keine Überabtastung nötig. Jeder Kanal geht am Ende durch einen Hochpass bei
20 Hz und bekommt Raised-Cosine-Kanten.

## Messungen

**Pegel** (16 Seeds, 40, 128, 150, 174 und 300 BPM, außerdem 0,05 s, 0,2 s, 1 s, 4 s, 32 s und
16 Viertel, Velocity 1): höchste Spitze −1,2 dBFS beim Snare-Roll (300 BPM, das dichteste Raster),
−1,5 beim Downlifter, −1,6 bei Impact, Laser und Sweep, −1,7 beim Riser. Kein NaN, Kanten exakt null,
Gleichanteil unter 3·10⁻⁴. Größter Sprung 0,91 (Snare-Roll, Crack der Snare) bis 0,25 (Impact).

**Demo** (`out/fx.wav`): −14,6 LUFS integriert, LRA 11,4 LU (gewollt: Riser und Downlifter bauen
auf und ab), Spitze −1,0 dBFS, True Peak −0,9 dBTP, Gleichanteil 2·10⁻⁶. Linear normalisiert, ohne
Limiter.

## Grenzen

- Kein Hall. Breite kommt nur aus unkorreliertem Rauschen, Verstimmung und Verzögerung.
- Der Snare-Roll läuft auf festem Raster mit vier Stufen. Wer eine andere Kurve will, setzt
  Breakbeat-Snares selbst.

Der Code ist vollständig selbst geschrieben. Filter und True Peak kommen aus
`instruments/techno-kick/dsp.mjs`, die Snare aus `instruments/breakbeat/voices.mjs`.

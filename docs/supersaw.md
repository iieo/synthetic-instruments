# Supersaw

`instruments/supersaw.mjs` ist der breite, euphorische Lead aus Trance, Hardstyle und dem
aktuellen Partyrap mit Rave-Beats. Viele leicht gegeneinander verstimmte Sägezähne schweben
ineinander, und weil jede Stimme links oder rechts liegt, wird daraus eine Wand aus Klang. Es gibt
vier Presets: einen klaren Lead, einen Hymnen-Lead mit Oktave und Quinte, eine langsame Fläche und
einen verzerrten Hardstyle-Lead.

```js
import { render, meta } from './instruments/supersaw.mjs';
// meta.presets: ['lead', 'anthem', 'pad', 'hardlead'], meta.range: [36, 96]
const [L, R] = render({ preset: 'anthem', midi: 74, velocity: 1, duration: 0.8 });
const pad = render({ preset: 'pad', chord: [50, 57, 62, 65], duration: 3 });
const slide = render({ preset: 'hardlead', midi: 62, duration: 1, bend: [[0, 0], [0.5, 0], [0.6, 3]] });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `lead`, `anthem`, `pad` oder `hardlead` |
| `midi` | Tonhöhe als MIDI-Note, 36 bis 96 |
| `chord` | Liste von MIDI-Noten, ersetzt `midi` (alle Töne teilen sich Filter und Hüllkurve) |
| `velocity` | 0 bis 1, steuert Pegel und Öffnung der Filterhüllkurve |
| `duration` | Haltezeit in Sekunden, danach folgt das Release |
| `seed` | Startwert für Phasen und Stimmtoleranzen |
| `bend` | Pitch-Bend in Halbtönen: Zahl, Funktion `t => halbtöne` oder Stützpunkte `[[t, halbtöne], ...]` |
| `glide` | Zeitkonstante des Portamentos in Sekunden, mit dem `bend` und `from` folgen |
| `from` | Starttonhöhe relativ zur Note in Halbtönen, der Ton gleitet von dort hinein (etwa `-12`) |

Das Ergebnis ist ein Paar `[left, right]` aus `Float64Array` bei 48 kHz. Gleiche Parameter
ergeben exakt dasselbe Signal.

## Signalfluss

Alles bis zur Dezimation läuft mit 4facher Überabtastung (192 kHz).

```
Sägezahn-Stapel pro Schicht (Stereo verteilt) -> (Verzerrung) -> Tiefpass 4. Ordnung -> VCA
  -> Dezimation auf 48 kHz -> Hochpass-Kopie ins Seitensignal -> DC-Blocker -> Ausgang
```

### Sägezähne

Jeder Sägezahn ist band-begrenzt mit PolyBLEP: An der Sprungstelle wird über zwei Samples eine
quadratische Korrektur abgezogen, die den harten Sprung durch einen geglätteten ersetzt
(Välimäki und Huovilainen 2007). Die Restspiegelungen dieser Korrektur liegen bei 192 kHz fast
vollständig oberhalb von 24 kHz und gehen im Dezimationsfilter unter. Die Frequenz darf sich von
Sample zu Sample ändern, Bend, Glide und Vibrato brauchen also keinen Sonderweg.

### Der Stapel

Eine Schicht besteht aus 3 bis 9 Sägezähnen. Stimme `j` hat die Position `x` zwischen −1 und 1 und
die Verstimmung

```
cent = spread · x · (0,55 + 0,45·x²) + Toleranz (±0,8 Cent)
```

Die äußeren Stimmen liegen damit weiter außen als bei gleichmäßiger Teilung. Das ergibt eine dichte
Mitte und schnelle Schwebungen an den Rändern. Jede Stimme startet bei einer zufälligen Phase, wie
ein freilaufender Oszillator. So klingt jeder Anschlag ein wenig anders, und es gibt nie den
dünnen, phasengleichen Anfang. Die Mittenstimme hat vollen Pegel, die äußeren etwas weniger.

Die Stimmen werden abwechselnd links und rechts verteilt (Equal-Power-Panning), die Auslenkung
wächst mit dem Abstand von der Mitte. Die am weitesten nach unten und nach oben verstimmten
Stimmen liegen auf gegenüberliegenden Seiten.

### Breite aus dem Seitensignal

Nach der Dezimation wird die Mitte `(L + R)/2` durch einen Hochpass vierter Ordnung bei 900 Hz
geschickt, um 11 ms verzögert und nur dem Seitensignal zugeschlagen (`L += s`, `R −= s`). Oben
herum wird der Klang breiter, der Bass bleibt mono, und in der Monosumme hebt sich die Kopie
vollständig auf.

### Filter

Zwei zustandsvariable Filter (SVF) in Reihe, trapezförmig diskretisiert mit aufgelöster
Rückkopplung (Zavalishin 2012), ergeben einen Tiefpass vierter Ordnung. Das erste hat die
Güte des Presets, das zweite 0,54. Das Filter ist linear und bleibt auch bei Änderungen in jedem
Takt stabil. Die Grenzfrequenz:

```
fc = cut + track · f0 + envAmt · (0,35 + 0,65·v²) · e^(−t/envT)
```

Beim `pad` ist die Hüllkurve umgedreht (`1 − e^(−t/envT)`), das Filter öffnet sich langsam.

### Verzerrung (nur `hardlead`)

Vor dem Filter sitzt eine asymmetrische weiche Begrenzung `tanh(3,2·x + 0,18) − tanh(0,18)`.
Sie erzeugt gerade und ungerade Obertöne und macht den Klang rau und dicht. Danach hebt ein
Bandpass um 1,3 kHz die Mitten an, ein Tiefpass bei 7,5 kHz nimmt das Kratzen weg. Die Verzerrung
läuft bei 192 kHz, ihre zusätzlichen Obertöne fallen also nicht in den hörbaren Bereich zurück.
Den Gleichanteil aus der Asymmetrie entfernt der DC-Blocker am Ende.

### Hüllkurve und Ränder

Attack und Release sind Halbkosinus-Rampen, dazwischen fällt der Pegel exponentiell auf den
Haltewert. Jede Note beginnt und endet exakt bei null. Weil das Dezimationsfilter ein wenig vor
den Anfang schwingt, kommt nach der Dezimation noch eine 1-ms-Einblendung, am Ende eine
20-ms-Ausblendung nach dem DC-Blocker. Die Lautstärke ist eine feste Verstärkung pro Preset, es
gibt keine Normalisierung pro Note und keinen Begrenzer am Ausgang.

## Presets

| Preset | Schichten (Halbton, Pegel, Stimmen, Spreizung) | Hüllkurve | Filter |
| --- | --- | --- | --- |
| `lead` | 0 / 1 / 7 / ±26 ct | 4 ms, Haltewert 0,78, Release 160 ms | 700 Hz + 2,2·f0, Hüllkurve 7,5 kHz, 280 ms |
| `anthem` | 0 / 1 / 7 / ±30, +12 / 0,6 / 7 / ±34, +7 / 0,42 / 5 / ±22 | 6 ms, 0,85, 320 ms | 1 kHz + 2,5·f0, 8,5 kHz, 400 ms |
| `pad` | 0 / 1 / 9 / ±20, −12 / 0,45 / 5 / ±12 | 750 ms, 0,9, 1,3 s | 450 Hz + 1,2·f0, öffnet um 2,2 kHz in 1,1 s |
| `hardlead` | 0 / 1 / 7 / ±38, +12 / 0,35 / 3 / ±18 | 3 ms, 0,82, 120 ms | Verzerrung, dann 1,6 kHz + 3·f0, 9 kHz, 220 ms |

Lead und Hymne bekommen nach 0,3 bis 0,45 s ein leichtes Vibrato (±8 bis ±12 Cent), die Fläche
schwankt sehr langsam (0,18 Hz, ±4 Cent). Die Oktave und die Quinte im `anthem` sind eigene
Stapel mit eigener Verstimmung und eigenen Zufallsphasen, das macht den Hymnenklang so voll.

## Demo

`node demos/supersaw.mjs` schreibt `out/supersaw.wav` (28 s, Stereo, 24 Bit):

- 0 bis 10 s: jedes Preset einzeln, der Hymnen-Lead gleitet beim ersten Ton eine Oktave hinein,
  der Hardstyle-Lead rutscht zwischen drei Tönen
- 10 bis 24 s: acht Takte mit 140 BPM, eine eigene Melodie im Raster 3-3-2-2-2-2-2 auf dem
  Hymnen-Lead über Flächenakkorden in d-Moll
- ab 24 s: zwei Takte Hardstyle-Lead mit 150 BPM und Slides zwischen den Offbeats

Normalisierung mit einer einzigen linearen Verstärkung auf −1 dBFS Spitze, True-Peak unter
−0,6 dBTP. Kein Limiter.

## Messungen

- **Pegel:** Einzelne Noten mit Anschlag 1 von MIDI 36 bis 96 in Zweierschritten, drei Seeds, kurze
  und lange Noten, auch mit `from: -12`: höchste Spitze −1,5 dBFS (`anthem`), −1,9 (`lead`), −2,1
  (`hardlead`), −2,3 (`pad`). Bei Dreiklängen über `chord` können sich die Sägezähne hoch oben
  phasengleich treffen, ohne Schutz bis +0,4 dBFS (`lead`, MIDI 90). Deshalb wird eine Note, deren
  Spitze über −1,2 dBFS läge, als Ganzes linear auf −1,2 dBFS abgesenkt. Höchste Spitze damit
  −1,2 dBFS. Kein NaN, mittlerer Gleichanteil unter 2e−5.
- **Ränder:** erstes und letztes Sample jeder Note exakt null, größter Sprung in den ersten fünf
  Samples 1,5e−5.
- **Aliasing:** Lead und Hardstyle-Lead mit einem Bend über drei Oktaven bis 2,1 kHz Grundton, der
  Hymnen-Lead auf MIDI 96 (Oktavschicht 4,2 kHz). Im Spektrogramm keine abwärts laufenden
  Spiegelfrequenzen oberhalb von −110 dBFS.
- **Tonhöhe:** leistungsgewichtetes Mittel um 440 Hz über drei Seeds: −1,7 bis +1,9 Cent.
- **Stereo:** Korrelation L/R 0,56 (`anthem`) bis 0,68 (`lead`), Pegelverlust in der Monosumme
  0,8 bis 1,1 dB.
- **Demo:** Spitze −1,0 dBFS, True-Peak −1,0 dBTP, integrierte Lautheit −12,5 LUFS.

## Grenzen

- Ein Akkord teilt sich Filter und Hüllkurve, gespielt wird paraphon.
- Die Stimmen driften nicht über die Zeit, nur die Startphasen und eine feste Toleranz sind
  zufällig.
- Kein eingebauter Hall und kein Delay. Das gehört in die Mischung.

## Quellen

- V. Välimäki, A. Huovilainen: Antialiasing Oscillators in Subtractive Synthesis. IEEE Signal
  Processing Magazine 24(2), 2007.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.
- J. F. Kaiser: Nonrecursive Digital Filter Design Using the I0-sinh Window Function. ISCAS 1974.
- ITU-R BS.1770-4: Algorithms to measure audio programme loudness and true-peak audio level, 2015.

Der gesamte Code ist eigenständig geschrieben. Aus den Quellen stammen nur Verfahren, kein Code.

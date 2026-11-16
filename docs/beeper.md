# Beeper

`instruments/beeper.mjs` ist der eingebaute Lautsprecher früher PCs und Heimcomputer. Er kennt nur
zwei Zustände: Ein Bit im Ausgabeport schaltet die Spannung an oder aus. Jeder Ton, jeder Akkord
und jedes Schlagzeug entsteht daraus, dass die CPU dieses Bit im richtigen Moment umschaltet. Dazu
kommt der Piezo-Summer der LCD-Handspiele. Nachgebaut sind die Programmroutinen auf einem
Taktraster und der Lautsprecher dahinter.

Umfang: MIDI 24 bis 96. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/beeper.mjs';
const x = render({ midi: 52, duration: 1, preset: 'chord', chord: 'minor' });
const y = render({ midi: 40, duration: 2, preset: 'pwm' });       // von dünn nach fett
const z = render({ midi: 60, duration: 1, preset: 'pwm', duty: 0.1 });
```

## Parameter

| Parameter | Bedeutung | Standard |
|---|---|---|
| `midi` | Tonhöhe, bei Schlagzeug die Stimmung relativ zu MIDI 60 | 60 |
| `velocity` | 0 bis 1, Lautstärkeregler hinter dem Lautsprecher (linear) | 0,8 |
| `duration` | Notenlänge in Sekunden (0,01 bis 30) | 0,5 |
| `preset` | siehe unten | `'square'` |
| `duty` | 0,02 bis 0,98, feste Pulsbreite für `pwm`; ohne Angabe läuft sie von 3 % auf 50 % | Sweep |
| `chord` | Akkord für `chord` und `pin-pulse`: `major`, `minor`, `sus4`, `dim`, `power`, `octave` | `'major'` |
| `seed` | Startphasen der Zähler, Rauschregister, Lage zum Abtastraster | 1 |

## Das 1-Bit-Signal

Die CPU läuft mit 3,5 MHz. Ein Takt (ein Zyklus) dauert 0,286 µs, und nur auf diesem Raster
kann sich das Portbit ändern. Die Routinen sind Zählschleifen, ihre Länge in Zyklen ist fest. Das
Modell erzeugt die Liste der Umschaltzeiten in Zyklen. Danach wird jede Flanke als bandbegrenzte
Stufe (Integral eines sinc mit Kaiser-Fenster, 20 kHz, 64 Abtastwerte breit) an ihren genauen,
gebrochenen Zeitpunkt im 48-kHz-Raster gesetzt. Kurze Pulse von wenigen Mikrosekunden bleiben so
erhalten, als kleine, aber richtige Energie, und es entsteht keine Spiegelung, die der echte
Lautsprecher nicht auch gehabt hätte.

### Tonschleife

Eine 16-Bit-Zählschleife braucht 26 Zyklen pro Durchlauf, dazu 74 Zyklen für das Umschalten und
das Neuladen. Die halbe Periode ist

    H = 74 + 26 · N,   f = 3,5 MHz / (2 H)

Die Periode lässt sich also nur in Schritten von 52 Zyklen einstellen.

### Multiplexen

Für mehrere Stimmen läuft eine Hauptschleife, in der jede Stimme einen eigenen Zeitschlitz von 84
Zyklen hat. Jede Stimme addiert pro Durchlauf ihre Schrittweite auf einen 16-Bit-Akkumulator,
während ihres Schlitzes zeigt der Lautsprecher dessen oberstes Bit. Die Frequenz ist

    f = inc · 3,5 MHz / (65536 · L),   L = 84 · Stimmen

Im Mittel stimmt sie bis auf wenige Cent, aber jede Flanke liegt auf dem Raster der Schleife und
springt um bis zu einen Durchlauf hin und her. Bei zwei Stimmen schaltet der Lautsprecher mit
20,8 kHz zwischen ihnen, bei drei mit 13,9 kHz. Diese Trägerfrequenz ist bei drei Stimmen als
leises Pfeifen zu hören, wie bei den echten Routinen.

### Pulse in eigenen Schlitzen

Die späteren 1-Bit-Routinen schalten den Lautsprecher nur kurz ein. Läuft der Akkumulator einer
Stimme über, gibt sie in ihrem Schlitz (64 Zyklen) einen Puls von w Zyklen aus. Die Pulse
überlappen nie, der Lautsprecher summiert sie in der Zeit. Die Pulsbreite ist die Lautstärke der
Stimme: Sie fällt im Preset `pin-pulse` von 48 auf 4 Zyklen,

    w(t) = 4 + 44 · e^(−t / 0,35 s)

So klingt ein Ton aus, obwohl das Signal nur 0 und 1 kennt.

### Piezo

Der Piezo-Summer der Handspiele hängt an einem kleinen Mikrocontroller, der seinen Pin aus einem
32768-Hz-Uhrentakt umschaltet. Die halbe Periode ist eine ganze Zahl solcher Takte,
`f = 32768 / (2 N)`. Höhere Töne liegen deshalb deutlich daneben.

## Lautsprecher

Der kleine Konuslautsprecher im Gehäuse wird mit Spannung angesteuert. Er hat keinen
Gleichstromweg zum Schall: Ein gehaltener Pegel klingt ab, jede Flanke wird zu einem gedämpften
Klick. Das Modell besteht aus linearen Filtern (Zustandsvariablenfilter, trapezoidal):

- Konusresonanz als Hochpass 2. Ordnung bei 380 Hz, Q 1,4
- Teilschwingung des Konus als Bandpass 2,8 kHz, Q 3, mit Spitzenverstärkung 0,8 addiert
- Induktivität der Schwingspule und Masse des Konus als Tiefpass 2. Ordnung bei 7 kHz, Q 0,7

Tiefe Töne kommen deshalb als Klickfolge mit der Tonfrequenz heraus, der Grundton ist fast weg.
Das ist der typische, dünne Klang.

Der Piezo hat eine starke Resonanz bei 3,6 kHz (Q 7), eine schwächere bei 9,2 kHz (Q 5, Faktor
0,25), davor einen Hochpass 2. Ordnung bei 1,2 kHz und einen kleinen breitbandigen Anteil (0,12).
Ein Tiefpass bei 12 kHz schließt ab. Grundtöne unter etwa 1 kHz hört man fast nur über ihre
Obertöne in der Nähe der Resonanz.

Beide Modelle haben die Gleichverstärkung null, das unipolare Signal braucht keinen weiteren
Hochpass.

## Presets

| Preset | Routine |
|---|---|
| `square` | Tonschleife, Rechteck 50 % |
| `pwm` | zwei Zählschleifen pro Periode, die Summe bleibt 2N, also bleibt die Tonhöhe. Ohne `duty` wandert die Breite über die Note (mindestens 0,3 s) von 3 % auf 50 %: von dünn und leise nach fett. Die Breite rastet in Schritten von 26 Zyklen |
| `chord` | Multiplexen von 2 oder 3 Stimmen, je nach `chord` |
| `pin-pulse` | Pulse in eigenen Schlitzen, Stimmen aus `chord`, abklingende Pulsbreite |
| `drum-kick` | Tonschleife, deren Zählwert jede halbe Periode um einen festen Betrag wächst: 15 halbe Perioden von 900 Hz bis 45 Hz in etwa 90 ms |
| `drum-noise` | pro Durchlauf (120 Zyklen bei MIDI 60) ein Bit aus einem 16-Bit-Schieberegister; ist es gesetzt, ein Puls von w Zyklen, w fällt mit 50 ms (ab `duration` 0,2 s mit 150 ms) |
| `piezo` | Rechteck vom 32768-Hz-Takt auf dem Piezo-Summer |

Bei `drum-kick` und `drum-noise` verschiebt `midi` die Stimmung um `midi − 60` Halbtöne, begrenzt
auf −12 bis +24. Bei `drum-noise` ändert sich dafür die Länge des Schleifendurchlaufs.

## Tonhöhe

Fehler in Cent (A = 440 Hz). N ist der Zählwert der Tonschleife bzw. des Piezo-Takts, „Akku“ die
mittlere Frequenz der Multiplex-Routine.

| MIDI | N | Schleife | Akku 2 Stimmen | Akku 3 Stimmen | N Piezo | Piezo |
|---|---|---|---|---|---|---|
| 24 | 2055 | 0,2 | 2,1 | −3,5 | 501 | 0,0 |
| 30 | 1452 | 0,6 | −5,8 | −1,8 | 354 | 1,2 |
| 36 | 1026 | 0,4 | 2,1 | 2,1 | 250 | 3,4 |
| 42 | 725 | −0,4 | 0,1 | −1,8 | 177 | 1,2 |
| 48 | 512 | −1,0 | 2,1 | −0,7 | 125 | 3,4 |
| 54 | 361 | −0,1 | 0,1 | 0,1 | 89 | −8,5 |
| 60 | 254 | 2,8 | 0,0 | 0,7 | 63 | −10,4 |
| 66 | 179 | 0,7 | 0,1 | 0,1 | 44 | 11,1 |
| 72 | 126 | −2,9 | 0,0 | 0,0 | 31 | 17,3 |
| 78 | 88 | 2,1 | 0,1 | 0,1 | 22 | 11,1 |
| 84 | 61 | 12,7 | 0,0 | 0,0 | 16 | −37,6 |
| 90 | 43 | −13,9 | 0,1 | −0,1 | 11 | 11,1 |
| 96 | 29 | 16,9 | 0,0 | 0,0 | 8 | −37,6 |

Über den ganzen Umfang höchstens: Tonschleife 18,1 Cent (bis MIDI 83 unter 10 Cent), Akkumulator
7,1 Cent, Piezo 76,1 Cent (bis MIDI 56 unter 10 Cent). Der schiefe Piezo in der Höhe ist
authentisch. Bei MIDI 84 stimmt die gemessene Tonhöhe des gerenderten Tons mit der Formel auf
0,01 Cent überein.

## Messwerte

Prüflauf über jede zweite Note von 24 bis 96, Velocity 0,2, 0,6 und 1, alle Presets, alle
Akkorde, `duty` 0,02, 0,25, 0,5 und 0,98, Dauer 0,15 und 1,2 s, zwei Seeds (10212 Töne):

- lautester Ton bei Velocity 1: etwa −1,5 dBFS je Preset (feste Verstärkung, keine Begrenzung)
- keine NaN, jeder Ton beginnt und endet bei exakt 0
- Gleichanteil höchstens 4 · 10⁻¹⁰ des Spitzenwerts
- gleicher Seed gibt identische Samples, gebrochene Seeds andere
- etwa 200-fach schneller als Echtzeit

Das Hörbeispiel spielt nacheinander eine Melodie, einen Pulsbreiten-Sweep,
gemultiplexte Akkorde, einen Groove aus Pulsstimmen mit Kick und Rauschen und am Ende eine kurze
Piezo-Fanfare: −14,6 LUFS, True Peak −1,0 dBTP.

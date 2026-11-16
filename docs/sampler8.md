# Sampler 8

`instruments/sampler8.mjs` ist der vierstimmige Sample-Chip eines Heimcomputers der späten
Achtziger und die Tracker-Musik, die darauf entstand. Jeder Kanal liest 8-Bit-Samples aus dem
Speicher und gibt jeden Wert so lange aus, bis der nächste kommt. Wie schnell, bestimmt eine ganze
Zahl, die Periode. Daraus kommen der raue, glasige Klang und die gestuften Tonhöhen.

Alle Samples werden hier selbst synthetisiert, auf vorzeichenbehaftete 8 Bit gerundet und mit
Schleifenpunkten versehen, wie in einem Modul. Ausgabe mono (ein Kanal des Chips), 48 kHz.

```js
import { render, meta } from './instruments/sampler8.mjs';
const x = render({ midi: 45, velocity: 0.9, duration: 0.4, preset: 'bass', filter: 'led' });
```

## Der Kanal

Der Chip läuft mit 3 546 895 Hz. Ein Kanal holt ein Byte, hält es P Takte lang und holt dann das
nächste. Die Abspielrate ist f_s = 3 546 895 / P, die Periode P ist ganzzahlig zwischen 124 (die
kürzeste, die der Speicherzugriff schafft, 28,6 kHz) und 65 535. Am Ausgang steht

    y = s / 128 · v / 64

mit dem Samplebyte s (−128 bis 127) und der Lautstärke v (0 bis 64, aus `velocity`).

### Halteglied und Spiegelbilder

Das Halten jedes Werts bis zum nächsten ist ein Halteglied nullter Ordnung. Ein Sinus der
Frequenz f im Sample erscheint am Ausgang bei f und zusätzlich bei k f_s ± f für jedes k, gewichtet
mit |sin(π f'/f_s) / (π f'/f_s)| an der jeweiligen Frequenz f'. Spielt der Bass auf C2 mit einem
Zyklus von 64 Bytes, ist P = 847 und f_s = 4188 Hz; die Spiegelbilder liegen dann ab etwa 4 kHz
dicht unter dem Grundton und geben den typischen metallischen Schleier. Je tiefer eine Note bei
gleichem Sample, desto niedriger f_s und desto näher rücken die Spiegelbilder. Diese Anteile
erzeugt der echte Chip, sie bleiben.

### Bandbegrenzte Wiedergabe

Jeder neue Wert ist ein Sprung zur Zeit Σ P / 3 546 895, fast nie auf einem 48-kHz-Sample. Jeder
Sprung wird durch das Integral eines Kaiser-gefensterten Sinc ersetzt (Grenzfrequenz 23 kHz,
32 Stützstellen, β = 10, rund 100 dB Dämpfung ab 28 kHz). Das Ergebnis ist genau die
tiefpassgefilterte Treppe des Chips. Spiegelbilder über 20 kHz werden weggefiltert statt
zurückgefaltet, die Umrechnung fügt keine eigenen hinzu.

## Tonhöhe

Für eine Note mit Frequenz f und einem Sample mit `spc` Bytes pro Zyklus ist

    P = round(3 546 895 / (f · spc))

Die Rundung auf ganze Perioden ist die Stimmung des Chips. Einmalig gespielte Samples sind für
P = 214 auf C4 aufgenommen (f_s = 16 574 Hz), damit folgt ihre Periode der üblichen
Tracker-Tabelle `P = round(214 · 2^((60 − m) / 12))`.

Liegt P unter 124, nimmt das Instrument die nächste Oktavkopie des Samples: Schleifen mit halb so
vielen Bytes pro Zyklus, Einmal-Samples eine Oktave höher bei gleicher Rate neu gerechnet. So
haben die Instrumentdateien der Zeit mehrere Oktaven abgelegt. Gewählt wird die längste Kopie mit
erlaubter Periode, tiefe Noten laufen also mit niedriger Rate und klingen rauer.

Periode und Fehler für eine Oktave (Schleifen mit 64 und 32 Bytes pro Zyklus, Einmal-Samples):

| Note | P (64 B) | Cent | P (32 B, `chip`) | Cent | P (Einmal) | Cent |
|---|---|---|---|---|---|---|
| C4 | 212 | −1,4 | 424 | −1,4 | 214 | 0,0 |
| C♯4 | 200 | −0,5 | 400 | −0,5 | 202 | −0,1 |
| D4 | 189 | −2,6 | 377 | +2,0 | 191 | −3,2 |
| D♯4 | 178 | +1,2 | 356 | +1,2 | 180 | −0,5 |
| E4 | 168 | +1,3 | 336 | +1,3 | 170 | −1,5 |
| F4 | 159 | −3,3 | 317 | +2,1 | 160 | +3,4 |
| F♯4 | 150 | −2,5 | 300 | −2,5 | 151 | +3,7 |
| G4 | 141 | +4,7 | 283 | −1,5 | 143 | −2,1 |
| G♯4 | 133 | +5,8 | 267 | −0,7 | 135 | −2,4 |
| A4 | 126 | −0,6 | 252 | −0,6 | 127 | +3,3 |
| A♯4 | 238 (Kopie 1) | −1,7 | 238 | −1,7 | 240 (Kopie 1) | +1,5 |
| B4 | 224 (Kopie 1) | +3,3 | 224 | +3,3 | 227 (Kopie 1) | −2,1 |

Größter Fehler über MIDI 24 bis 96: 5,8 Cent bei Schleifen, 3,7 Cent bei Einmal-Samples. Gemessen
mit einem Goertzel-Scan im eingeschwungenen Teil stimmen `chip`, `bass` und `piano` auf 0,3 Cent
mit der Vorhersage überein.

## Abspieler

Wie ein Tracker ändert das Instrument Lautstärke und Periode nur einmal pro Bildwechsel, also mit
50 Hz. Wo der Takt dieses Rasters zum Notenanfang steht, kommt aus dem Seed. Ebenso der Stand des
Periodenzählers im Kanal: Er läuft frei, deshalb kommt das erste Byte irgendwo innerhalb einer
Periode nach dem Anschlag. Damit klingt auch jedes Einmal-Sample je nach Seed etwas anders, denn
alle Treppenstufen liegen um denselben Bruchteil verschoben zum 48-kHz-Raster.

- **Loslassen:** Ab dem ersten Tick nach `duration` sinkt v pro Tick um einen festen Wert je Preset
  (3 bis 8). Das gibt die gestufte Lautstärkerampe eines Volume Slide. Einmal-Samples enden
  früher, wenn ihr Byte-Vorrat aufgebraucht ist.
- **Vibrato** (`lead`): nach 15 Ticks pro Tick `P = P0 + round(0,011 · P0 · sin(2π i / 64))`, i
  wächst um 6 pro Tick (4,7 Hz). Die Tonhöhe springt dabei in ganzen Perioden: bei P0 um 130 ist
  eine Periode schon 13 Cent, bei P0 um 850 nur 2 Cent.
- **Schleifen:** Nach dem letzten Byte springt der Kanal an den Schleifenanfang, ohne Lücke.

## Samples

| Preset | Bytes (Kopie 0) | Schleife | Bytes pro Zyklus | Inhalt |
|---|---|---|---|---|
| `bass` | 448 | letzter Zyklus, 64 | 64 | sechs Zyklen mit fallender Filterkante und Resonanzbuckel, dann ein weicher Grundtonzyklus |
| `strings` | 6144 | 3072 | 64 | drei Sägezähne in einer Schleife, die 47, 48 und 49 Zyklen lang laufen; die Schwebung wiederholt sich genau an der Nahtstelle. Davor dieselbe Schleife eingeblendet als Anschwellen |
| `choir` | 10 240 | 5120 | 128 | wie `strings`, aber mit Formanten eines „a“ (730, 1090, 2440, 3400 Hz), die in jeder Oktavkopie an ihrem Platz bleiben |
| `piano` | 26 519 | keine | 63,4 | Saitenteiltöne mit Inharmonizität B = 0,00035, Anschlagkerbe bei 1/7,3 der Saite, Teiltöne klingen umso schneller ab, je höher sie liegen |
| `lead` | 64 | 64 | 64 | Puls mit 25 % Tastgrad, oben leicht abgerundet, mit Vibrato |
| `chip` | 32 | 32 | 32 | vier Stufen (+0,8, +0,3, −0,8, −0,3), roh ohne Glättung |
| `orchestra-hit` | 14 088 | keine | 63,4 | Akkord aus sechs Sägezähnen (Unteroktave, Grundton, Quinte, Oktave, Dezime, Duodezime) mit kurzem Tonhöhenknick und Rauschstoß |
| `drum-kick` | 7458 | keine | 63,4 | Sinus von 178 Hz auf 48 Hz, Abklingen 160 ms |
| `drum-snare` | 4972 | keine | 63,4 | Ton 190 Hz und hochpassgefiltertes Rauschen |

Die Werte werden auf Spitze 0,99 normiert und auf ganze Zahlen von −128 bis 127 gerundet, ohne
Dither. Das Quantisierungsrauschen gehört zum Klang. Synthetisierte Samples enthalten nichts über
0,45 ihrer eigenen Rate, die Stufen zwischen den Bytes sind die Kanten, die der Chip selbst macht.
`chip` ist absichtlich roh und wird für Oktavkopien nur ausgedünnt. Alle Drums sind über `midi`
transponierbar wie im Tracker; C4 ist die Originalhöhe.

`bits: 6` rundet jedes Byte zusätzlich auf ein Vielfaches von 4. Das gibt 12 dB mehr
Quantisierungsrauschen, so wie Samples, die man klein halten wollte.

## Ausgangsfilter

Hinter dem Chip liegen ein fester RC-Tiefpass erster Ordnung bei 4,42 kHz und ein Koppelkondensator
als Hochpass bei 10 Hz. Mit `filter: 'led'` kommt ein schaltbarer Tiefpass zweiter Ordnung bei
3,275 kHz dazu (Butterworth, Q = 0,707). Am Gerät hing er an der Betriebsanzeige, daher der Name.
Alle Filter sind trapezförmig diskretisiert. Der feste Tiefpass dämpft die Spiegelbilder nur mit
6 dB pro Oktave, deshalb bleiben sie hörbar; mit dem zweiten Filter werden sie deutlich weicher.

## Parameter

| Parameter | Werte | Standard |
|---|---|---|
| `midi` | 24 bis 96, auf ganze Noten gerundet | 60 |
| `velocity` | 0 bis 1, Kanallautstärke `round(64 · velocity)` | 0,8 |
| `duration` | Haltezeit in s, 0,01 bis 30 | 0,5 |
| `preset` | `bass`, `strings`, `choir`, `piano`, `lead`, `chip`, `orchestra-hit`, `drum-kick`, `drum-snare` | `bass` |
| `filter` | `'off'`, `'led'` | `'off'` |
| `bits` | 8 oder 6 | 8 |
| `seed` | Zahl, legt die Lage des Tick-Rasters und den Stand des Periodenzählers fest | 1 |

Unbekannte Presets, Filterwerte oder Bittiefen werfen einen Fehler, ebenso nicht endliche Zahlen.
Die gebauten Samples werden zwischengespeichert, höchstens 96 Kopien.

## Pegel

Jedes Preset hat einen festen Pegel, eingemessen über jede zweite Note von 24 bis 96, beide
Filterstellungen, beide Bittiefen und 41 Seeds bei Anschlag 1, Ziel −1,5 dBFS. Es gibt keinen
Begrenzer.

## Messwerte

Durchlauf mit allen Presets, jeder zweiten Note von 24 bis 96, Anschlag 0,2 bis 1 in Schritten
von 0,1, beiden Filtern, beiden Bittiefen, Haltezeit 0,8 s, bei Anschlag 1 mit 41 Seeds
(65 268 Töne):

- Lautester Ton: −1,47 dBFS (`orchestra-hit`, MIDI 44). Über 100 Seeds schwankt die Spitze eines
  Tons um höchstens 0,03 dB.
- Größter Sprung von Sample zu Sample: 0,44 im Anschlag von `piano` auf MIDI 94. Dort liegen
  starke Spiegelbilder bei 10 bis 20 kHz, ein Knacken ist es nicht.
- Keine NaN, erstes und letztes Sample exakt 0, Gleichanteil unter 3 · 10⁻⁵.
- Gleicher Seed ergibt bitgleiche Ausgabe, gebrochene Seeds weichen ab. Das gilt auch für
  Einmal-Samples wie `drum-snare` und `piano`.
- Rechenzeit: 1,7 % der Klangdauer. Der erste Ton eines Presets baut die Samples, bei
  `orchestra-hit` dauert das etwa 0,1 s.
- Spektrogramme der höchsten Noten (MIDI 84 bis 96) zeigen nur Linien bei Vielfachen des
  Grundtons, also die Spiegelbilder des Halteglieds. Keine Rückfaltung bei 48 kHz.

Die Demo `demos/sampler8.mjs` ist ein eigenes Modul über neun Takte in d-Moll mit 125 BPM und
vier Kanälen: Drums mit Orchesterschlag, Bass, eine obere Stimme (erst Klavier, dann ein
Akkordarpeggio aus dem 32-Byte-Sample mit 6 Bit, dann die Melodie mit Vibrato) und Flächen aus
Streichern und Chor. Die ersten zwei Takte laufen durch den LED-Filter. Kanäle 0 und 3 liegen
links, 1 und 2 rechts, mit etwas Übersprechen. Länge 17,2 s, −12,1 LUFS, Spitze −1,0 dBFS,
True Peak −1,0 dBTP.

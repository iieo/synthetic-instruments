# Drum Machine

Analoge Drumcomputer-Percussion für Techno, rein aus Schaltungsmodellen gerechnet, ohne Samples.
Sieben Stimmen: `hatClosed`, `hatOpen`, `ride`, `clap`, `snare`, `rim`, `perc`. Eine Bassdrum gehört
nicht dazu, die kommt aus einem eigenen Instrument.

```js
import { render } from './instruments/drum-machine.mjs';
const hat = render({ voice: 'hatClosed', velocity: 0.9, seed: 3 });          // Float64Array, mono, 48 kHz
const tom = render({ voice: 'perc', tune: -7, decay: 0.4, drive: 0.6 });     // tiefer, kürzer, verzerrt
```

| Parameter | Bedeutung |
| --- | --- |
| `velocity` | 0 bis 1. Pegel wächst mit `velocity^1.5`. Bei Hats und Ride öffnet ein Akzent zusätzlich den Hochpass etwas, bei Snare und Perc wird der Tonhöhenabfall stärker. |
| `seed` | Bauteilstreuung und Rauschen für diesen Schlag. Gleicher Seed, gleiche Samples. |
| `tune` | −12 bis +12 Halbtöne. Verschiebt Oszillatoren und Resonatoren, bei den Metallstimmen die Bandpässe nur halb so weit. |
| `decay` | Ausklingzeit T60, 0,02 bis 4 s. Standard: Closed Hat 0,11, Open Hat 0,75, Ride 2,4, Clap 0,6, Snare 0,2, Rim 0,05, Perc 0,55. |
| `drive` | 0 bis 1, Diodenbegrenzer am Ausgang der Stimme (siehe unten). 0 schaltet ihn ab. |
| `snappy` | Nur Snare, 0 bis 1: Anteil des Rauschteppichs. Standard 0,7. |

Werte außerhalb der Bereiche werden auf den Rand gesetzt, keine Zahl ergibt den Standardwert. Die
Bereiche stehen auch als `RANGE` im Modul.

Bei voller Velocity liegt die Spitze jeder Stimme höchstens bei etwa −3 dBFS, und zwar über den
ganzen Bereich aller Parameter und je Einstellung 120 Seeds. Am lautesten werden lange Ausklingzeiten,
weil sich die frei laufenden Oszillatoren oder das Rauschen dann öfter zu einer Spitze addieren. Mit
den Standardwerten liegt die Spitze über 120 Seeds zwischen −2,9 (Rim) und −6,7 dBFS (Snare), der
Median zwischen −4,6 (Rim) und −11,3 dBFS (Closed Hat). Mit `drive` bleibt die Spitze bei höchstens
etwa −2,5 dBFS. Jeder Schlag beginnt und endet bei exakt null (Raised-Cosine-Ein- und -Ausblendung) und wird erst unter −90 dB seiner Spitze abgeschnitten.

Demo: `node demos/drum-machine.mjs` schreibt `out/drum-machine.wav` (Stereo, 29,5 s, Rendern etwa 7 s).
Zuerst jede Stimme einzeln, dann acht Takte Hard Techno mit 150 BPM: Closed Hats in Sechzehnteln mit
Akzentmuster, Open Hat auf jedem Offbeat (vom nächsten Closed Hat abgewürgt, die beiden teilen sich
einen Signalweg), Clap auf 2 und 4, Ride auf den Vierteln ab Takt 5, rollende Perc-Linie in drei
Tonhöhen und Rim-Synkopen. Danach vier Takte Industrial: dieselbe Figur mit Drive, um 3 Halbtöne
tiefer gestimmter Perc und einer Snare unter dem Clap.

## Dateien

| Datei | Inhalt |
| --- | --- |
| `instruments/drum-machine.mjs` | Stimmen, Standardwerte, Pegel, `render` |
| `instruments/drum-machine/dsp.mjs` | Zustandsvariablenfilter, PolyBLEP-Oszillatorbank, 4-fach-Überabtastung, Diodenbegrenzer, Ränder, True Peak |
| `demos/drum-machine.mjs` | Demo mit Choke, Panorama und Normalisierung |

## Bausteine

**Filter.** Alle Hoch-, Tief- und Bandpässe sind ein Zustandsvariablenfilter in der
topologieerhaltenden Form mit trapezförmigen Integratoren. Er bleibt stabil, wenn sich die
Grenzfrequenz von Sample zu Sample ändert, das nutzen die Resonatoren für den Tonhöhenabfall. Der
Bandpass wird mit `k = 1/Q` skaliert, damit seine Spitzenverstärkung unabhängig von Q bei 1 liegt.

**Resonator statt Brücken-T.** In analogen Drumcomputern erzeugt ein Brücken-T-Netzwerk um einen
Transistor oder Operationsverstärker die tonalen Stimmen: ein Bandpass mit hoher Güte, den ein kurzer
Triggerimpuls anstößt. Das Modell ist genau das: ein Bandpass mit `Q = π f T60 / 6,91`, angeregt
von einem Halbsinus-Impuls von 0,25 bis 1 ms. Die Impulsbreite bestimmt, wie viel Höhen der Anschlag
hat. Mit `k = 1/Q` skaliert schwingt der Bandpass nach einem Impuls mit einer Amplitude proportional
zu `1 / T60` aus, ein kurzes `decay` wäre also viel lauter. Deshalb wird die Ausgabe zusätzlich mit
`T60 / T60_Standard` multipliziert. So ändert sich die Spitze von Perc zwischen `decay` 0,05 und 4 s
um weniger als 1,5 dB, beim Standardwert ändert sich nichts. Für den Tonhöhenabfall läuft die
Grenzfrequenz exponentiell von `f (1 + sweep)` nach `f`, so wie eine Hüllkurve, die den Widerstand im
T-Glied moduliert.

**Oszillatorbank.** Rechteck- bzw. Pulsoszillatoren mit PolyBLEP-Kanten, erzeugt mit 192 kHz und
über ein Kaiser-Fenster-Sinc-Filter (287 Abgriffe, Durchlass bis 20 kHz, ab 24 kHz etwa −90 dB) auf
48 kHz gebracht. Das Tastverhältnis weicht pro Oszillator um bis zu ±3 % von 50 % ab, wie bei einem
Schmitt-Trigger-Oszillator mit Bauteilstreuung, deshalb gibt es auch schwache gerade Harmonische.

**Diodenbegrenzer.** Serienwiderstand 2,2 kΩ, dahinter Kondensator 4,7 nF und zwei antiparallele
Siliziumdioden nach Masse:

`C dv/dt = (vin − v) / R − 2 Is sinh(v / (n Vt))`, mit `Is = 2,52 nA`, `n = 1,752`, `Vt = 25,85 mV`.

Gelöst mit implizitem Euler und Newton-Schritten bei 4-facher Überabtastung, damit die steife
Exponentialfunktion stabil bleibt. Die Eingangsspannung ist `0,15 + 6 drive²` Volt je Einheit. Danach
Dezimation über dasselbe Sinc-Filter und eine Aufholverstärkung aus der statischen Kennlinie: Ein
Eingang von 0,5 kommt wieder mit 0,5 heraus. `drive` ändert also die Form, kaum die Spitze. Weil der
Begrenzer laute Schläge stärker drückt als leise, schrumpft der Velocity-Bereich: Bei `drive` 1 liegt
ein Schlag mit Velocity 0,2 nur 6 bis 9 dB unter einem vollen, ohne `drive` sind es 21 dB. Es gibt
keinen Limiter und kein `tanh` auf dem Summenbus, der Begrenzer sitzt nur in der einzelnen Stimme.

## Stimmen

**Hi-Hats.** Sechs frei laufende Pulsoszillatoren bei 263, 371, 412, 497, 586 und 845 Hz. Die Werte sind
so gewählt, dass kein Paar in einem kleinen ganzzahligen Verhältnis steht: Die Summe ist dann kein
Akkord, sondern eine dichte, unharmonische Wolke von Obertönen, deren Differenztöne schweben. Die
Summe läuft durch zwei Bandpässe (3,45 kHz, Q 1,6 und 8 kHz, Q 1,3, gemischt 0,18 zu 1), dann durch den
VCA und einen Hochpass bei 7,6 kHz. Etwas Transistorrauschen über 6 kHz kommt dazu. Der VCA folgt der
Entladung eines Kondensators: ein schneller Abfall nach der Triggerspitze, dann das RC-Ausklingen,
modelliert als Summe zweier Exponentialkurven: 60 % klingen mit der Zeitkonstante von `decay` aus,
40 % deutlich schneller. Geschlossen und offen unterscheiden sich in zwei Dingen. Die Standard-Ausklingzeit
ist 0,11 gegen 0,75 s, und der schnelle Anteil fällt beim Closed Hat mit 35 % der Zeitkonstante, beim
Open Hat mit 18 %. Der offene Hat behält so trotz langem Ausklang einen kurzen, harten Anschlag. Weil
der Zufallsgenerator je Stimme anders startet, haben beide mit demselben Seed auch eine andere
Bauteilstreuung. Die Phasen der Oszillatoren sind bei jedem Schlag andere, denn sie laufen frei.

**Ride.** Ein zweiter Satz von sechs Oszillatoren (389, 457, 541, 619, 734, 947 Hz) und drei Bandpässe:
eine schmale Glocke bei 2,3 kHz mit eigener, kürzerer Hüllkurve, Schimmer bei 6 kHz und Spitze bei
9,8 kHz, danach Hochpass bei 4 kHz. Das Ergebnis klingt dunkler und länger als die Hats.

**Clap.** Weißes Rauschen durch zwei Bandpässe (1,15 kHz, Q 2,2 und 2,6 kHz, Q 1,4). Eine
Sägezahn-Entladung wird drei- oder viermal im Abstand von etwa 10,5 ms neu getriggert, mit ±18 %
Zufall im Abstand je Seed. Ab dem letzten Burst übernimmt eine längere Hüllkurve den Nachhall.

**Snare.** Zwei Resonatoren bei 182 und 331 Hz (T60 0,2 und 0,13 s) mit leichtem Tonhöhenabfall, dazu
Rauschen zwischen 1,5 und 7 kHz mit eigener Hüllkurve. `snappy` regelt den Rauschanteil.

**Rim.** Zwei kurze Resonatoren bei 517 und 1690 Hz plus ein 1 ms langer Rauschklick über 2,5 kHz. Das
Ganze läuft durch den Diodenbegrenzer, der die übersteuerte Ausgangsstufe des Originalprinzips
nachbildet und den harten, holzigen Anschlag macht.

**Perc.** Ein stimmbarer Resonator bei 196 Hz mit starkem Tonhöhenabfall (bis zu 80 % über der
Zielfrequenz, Zeitkonstante 11 ms), ein schwacher zweiter Resonator beim 2,71-Fachen und ein leiser
Rauschklick. Mit `tune` von −12 bis +12 reicht er von Standtom bis Conga.

**Streuung.** Pro Schlag streuen Oszillatorfrequenzen um ±0,3 %, Tastverhältnisse um ±3 %,
Filterfrequenzen um ±2 bis 4 %, Resonatoren um ±1 %, Clap-Abstände um ±18 %. Das sind
Bauteiltoleranzen und Drift, kein neues Instrument pro Seed.

## Messungen

Zum Vergleich dient das elektronische Kit der freien General-MIDI-Soundfont FluidR3_GM (Bank 128,
Programm 25), gespielt mit FluidSynth, Hall und Chorus aus.
Alle Werte bei voller Velocity. T40 ist die Zeit von der Spitze bis −40 dB, der Schwerpunkt ist über die
ersten 170 ms gemessen, die Bänder sind Energieanteile in den Bändern bis 250 Hz, bis 1 kHz,
bis 3 kHz, bis 6 kHz, bis 12 kHz und bis 24 kHz.

| Stimme | T40 | Schwerpunkt | Bänder % | Referenz T40 | Referenz Schwerpunkt | Referenz Bänder % |
| --- | --- | --- | --- | --- | --- | --- |
| Closed Hat | 0,065 s | 9,4 kHz | 0/0/0/13/71/16 | 0,073 s | 9,8 kHz | 0/0/0/6/67/27 |
| Open Hat | 0,45 s | 9,1 kHz | 0/0/0/10/77/13 | Sample bis Note-off | 7,8 kHz | 0/0/1/17/77/6 |
| Ride | 1,55 s | 7,1 kHz | 0/0/5/35/52/8 | 1,03 s | 7,8 kHz | 0/0/1/15/78/6 |
| Clap | 0,34 s | 2,5 kHz | 0/12/61/19/6/1 | 0,39 s | 2,1 kHz | 1/30/51/13/5/0 |
| Snare | 0,12 s | 3,7 kHz | 21/4/22/33/19/1 | 0,11 s | 4,1 kHz | 7/0/31/42/18/1 |
| Perc (Tom) | 0,27 s | 0,2 kHz | 100/0/0/0/0/0 | 0,35 s | 0,17 kHz | 100/0/0/0/0/0 |

Im Spektrogramm haben Hats und Ride bei beiden dieselbe Struktur: dichte, feste Linien statt
Rauschen, Schwerpunkt zwischen 6 und 12 kHz.

**Aliasing.** Ein einzelner Pulsoszillator mit Tastverhältnis 0,47 hat bei 1,27 kHz den stärksten
nicht harmonischen Anteil bei −80 dB, bei 3,5 kHz −76 dB, bei 7,1 kHz −67 dB. Die Hat-Oszillatoren
liegen unter 1 kHz. Der Diodenbegrenzer mit einem Sinus von 4,2 kHz und Drive 0,7 bleibt bei −80 dB,
mit Drive 1 bei −62 dB.

**Demo.** Sample-Spitze −1,0 dBFS, True Peak −1,0 dBTP (ebur128), integrierte Lautheit −20,0 LUFS. Normalisiert wird linear auf −1 dBFS, und falls der True Peak (aus derselben
4-fach-Interpolation) über −0,5 dBTP läge, entsprechend tiefer. Der größte Sprung von Sample zu Sample
ist 0,87 bei einer Spitze von 0,89. Das ist bei Hats normal: Ein Ton bei 12 kHz springt pro Sample um
das 1,4-Fache seiner Amplitude. Einzelne Stimmen liegen bei Sprung zu Spitze von 0,33 (Perc) bis 1,28
(Rim, wegen des Klicks).

## Grenzen

- Die Hüllkurven sind ideale Exponentialkurven. Echte VCAs mit Transistoren haben eine leicht
  pegelabhängige Kennlinie, die fehlt.
- Die Metallstimmen haben keine Kopplung zwischen den Oszillatoren über die Versorgungsspannung. In
  echter Hardware ziehen sich frei laufende Oszillatoren dadurch minimal.
- Der Clap-Nachhall ist eine Hüllkurve auf gefiltertem Rauschen, kein Raum.

## Quellen

- V. Zavalishin: *The Art of VA Filter Design*, Rev. 2.1, 2018 (Zustandsvariablenfilter mit
  trapezförmiger Integration).
- K. J. Werner: *Virtual Analog Modeling of Audio Circuitry Using Wave Digital Filters*, Dissertation,
  Stanford University 2016 (Analyse von Brücken-T-Netzwerken in Drumcomputern als angestoßene
  Bandpässe; alle Werte hier sind eigene).
- V. Välimäki, A. Huovilainen: *Antialiasing Oscillators in Subtractive Synthesis*, IEEE Signal
  Processing Magazine 24(2), 2007 (PolyBLEP).
- D. Yeh, J. Abel, J. O. Smith: *Simulation of the Diode Limiter in Guitar Distortion Circuits by
  Numerical Solution of Ordinary Differential Equations*, DAFx 2007.
- J. F. Kaiser: *Nonrecursive Digital Filter Design Using the I0-sinh Window Function*, IEEE ISCAS 1974.
- ITU-R BS.1770-4: *Algorithms to measure audio programme loudness and true-peak audio level*.

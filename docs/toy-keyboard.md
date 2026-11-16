# Toy Keyboard

`instruments/toy-keyboard.mjs` ist eine billige Spielzeug- und Hobbytastatur der Achtziger. Ein
einziger Haupttakt wird durch zwölf ganzzahlige Teiler auf die Töne der obersten Oktave gebracht,
alle tieferen Oktaven entstehen durch Halbieren. Die Ausgänge sind 1-Bit-Rechtecke, Widerstände
mischen sie, und einfache RC-Filter sollen daraus Klavier, Flöte oder Trompete machen. Ein
Kondensator formt die Hüllkurve, ein langsamer Dreieck-Oszillator zieht den ganzen Takt zum
Vibrato. Die späteren Modelle mit 4-Bit-Klängen sind als eigene Stimmen dabei, dazu eine
Rhythmusbox.

Umfang: MIDI 36 bis 96. Ausgabe mono, 48 kHz.

```js
import { render, renderRhythm, meta } from './instruments/toy-keyboard.mjs';
const x = render({ midi: 69, velocity: 0.8, duration: 1, preset: 'flute', vibrato: 'on', sustain: 'off' });
const beat = renderRhythm({ pattern: 'bossa', bpm: 120, bars: 4 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `piano`, `organ`, `flute`, `violin`, `trumpet`, `synth-drum`, `bells`, `fantasy` |
| `midi` | 36 bis 96, ganzzahlig gerundet |
| `velocity` | 0 bis 1. Die Tastatur ist nicht anschlagdynamisch, der Wert wirkt wie der Lautstärkeregler |
| `duration` | Haltezeit in Sekunden, 0,01 bis 30 |
| `seed` | Zustand der Teilerkette und Phase des Vibratos beim Tastendruck |
| `vibrato` | `'on'` oder `'off'` (auch `true`/`false`), ohne Angabe die Vorgabe der Stimme |
| `sustain` | `'off'` oder `'on'`: langer Ausklang nach dem Loslassen |

`renderRhythm({ pattern, bpm, bars, seed })`: `pattern` ist `rock`, `waltz`, `bossa` oder
`march`, `bpm` 60 bis 200, `bars` 1 bis 16 Takte.

## Tongenerator

Ein keramischer Resonator liefert den Haupttakt `f_clk = 1 MHz`. Zwölf Zähler teilen ihn durch
die ganzen Zahlen `N`, die der Oktave C8 bis H8 am nächsten kommen:

    N_pc = round(f_clk / f_ET(108 + pc))

| Ton | N | erzeugt (Hz) | gleichstufig (Hz) | Fehler (Cent) |
| --- | --- | --- | --- | --- |
| C | 239 | 4184,1 | 4186,0 | −0,8 |
| Cis | 225 | 4444,4 | 4434,9 | +3,7 |
| D | 213 | 4694,8 | 4698,6 | −1,4 |
| Dis | 201 | 4975,1 | 4978,0 | −1,0 |
| E | 190 | 5263,2 | 5274,0 | −3,6 |
| F | 179 | 5586,6 | 5587,7 | −0,3 |
| Fis | 169 | 5917,2 | 5919,9 | −0,8 |
| G | 159 | 6289,3 | 6271,9 | +4,8 |
| Gis | 150 | 6666,7 | 6644,9 | +5,7 |
| A | 142 | 7042,3 | 7040,0 | +0,6 |
| Ais | 134 | 7462,7 | 7458,6 | +0,9 |
| H | 127 | 7874,0 | 7902,1 | −6,2 |

Jede tiefere Oktave ist ein weiteres Flipflop, also eine exakte Halbierung. Eine Taste `m` mit
Tonklasse `pc` liegt `k = (108 + pc − m) / 12` Oktaven unter der obersten:

    f = f_clk / (N_pc · 2^k)

Deshalb wiederholt sich der Stimmungsfehler der Tabelle in jeder Oktave genau gleich. Die Oktaven
sind rein, die Quinte C nach G ist um 5,6 Cent zu groß, die große Terz C nach E um 2,8 Cent zu
klein, und zwischen G (+4,8) und H (−6,2) liegen 11 Cent Spreizung. Die gemessene Tonhöhe aller
Tasten weicht vom Modell um weniger als 0,001 Cent ab.

## Teilerkette und Fußlagen

Hinter jedem Teiler zählt ein Binärzähler `q` (6 Bit, 32 Schritte pro Periode der gespielten
Taste, dazu ein Bit für die Unteroktave). Die 1-Bit-Ausgänge sind Funktionen dieses Zählers:

| Ausgang | Bedingung | Klang |
| --- | --- | --- |
| `sq` | `(q mod 32) < 16` | Rechteck 50 % |
| `oct` | `(q mod 16) < 8` | Rechteck eine Oktave höher |
| `oct2` | `(q mod 8) < 4` | zwei Oktaven höher |
| `p25` | `(q mod 32) < 8` | Puls 25 %, UND aus zwei Stufen |
| `p12` | `(q mod 32) < 4` | Puls 12,5 %, UND aus drei Stufen |
| `sub` | `q < 32` | Rechteck eine Oktave tiefer |

Widerstände mischen die gewählten Ausgänge mit den Gewichten `w_i`. Ein Koppelkondensator vor dem
Tastenschalter nimmt den Mittelwert heraus:

    x(q) = Σ w_i · b_i(q) − mean_q Σ w_i · b_i(q)

Der Ausgang wechselt nur an den Zählschritten. Die Zeitpunkte folgen aus der Taktphase
`Φ(t) = ∫ f_clk (1 + v(t)) dt`: ein Schritt fällt dort, wo `Φ` das nächste Vielfache von
`D = N_pc · 2^k / 32` überschreitet, innerhalb eines Samples linear interpoliert.

## Bandbegrenzte Stufen

Ein Signal aus Stufen `Δ_j` zu Zeiten `t_j` ist `s(t) = Σ Δ_j u(t − t_j)`. Gerechnet wird

    y[n] = Σ Δ_j · B(n − t_j)

mit der bandbegrenzten Stufe `B(x) = ∫ h`, dem Integral eines Kaiser-gefensterten Sinc
(Grenzfrequenz 0,43 · 48 kHz = 20,6 kHz, β = 9, 24 Samples zu jeder Seite, 256-fach tabelliert).
Praktisch wird die naive Stufe geschrieben und um jede Stufe herum `Δ_j (B(x) − u(x))` addiert.
So bleiben die harten 1-Bit-Flanken und die Zeitpunkte der Teilerkette erhalten, ohne dass beim
Abtasten auf 48 kHz neue Spiegelfrequenzen entstehen. Die Spektrogramme der obersten Oktave zeigen
nur ganzzahlige Obertöne.

## Vibrato

Der Haupttakt ist ein spannungsgesteuerter Oszillator, an dem ein Dreieck mit fester Frequenz
zieht:

    f_clk(t) = 1 MHz · (1 + 0,0055 · tri(5,8 Hz · t))

Das sind ±9,5 Cent, für alle Tasten gleichzeitig und ohne Verzögerung, so wie bei einer
Tastatur mit nur einem Takt. Die Phase des Dreiecks beim Tastendruck kommt aus `seed`.

## Hüllkurve

Der Tastenschalter lädt einen Kondensator über einen Widerstand (Anstieg `a`), ein zweiter
Widerstand entlädt ihn auf den Haltepegel `s` (Abfall `d`):

    e(t) = (1 − e^(−t/a)) · (s + (1 − s) · e^(−t/d))

Nach dem Loslassen zur Zeit `g` entlädt er sich mit `r`, mit `sustain: 'on'` über einen größeren
Widerstand mit `r_s`:

    e(t) = e_held(t) · e^(−(t − g)/r)

Der 1-Bit-Mix wird mit `e(t)` multipliziert. Der Ton beginnt bei exakt null, am Ende blendet ein
erhöhter Kosinus über 4 ms aus, wenn der Pegel nach fünf Zeitkonstanten unter −43 dB liegt.

## 4-Bit-Stimmen

`piano`, `bells` und `fantasy` kommen aus den späteren Tastaturen mit 4-Bit-Klängen. Statt der
Rechtecke liest der Zähler eine Tabelle mit 32 Werten zu je 4 Bit (eigene Tabellen), in derselben
Teilerstimmung wie oben. Die Lautstärke ist ebenfalls digital: ein 4-Bit-Pegel

    L = round(15 · e(t))

wird bei jedem Tabellenschritt mit dem vorzeichenbehafteten Wert multipliziert und wieder auf 4 Bit
gekürzt:

    x = floor((w − 8) · L / 16)

Beim Ausklingen bleiben deshalb immer weniger Stufen übrig, das Signal wird körnig, und jeder
Pegelsprung ist als feines Ticken zu hören. Das ist der Klang dieser Geräte und bleibt so. Die
Wandlerausgabe läuft danach durch ein RC-Glied.

`fantasy` wiederholt den Anschlag als billiges Echo alle 0,15 s, jedes Mal um den Faktor 0,55
leiser:

    e(t) = Σ_{i=0}^{6} 0,55^i · e_1(t − 0,15 i)

## Synth-Drum

Die Stimme `synth-drum` verlängert den Teiler während des Tons in Sechzehntel-Schritten:

    D(t) = D_0 · (1 + round(16 · (2^(t / 0,22 s) − 1)) / 16)

Die Tonhöhe fällt so in hörbaren Stufen statt gleitend, schnell abklingend.

## Stimmen

| Stimme | Quelle | Filter | Hüllkurve (a, d, s, r, r_s in s) | Vibrato |
| --- | --- | --- | --- | --- |
| `piano` | 4-Bit-Tabelle | Tiefpass 4,2 kHz und 9 kHz | 0,002, 0,75, 0, 0,07, 0,9 | aus |
| `organ` | sq 1, oct 0,55, oct2 0,3, sub 0,45 | Tiefpass 3,8 kHz, Hochpass 90 Hz | 0,004, ·, 1, 0,02, 0,45 | aus |
| `flute` | sq | Tiefpass 2. Ordnung 950 Hz (Q 0,6), Tiefpass 3 kHz | 0,045, ·, 1, 0,05, 0,5 | an |
| `violin` | p25 1, oct 0,22 | Hochpass 260 Hz, Tiefpass 2,6 kHz und 6 kHz | 0,09, ·, 1, 0,09, 0,6 | an |
| `trumpet` | p12 1, p25 0,7 | resonanter Tiefpass 1,7 kHz (Q 2,2), Hochpass 180 Hz | 0,03, ·, 1, 0,05, 0,5 | aus |
| `synth-drum` | sq 1, p25 0,4, fallender Teiler | Tiefpass 2,8 kHz | 0,0015, 0,16, 0, 0,04, 0,3 | aus |
| `bells` | 4-Bit-Tabelle | Tiefpass 6,5 kHz, Hochpass 150 Hz | 0,001, 1,1, 0, 0,25, 1,4 | aus |
| `fantasy` | 4-Bit-Tabelle, Echo | Tiefpass 5,5 kHz, Hochpass 120 Hz | 0,003, 0,11, 0, 0,3, 0,9 | an |

Die Filter sind fest und folgen der Tonhöhe nicht. Tiefe Tasten klingen deshalb hell und
schnarrend, hohe dumpf und fast sinusförmig, genau wie bei den Vorbildern. Am Ausgang sitzt ein
Koppelkondensator (Hochpass 20 Hz), danach ein fester Pegel pro Stimme.

## Rhythmusbox

Vier Klänge, jeder bandbegrenzt aus Stufen wie oben:

- `kick`: Rechteck aus einem ganzzahligen Teiler des Haupttakts, dessen Frequenz in 22 ms von
  166 Hz auf 46 Hz fällt, Abfall 0,11 s, zwei Tiefpässe.
- `snare`: 1-Bit-Rauschen aus einem 17-Bit-Schieberegister mit Rückkopplung nach
  `x^17 + x^14 + 1`, getaktet mit 15 kHz, dazu ein Rechteck bei 186 Hz, Abfall 65 ms.
- `hat`: dasselbe Register mit 31 kHz getaktet, zweimal Hochpass 5,5 kHz, Abfall 20 ms.
- `rim`: Rechteck 1650 Hz durch einen resonanten Tiefpass, Abfall 11 ms.

Muster, eine Zeile pro Klang und ein Zeichen pro Sechzehntel (`X` betont, `x` normal, nicht
betont 0,62 des Pegels):

| Muster | Länge | Kick | Snare | Hi-Hat | Rim |
| --- | --- | --- | --- | --- | --- |
| `rock` | 16 | `X.....x.X.x.....` | `....X.......X..x` | `X.x.x.x.X.x.x.x.` | |
| `waltz` | 12 | `X...........` | `....x...x...` | `x.x.x.x.x.x.` | `..........x.` |
| `bossa` | 32 | `X..xX..x` (viermal) | | `xxXx` (achtmal) | `x..x..x...x..x....x..x...x..x...` |
| `march` | 16 | `X.......X.......` | `X..xx.x.X.xxX.x.` | | `....x.......x...` |

Der Walzer zählt zwölf Sechzehntel pro Takt, die Bossa läuft über zwei Takte.

## Messwerte

Prüflauf über jede Taste von 36 bis 96, Anschlag 0,2, 0,6 und 1, alle acht Stimmen, Vibrato und
Sustain in allen Kombinationen, fünf Startwerte (29 280 Töne):

- lautester Ton bei Anschlag 1: −1,28 dBFS, alle Stimmen zwischen −1,28 und −1,32 dBFS
- keine ungültigen Werte, jeder Ton beginnt und endet bei exakt 0
- Gleichanteil unter 1e−5 des Spitzenpegels
- größter Sprung zwischen zwei Samples 0,47 (die Flanke eines hellen Pulses, kein Knacken)
- Tonhöhe: gemessen gleich Modell auf 0,001 Cent, Fehler gegen gleichstufig höchstens 6,2 Cent
- Rhythmusbox über alle Muster, 60 bis 200 BPM und 304 Startwerte, ganze und gebrochene (26 976
  Durchläufe): höchstens −2,15 dBFS (`bossa` bei 198 BPM, dort fallen die meisten Schläge zusammen)
- Rechenzeit: etwa 200-fache Echtzeit für einzelne Töne, die Demo (37 s) in 3 s

Die Demo `demos/toy-keyboard.mjs` spielt sechzehn Takte in F-Dur zur Rock-Rhythmusbox: einen
Orgelbass, eine eigene Melodie, die alle vier Takte die Stimme wechselt, Glocken, Synth-Drum-Fills
und einen Fantasy-Akkord am Schluss. Ergebnis: −15,1 LUFS, True Peak −1,0 dBTP.

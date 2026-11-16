# Square Chip

`instruments/square-chip.mjs` ist der Soundchip vieler Heimcomputer der Achtziger und mancher
Spielautomaten: drei Rechteckkanäle, ein gemeinsamer Rauschgenerator, ein Mischer pro Kanal, eine
logarithmische Lautstärke mit 16 Stufen und ein Hüllkurvengenerator in Hardware. Nachgebaut ist das
Verhalten der Register und Zähler, nicht ein bestimmtes Gerät. Typisch für diesen Klang ist der
„Buzzer“-Bass: Die Hüllkurve läuft so schnell, dass sie selbst zur Wellenform wird.

Umfang: MIDI 24 bis 96. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/square-chip.mjs';
const x = render({ midi: 45, velocity: 0.9, duration: 0.4, preset: 'buzz-saw' });
const y = render({ midi: 69, preset: 'arp', arp: 'minor', duration: 1 });
```

## Parameter

| Parameter | Bedeutung | Standard |
|---|---|---|
| `midi` | Tonhöhe, bei Schlagzeug die Stimmung relativ zu MIDI 60 | 60 |
| `velocity` | 0 bis 1, als Amplitude gerundet auf die nächste 3-dB-Stufe des Lautstärkeregisters | 0,8 |
| `duration` | Gate in Sekunden (0,01 bis 30) | 0,5 |
| `preset` | siehe unten | `'square'` |
| `vibrato` | 0 bis 1, Tiefe des verzögerten Vibratos, 1 heißt ±0,5 Halbton | je Preset |
| `envelopeShape` | Form der Hardware-Hüllkurve für `buzz-saw`, `buzz-tri`, `env-pluck` | je Preset |
| `arp` | Akkord des Presets `arp`: `major`, `minor`, `sus4`, `power`, `octave`, `maj7` | `'major'` |
| `seed` | Zufallsstartwert für Zählerphasen und Rauschregister | 1 |

## Der Chip

Der Takt beträgt 1,7734 MHz. Alle Zähler laufen mit einem Achtel davon, einem „Tick“ von
221,7 kHz. Jede Änderung am Ausgang fällt auf dieses Raster.

### Tonkanäle

Jeder Kanal hat einen 12-Bit-Zähler TP (1 bis 4095). Nach TP Ticks kippt das Rechteck, also

    f = Takt / (16 · TP)

Die Tonhöhe ist damit gerastert. Der Fehler wächst mit der Höhe, weil TP kleiner wird. Wird TP
während eines Tons kleiner als der aktuelle Zählerstand, kippt der Ausgang sofort beim nächsten
Tick. Das gibt beim Vibrato kleine Unregelmäßigkeiten, wie am echten Chip.

### Rauschen

Ein 17-Bit-Schieberegister mit Rückkopplung aus Bit 0 und Bit 3 (Periode 131071 Schritte) schiebt
alle 2 · NP Ticks einmal, NP ist ein 5-Bit-Register (1 bis 31). Bei NP = 1 sind das 110,8 kHz,
bei NP = 31 rund 3,6 kHz. Das Ausgangsbit ist Bit 0. Es gibt nur einen Rauschgenerator für alle
drei Kanäle.

### Mischer

Pro Kanal gibt es zwei Schalter. Das Signal eines Kanals ist

    bit = (Ton oder Ton aus) und (Rauschen oder Rauschen aus)

Sind beide an, entsteht ein Rechteck, das vom Rauschen zerhackt wird. Sind beide aus, steht der
Kanal konstant auf 1, und nur die Lautstärke bestimmt den Pegel. Darauf beruht der Buzzer.

### Lautstärke

Das Lautstärkeregister hat 4 Bit. Der DAC ist logarithmisch mit 3 dB pro Stufe,
`L(n) = 2^(−(15 − n)/2)`, Stufe 0 ist still:

| Stufe | Amplitude | dB | Stufe | Amplitude | dB |
|---|---|---|---|---|---|
| 0 | 0 | stumm | 8 | 0,0884 | −21,1 |
| 1 | 0,0078 | −42,1 | 9 | 0,1250 | −18,1 |
| 2 | 0,0110 | −39,1 | 10 | 0,1768 | −15,1 |
| 3 | 0,0156 | −36,1 | 11 | 0,2500 | −12,0 |
| 4 | 0,0221 | −33,1 | 12 | 0,3536 | −9,0 |
| 5 | 0,0313 | −30,1 | 13 | 0,5000 | −6,0 |
| 6 | 0,0442 | −27,1 | 14 | 0,7071 | −3,0 |
| 7 | 0,0625 | −24,1 | 15 | 1 | 0 |

Ein Bit im Lautstärkeregister schaltet den Kanal statt auf den festen Wert auf die Hüllkurve. Die
drei Kanäle werden linear addiert.

### Hüllkurve

Die Hüllkurve hat 16 Stufen und einen 16-Bit-Periodenzähler EP. Alle 2 · EP Ticks macht sie eine
Stufe. Ein Sägezahn aus 16 Stufen wiederholt sich also mit `Takt / (256 · EP)`, ein Dreieck aus
32 Stufen mit `Takt / (512 · EP)`. Vier Bits (Fortsetzen, Anstieg, Wechsel, Halten) ergeben acht
verschiedene Formen:

| `envelopeShape` | Verlauf |
|---|---|
| `decay` | einmal fallen, dann still |
| `attack` | einmal steigen, dann still |
| `decay-high` | einmal fallen, dann auf voll stehen bleiben |
| `attack-hold` | einmal steigen, dann voll halten |
| `saw-down` | fallender Sägezahn, wiederholt |
| `saw-up` | steigender Sägezahn, wiederholt |
| `tri-down` | Dreieck, beginnt fallend |
| `tri-up` | Dreieck, beginnt steigend |

Wer die Form schreibt, startet die Hüllkurve neu. Weil die Stufen durch den logarithmischen DAC
laufen, ist der Sägezahn kein linearer Sägezahn, sondern eine exponentielle Treppe: oben große
Sprünge, unten fast nichts.

### Treiber

Musik auf diesen Rechnern spielte ein Programm im Bildwechsel-Interrupt, 50 mal pro Sekunde.
Nur dann ändern sich die Register: Lautstärkeverläufe, Vibrato und Arpeggien laufen in Schritten
von 20 ms. Das Preset `kick` nimmt einen schnelleren Timer mit 300 Hz, damit die Tonhöhe schnell
genug fällt.

## Presets

| Preset | Was passiert |
|---|---|
| `square` | ein Kanal, Rechteck, Lautstärke in Software: voll, nach 3 und 6 Bildern eine Stufe tiefer, nach dem Gate 2 Stufen pro Bild |
| `echo-lead` | Kanal A spielt die Melodie, Kanal B wiederholt sie 9 Bilder (180 ms) später, 4 Stufen (12 dB) leiser und um TP · 1,004 (mindestens 1) tiefer verstimmt; dazu verzögertes Vibrato |
| `arp` | ein Kanal wechselt jedes Bild zum nächsten Akkordton, 50 Töne pro Sekunde, das Ohr hört einen Akkord |
| `buzz-saw` | Ton und Rauschen aus, Kanal auf Hüllkurve, Form `saw-down`, EP passend zur Note |
| `buzz-tri` | wie `buzz-saw`, Form `tri-up`, weicher und eine Oktave dunkler in den Obertönen |
| `env-pluck` | Rechteck mit Hardware-Hüllkurve als Lautstärke. Einmalige Formen dehnen eine Rampe über die Notendauer, wiederholte laufen mit 4 Hz als Tremolo |
| `noise-hat` | Rauschen mit NP = 1, fällt 4 Stufen pro Bild; ab `duration` 0,2 s offen, 1 Stufe pro Bild |
| `noise-snare` | Kanal A Rauschen (NP = 6), die ersten zwei Bilder mit Ton und Rauschen zugleich; Kanal B ein fallender Ton ab 190 Hz |
| `kick` | Ton fällt von 8 · f auf f = 52 Hz mit Zeitkonstante 11 ms, darüber ein kurzer Rauschstoß |

Beim Buzzer bestimmt die Hüllkurve selbst den Pegel, das Lautstärkeregister ist abgeschaltet. Die
`velocity` wirkt dort als analoger Pegel in denselben 3-dB-Stufen. Zum Loslassen wartet der
Treiber, bis die Hüllkurve bei 0 steht, und schaltet den Kanal dann ab. So endet die Welle ohne
Sprung, höchstens eine Periode nach dem Gate. Für die Buzzer-Presets sind nur die vier
wiederholten Formen erlaubt.

Bei den Schlagzeug-Presets verschiebt `midi` die Stimmung um `midi − 60` Halbtöne, begrenzt auf −12
bis +24. Beim Rauschen wird NP entsprechend kleiner oder größer.

## Tonhöhe

Die Teiler sind ganzzahlig, also stimmt die Tonhöhe nicht genau. Fehler in Cent (Stimmung
A = 440 Hz):

| MIDI | TP | Ton | EP Säge | Säge | EP Dreieck | Dreieck |
|---|---|---|---|---|---|---|
| 24 | 3389 | 0,1 | 212 | −1,4 | 106 | −1,4 |
| 30 | 2397 | −0,3 | 150 | −2,5 | 75 | −2,5 |
| 36 | 1695 | −0,4 | 106 | −1,4 | 53 | −1,4 |
| 42 | 1198 | 0,4 | 75 | −2,5 | 37 | 20,7 |
| 48 | 847 | 0,6 | 53 | −1,4 | 26 | 31,5 |
| 54 | 599 | 0,4 | 37 | 20,7 | 19 | −25,4 |
| 60 | 424 | −1,4 | 26 | 31,5 | 13 | 31,5 |
| 66 | 300 | −2,5 | 19 | −25,4 | 9 | 68,2 |
| 72 | 212 | −1,4 | 13 | 31,5 | 7 | −96,8 |
| 78 | 150 | −2,5 | 9 | 68,2 | 5 | −114,2 |
| 84 | 106 | −1,4 | 7 | −96,8 | 3 | 170,1 |
| 90 | 75 | −2,5 | 5 | −114,2 | 2 | 272,1 |
| 96 | 53 | −1,4 | 3 | 170,1 | 2 | −327,9 |

Der Rechteckton bleibt über den ganzen Umfang innerhalb von 12,9 Cent. Der Buzzer ist grob: Der
Sägezahn bleibt bis MIDI 45 innerhalb von 10 Cent, das Dreieck nur bis MIDI 33. Darüber wird er
hörbar schief, und das ist der Grund, warum man ihn auf diesen Rechnern fast nur als Bass hörte.
Gemessen an den Nulldurchgängen eines gehaltenen Tons stimmen Modell und Formel auf 0,01 Cent
überein.

## Wiedergabe mit 48 kHz

Der Chip arbeitet mit 221,7 kHz, seine Ausgabe ist eine Treppe. Jeder Sprung wird als
bandbegrenzte Stufe eingesetzt: das Integral eines sinc mit Kaiser-Fenster, Grenzfrequenz
20 kHz, 64 Abtastwerte breit, tabelliert mit 1/512 Abtastwert. Die Summe aller Stufen ist genau
die bandbegrenzte Fassung des Chipausgangs. Alles, was der Chip selbst erzeugt (Treppen, harte
Kanten, Glitches beim Registerwechsel, Klicks der Lautstärkestufen alle 20 ms), bleibt. Spiegelungen
kommen keine dazu. In den Spektrogrammen der höchsten Noten, des Vibratos auf MIDI 96 und des
Rauschens mit NP = 1 sind keine zu sehen.

Der Chipausgang ist nur positiv. Ein Koppelkondensator als Hochpass bei 12 Hz nimmt den
Gleichanteil weg, ein RC-Tiefpass bei 14 kHz steht für die Ausgangsstufe. Beim Einschalten eines
Tons springt der Mittelwert, der Hochpass lässt ihn in etwa 13 ms abklingen. Das gehört zum Klang.

## Messwerte

Prüflauf über jede zweite Note von 24 bis 96, Velocity 0,2, 0,6 und 1, alle Presets, Vibrato 0 und
1, alle Hüllkurvenformen und Akkorde, Dauer 0,15 und 1,2 s, zwei Seeds (22644 Töne):

- lautester Ton: −1,5 dBFS je Preset (feste Verstärkung pro Preset, keine Begrenzung am
  Ausgang). Bei `noise-hat` und `noise-snare` hängt die Spitze vom Startwert des Rauschens ab.
  Geprüft mit 500 Seeds, Dauer 0,01 bis 2 s, Vibrato aus und an; bei jedem zehnten Seed jede Note
  und Velocity 0,2 bis 1, sonst jede sechste Note bei Velocity 1. Dazu ein Kontrolllauf mit 120
  neuen Seeds. Ergebnis: höchstens −2,0 dBFS. Die
  lauteste Spitze liegt oft bei Velocity 0,9, nicht bei 1. `kick` erreicht höchstens −1,4 dBFS.
- Velocity 0,6 liegt 3 dB, Velocity 0,2 rund 15 dB darunter
- keine NaN, jeder Ton beginnt und endet bei exakt 0
- Gleichanteil höchstens 6 · 10⁻⁸ des Spitzenwerts
- gleicher Seed gibt identische Samples, gebrochene Seeds andere
- etwa 280-fach schneller als Echtzeit

Das Hörbeispiel spielt acht Takte in a-Moll mit Buzzer-Bass, Arpeggien,
Echo-Melodie und Chip-Schlagzeug: −22,5 LUFS, True Peak −1,0 dBTP.

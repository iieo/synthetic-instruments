# FM-Soundkarte

`instruments/fm-chip.mjs` ist ein Modell des FM-Chips auf den Soundkarten früher PCs. Jede Stimme
hat nur zwei Operatoren, einen Modulator und einen Träger. Der Chip rechnet mit kleinen Tabellen
im logarithmischen Bereich, einer Phase von 10 Bit und einer eigenen Abtastrate um 49,7 kHz. Das
macht den Klang rau und etwas blechern, ganz anders als der saubere Vier-Operator-Synth
`fm-synth`.

Umfang: MIDI 24 bis 96. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/fm-chip.mjs';
const x = render({ midi: 67, velocity: 0.8, duration: 1, preset: 'brass', brightness: 0.6 });
```

## Abtastrate und Tonhöhe

Der Chip rechnet ein Sample pro 288 Takte seines 14,318-MHz-Quarzes, also mit 49716 Hz. Die
Tonhöhe kommt aus einer 10-Bit-F-Nummer und einer 3-Bit-Oktave (Block):

    f = F · 49716 Hz · 2^(Block − 20)

Das Modell nimmt den kleinsten Block, in den die F-Nummer noch passt, damit sie groß und der
Fehler klein bleibt. Weil die Oktaven nur verschoben werden, wiederholt sich der Fehler in jeder
Oktave:

| MIDI | Block | F | Frequenz | Fehler |
|---|---|---|---|---|
| 24 | 0 | 690 | 32,715 Hz | +0,62 Cent |
| 26 | 0 | 774 | 36,697 Hz | −0,50 Cent |
| 30 | 0 | 975 | 46,227 Hz | −0,82 Cent |
| 36 | 1 | 690 | 65,430 Hz | +0,62 Cent |
| 60 | 3 | 690 | 261,719 Hz | +0,62 Cent |
| 66 | 3 | 975 | 369,820 Hz | −0,82 Cent |
| 94 | 6 | 615 | 1866,167 Hz | +1,40 Cent |
| 96 | 6 | 690 | 2093,748 Hz | +0,62 Cent |

Der größte Fehler im Umfang ist 1,45 Cent.

Der Phasenzähler hat 20 Bit. Pro Sample wächst er um `(F · 2M) << Block >> 1`. M ist der
Frequenzmultiplikator aus der Tabelle ½, 1, 2, 3 … 10, 10, 12, 12, 15, 15. Nur diese Verhältnisse
gibt es, krumme Verhältnisse wie beim großen FM-Synthesizer sind nicht möglich.

## Operator

Die oberen 10 Bit des Zählers sind die Phase. Ein Viertel der Sinusperiode liegt als Tabelle mit
256 Einträgen im logarithmischen Bereich vor:

    LOGSIN[i] = round(−log2(sin((i + 0,5) π / 512)) · 256)

Eine Einheit ist 1/256 Oktave Pegel, also 0,0235 dB. Zum Tabellenwert addiert der Chip die
Dämpfung (Hüllkurve, Gesamtpegel, Tastaturskalierung, Tremolo), jeder Hüllkurvenschritt zählt
8 Einheiten, also 0,1875 dB. Zurück ins Lineare geht es mit einer zweiten Tabelle für den
Nachkommateil und einer Verschiebung für den ganzzahligen Teil:

    MANT[i] = round(2048 · 2^(−i / 256)),   y = MANT[A mod 256] >> floor(A / 256)

Das Ergebnis hat 12 Bit plus Vorzeichen. Die groben Tabellen und die 10-Bit-Phase geben dem Ton
einen feinen Klirr und bei leisen Pegeln deutliche Stufen.

Vier Wellenformen sind möglich, alle aus derselben Tabelle:

| Wert | Name | Form |
|---|---|---|
| 0 | `sine` | voller Sinus |
| 1 | `half` | nur die positive Halbwelle, die negative ist null |
| 2 | `abs` | Betrag des Sinus, zwei Bögen pro Periode |
| 3 | `quarter` | in jeder Halbperiode nur das erste Viertel, ein pulsierender Bogen |

## Modulation und Rückkopplung

Der Modulatorausgang m (bis ±2048) wird direkt zur 10-Bit-Phase des Trägers addiert. Voller
Modulatorpegel ergibt also einen Modulationsindex von 4π, und schon der Gesamtpegel dämpft in
Schritten von 0,75 dB. Mit dem Verbindungsbit `add` gehen beide Operatoren nebeneinander an den
Ausgang, wie bei der Orgel.

Der Modulator kann sich selbst modulieren. Die Summe seiner letzten beiden Ausgänge geht mit
`(m₁ + m₂) >> (8 − FB)` in seine Phase, FB = 1 … 7 reicht von π/16 bis 4π. Ab FB 6 wird der
Sinus sägezahnartig, bei 7 kippt er in Rauschen.

## Hüllkurve

Die Dämpfung hat 9 Bit (0 bis 511, also 96 dB). Anstieg, Abfall und Ausklang haben je 4-Bit-Raten
R, der Haltepegel 4 Bit in Schritten von 3 dB (Wert 15 heißt 93 dB). Aus R wird die effektive Rate

    r = 4 R + KSR-Anteil

Der KSR-Anteil kommt aus Block und oberstem F-Bit, ohne gesetztes KSR-Bit durch 4 geteilt. Hohe
Töne laufen so schneller ab. Ein globaler Zähler schreitet ein Sample pro Takt voran. Bei Rate r
wird nur alle `2^(12 − r/4)` Samples geprüft, und in jedem Achterblock dieser Prüfungen treten 4
bis 7 Schritte ein, je nach r mod 4. Ab r = 52 kommen mehrere Schritte pro Sample. Im Abfall
wächst die Dämpfung um diese Schritte. Im Anstieg schrumpft sie pro Schritt um ein Achtel ihres
Wertes plus eins, das gibt die typische, erst schnelle und dann weiche Anstiegskurve.

| R | Anstieg | Abfall über 96 dB |
|---|---|---|
| 1 | 2,84 s | 42,1 s |
| 4 | 355 ms | 5,26 s |
| 6 | 89 ms | 1,31 s |
| 8 | 22 ms | 329 ms |
| 10 | 5,6 ms | 82 ms |
| 12 | 1,4 ms | 21 ms |
| 14 | 0,3 ms | 5,1 ms |
| 15 | sofort | 1,3 ms |

Mit gesetztem Haltebit bleibt der Operator auf dem Haltepegel, bis die Taste losgelassen wird.
Ohne klingt er nach Erreichen des Haltepegels mit der Ausklangrate weiter ab, wie eine gezupfte
Saite.

Tastaturskalierung des Pegels: 0, 1,5, 3 oder 6 dB pro Oktave über 65 Hz, gerastert auf
0,1875 dB.

## Tremolo und Vibrato

Beide laufen mit festen Raten aus Zählern, die der Chip ständig weiterzählt:

- Tremolo: Dreieck mit einer Periode von 13440 Samples (3,7 Hz), Tiefe 4,9 dB oder 1,1 dB.
- Vibrato: acht Stufen 0, 1, 2, 1, 0, −1, −2, −1 über 8192 Samples (6,1 Hz). Die Stufe wird mal
  F/128 (tief) oder F/256 zur F-Nummer addiert, das sind bis etwa 14 bzw. 7 Cent, in sichtbaren
  Treppen.

Weil die Zähler frei laufen, steht ihre Phase beim Anschlag irgendwo. Der Seed legt fest, wo.

## Rhythmusstimmen

Der Chip hat einen Rhythmusmodus, in dem einzelne Operatoren ihre Phase nicht aus dem Zähler,
sondern aus Rauschen und einzelnen Phasenbits nehmen:

- `drum-kick` ist eine normale Zwei-Operator-Stimme. Der Treiber senkt 70 Mal pro Sekunde die
  F-Nummer, die Tonhöhe fällt in Stufen vom 3,2-fachen auf den Grundton.
- `drum-snare`: Ein Phasenbit des eigenen Zählers wählt zwischen zwei Phasen, das Rauschbit
  dreht die Hälfte davon um. Heraus kommen fast nur die Werte voll positiv, null und voll negativ,
  ein Rechtecksignal mit Rauschen.
- `drum-hat`: Je zwei Bits aus zwei Phasenzählern (Verhältnis 1,47) werden per XOR verknüpft und
  bestimmen das Vorzeichen, das Rauschbit wählt zwischen einem großen und einem kleinen Wert. Das
  gibt den metallischen, rauen Klang.

Das Rauschen kommt aus einem 23-Bit-Schieberegister mit Rückkopplung aus Bit 22 und 4, einmal pro
Sample getaktet. Drums ignorieren `duration` und nehmen die Note als Stimmung: MIDI 60 ergibt eine
Bassdrum bei 65 Hz, eine Snare bei 196 Hz und eine Hi-Hat bei 1046 Hz.

## Ausgang

Der Chip gibt seine Samples seriell an einen DAC mit Gleitkommaformat: 10 Bit Mantisse und 3 Bit
Exponent. Laute Samples verlieren so ihre unteren Bits, die Stufe liegt immer etwa 54 dB unter
dem aktuellen Pegel. Das ist ein Teil des körnigen Klangs.

Danach hält der DAC jeden Wert eine Chipabtastung lang, und ein Kaiser-gefensterter Sinc mit
Grenze 20,5 kHz (40 Abgriffe, 256 Zwischenphasen) rechnet von 49716 Hz auf 48000 Hz um. Das
Halten dämpft die Höhen wie bei der Vorlage (etwa −2,5 dB bei 20 kHz). Spiegelungen, die der Chip
selbst bei 49,7 kHz erzeugt, etwa bei hellen Tönen mit `quarter`-Welle und viel Modulation, sind
Teil des Klangs. Das Umrechnen fügt keine neuen hinzu. Ein Hochpass bei 20 Hz nimmt den
Gleichanteil von Halb-, Betrags- und Viertelsinus heraus.

## Presets

| Preset | Verbindung | Idee |
|---|---|---|
| `piano` | FM, FB 4 | Modulator mit fallendem Pegel, beide ohne Haltebit, mit KSR. Klingt wie die Klavierimitation früher Spiele. |
| `organ` | additiv, FB 3 | Träger als Sinus, Modulator als Betragssinus eine Oktave höher, Vibrato. |
| `brass` | FM, FB 6 | Langsamerer Modulatoranstieg, der Ton wird beim Einschwingen heller. Vibrato. |
| `bass` | FM, FB 5 | Kurzer heller Anschlag, dann gehaltener Grundton. |
| `strings` | FM, FB 6, zwei Kanäle | Langsamer Anstieg, tiefes Vibrato, Tremolo. Der zweite Kanal liegt drei F-Schritte höher und schwebt. |
| `bell` | FM | Modulator ×7, Träger ×2, also Verhältnis 3,5. Langer Ausklang. |
| `guitar` | FM, FB 6 | Modulator ×3 als Halbsinus, beide abklingend wie eine gezupfte Saite. |
| `drum-kick`, `drum-snare`, `drum-hat` | Rhythmus | siehe oben |

## Parameter

| Parameter | Bereich | Wirkung |
|---|---|---|
| `midi` | 24 … 96 | Note, auf ganze Zahlen gerundet |
| `velocity` | 0 … 1 | Gesamtpegel des Trägers bis 15 dB leiser, des Modulators bis 6 dB leiser |
| `duration` | 0,01 … 30 s | Taste gedrückt |
| `brightness` | 0 … 1 | Gesamtpegel des Modulators um +9 dB (0) bis −9 dB (1), in Schritten von 0,75 dB |
| `waveform` | `sine`, `half`, `abs`, `quarter` | ersetzt die Welle des Trägers, ohne Angabe die des Presets |
| `seed` | Zahl | Stand der Zähler für Tremolo, Vibrato und Hüllkurve und des Rauschregisters |

Ein Ton beginnt und endet exakt bei null.

## Messwerte

Pegelprüfung über jede zweite Note des Umfangs, alle Presets, Anschlag 0,2, 0,6 und 1,
`brightness` 0 und 1 mit allen vier Trägerwellen sowie mehrere Seeds (über 20000 Töne): lautester
Ton −1,65 dBFS, kein NaN, erster und letzter Sample 0, Gleichanteil unter 3 · 10⁻⁶. Lange Töne
(6 s) von Streichern, Orgel und Bläsern bleiben unter −2 dBFS.

Rechenzeit: etwa 60-mal schneller als Echtzeit.

Hörbeispiel `demos/fm-chip.mjs`: 16 Takte in g-Moll im Stil eines PC-Spiels der frühen Neunziger
mit allen Presets, −17,7 LUFS, True Peak −1,0 dBTP.

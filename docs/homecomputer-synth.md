# Heimcomputer-Synth

`instruments/homecomputer-synth.mjs` ist ein Modell des dreistimmigen Klangchips, der in
Heimcomputern der Achtziger saß. Jede Stimme hat einen digitalen Oszillator mit vier Wellenformen,
eine eigene Hüllkurve und kann von der Nachbarstimme synchronisiert oder ringmoduliert werden. Alle
drei Stimmen laufen durch ein analoges, resonantes Multimodefilter. Gespielt wurde der Chip von
einer Abspielroutine, die 50 Mal pro Sekunde seine Register beschrieb. Genau so arbeiten auch die
Presets: Vibrato, Pulsbreitenmodulation, Filterhüllkurve und Arpeggio entstehen Bild für Bild.

Umfang: MIDI 24 bis 96. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/homecomputer-synth.mjs';
const x = render({ midi: 45, velocity: 0.9, duration: 0.5, preset: 'bass', filter: 0.15 });
```

## Takt und Tonhöhe

Der Chip läuft im Modell mit 960 kHz. Das ist das Zwanzigfache von 48 kHz und liegt nahe an der
knappen Million Takte pro Sekunde der Vorlage. Jede Stimme hat einen 24-Bit-Phasenakkumulator, zu
dem in jedem Takt das 16-Bit-Frequenzregister addiert wird:

    f = F · 960000 / 2^24        (F = 0 … 65535, also bis 3750 Hz)

Die Tonhöhe ist damit auf ganze Registerwerte gerastert. Der Fehler gegenüber gleichstufiger
Stimmung:

| MIDI | Register | Frequenz | Fehler |
|---|---|---|---|
| 24 | 572 | 32,730 Hz | +1,42 Cent |
| 26 | 642 | 36,736 Hz | +1,29 Cent |
| 30 | 808 | 46,234 Hz | −0,57 Cent |
| 36 | 1143 | 65,403 Hz | −0,09 Cent |
| 48 | 2286 | 130,806 Hz | −0,09 Cent |
| 60 | 4572 | 261,612 Hz | −0,09 Cent |
| 72 | 9144 | 523,224 Hz | −0,09 Cent |
| 84 | 18289 | 1046,505 Hz | 0,00 Cent |
| 94 | 32587 | 1864,643 Hz | −0,01 Cent |

Der größte Fehler im ganzen Umfang ist 1,42 Cent bei der tiefsten Note. Im gerenderten Ton
gemessen (Autokorrelation) liegt die Tonhöhe auf weniger als 1 Cent genau.

## Wellenformen

Aus dem Akkumulator A (24 Bit) entstehen 12-Bit-Werte:

- Sägezahn: die oberen 12 Bit von A.
- Dreieck: Bit 11 bis 22, bei gesetztem obersten Bit invertiert. Mit Ringmodulation wird statt des
  eigenen obersten Bits dessen XOR mit dem obersten Bit der Nachbarstimme genommen. Das Dreieck
  springt dann im Takt der Nachbarstimme um, so entstehen glockenartige Summen und Differenzen.
- Puls: voll, solange die oberen 12 Bit von A mindestens so groß sind wie das 12-Bit-Pulsbreiten-
  register, sonst null.
- Rauschen: ein 23-Bit-Schieberegister mit Rückkopplung aus Bit 22 und 17. Es wird weitergetaktet,
  wenn Bit 19 des Akkumulators von 0 auf 1 geht, also 16 Mal pro Oszillatorperiode. Acht über das
  Register verteilte Bits bilden die oberen acht Bits des Ausgangs.

Sind mehrere Wellenformen gleichzeitig eingeschaltet, ziehen sich im Chip die Ausgänge gegenseitig
nach unten. Das Modell bildet das als bitweises UND nach, und ein Bit bleibt nur stehen, wenn auch
ein Nachbarbit gesetzt ist. Heraus kommen dünne, kratzige Mischformen wie im Preset `combo`.

Harte Synchronisation: Geht das oberste Bit der Nachbarstimme von 0 auf 1, wird der eigene
Akkumulator auf null gesetzt. Stimme 1 hängt an Stimme 3, Stimme 2 an Stimme 1, Stimme 3 an Stimme 2.

Der Stimmausgang ist `(W − 2048 + 260) · L / 255` mit dem Wellenwert W und dem Hüllkurvenpegel L.
Der kleine Versatz 260 bildet nach, dass der Nullpunkt der Wellenform im Chip nicht in der Mitte
liegt. Die Hüllkurve verschiebt deshalb auch einen Gleichanteil, und nach dem Koppelkondensator am
Ausgang wird daraus der leise Plopp bei schnellen Anschlägen. Bei Mischwellen mit vielen Nullbits
ist er deutlicher.

## Hüllkurve

Der Pegel L ist ein 8-Bit-Zähler. Für jede der 16 Rateneinstellungen gibt es eine Periode in
Takten: nach dieser Zahl Takte zählt die Hüllkurve einen Schritt. Die Perioden sind aus den
Anstiegszeiten der Vorlage hergeleitet, 255 Schritte ergeben den vollen Anstieg:

    Periode = round(t_Anstieg · 960000 / 255)

Abfall und Ausklang teilen den Ratentakt zusätzlich, und zwar umso stärker, je leiser der Pegel
ist: über 93 durch 1, über 54 durch 2, über 26 durch 4, über 14 durch 8, über 6 durch 16, darunter
durch 30. So entsteht eine stückweise exponentielle Kurve, die rund dreimal so lange braucht wie
der Anstieg. Der Haltepegel ist 4 Bit, Wert s ergibt L = 17 s.

| Rate | Periode | Anstieg | Abfall auf null |
|---|---|---|---|
| 0 | 8 | 2,1 ms | 6 ms |
| 2 | 60 | 16 ms | 47 ms |
| 4 | 143 | 38 ms | 113 ms |
| 6 | 256 | 68 ms | 202 ms |
| 8 | 376 | 100 ms | 296 ms |
| 9 | 941 | 250 ms | 741 ms |
| 10 | 1882 | 500 ms | 1,48 s |
| 12 | 3765 | 1,0 s | 2,97 s |
| 15 | 30118 | 8,0 s | 23,7 s |

Am Ende des Ausklangs fällt der Pegel in einzelnen Stufen von 1/255 auf null. Diese feinen Stufen
gehören zum Chip.

## Filter

Die Stimmen, die ein Preset ins Filter schickt, laufen durch ein Zustandsvariablenfilter, das mit
dem Chiptakt gerechnet wird:

    hp = x − lp − q · bp
    bp ← sat(bp + f · hp)
    lp ← lp + f · bp

mit `f = 2 sin(π fc / 960 kHz)`. Tiefpass, Bandpass und Hochpass lassen sich einzeln oder gemischt
abgreifen (`drum-snare` nutzt Tief- plus Hochpass, also eine Kerbe). `sat(x) = x (27 + x²) /
(27 + 9 x²)` ist eine weiche Sättigung des Bandpasszustands, wie sie die Integratoren des
analogen Filters zeigen. Sie begrenzt die Resonanz bei lauten Signalen.

Der 11-Bit-Cutoff R läuft fast linear: `fc = 30 Hz + 11970 Hz · (R / 2047)^1,15`, also von 30 Hz
bis 12 kHz. Die Resonanz hat 4 Bit, Wert r ergibt die Güte `Q = 0,707 · 2^(2,1 r / 15)`, also 0,71
bis 3,0. Die Abspielroutine schreibt den Cutoff 50 Mal pro Sekunde. Eine Filterhüllkurve läuft
deshalb in hörbaren Stufen, wie bei der Vorlage.

Danach kommt das 4-Bit-Lautstärkeregister, ein RC-Tiefpass bei 16 kHz und am Ende ein Hochpass
bei 16 Hz als Koppelkondensator. Der entfernt den Gleichanteil, den der Chip am Ausgang hat.

## Vom Chiptakt nach 48 kHz

Die Wellenformen haben harte Kanten und werden mit 960 kHz abgetastet, genau wie im Chip. Was sich
dabei zwischen 480 kHz und dem Takt spiegelt, ist Teil der Vorlage und liegt im Hörbereich etwa
90 dB unter dem Grundton. Beim Herunterrechnen entsteht keine neue Spiegelung: Ein FIR-Tiefpass
mit 121 Abgriffen (Kaiser-Fenster) bringt das Signal auf 96 kHz, ein zweiter mit Grenze 20,5 kHz
auf 48 kHz. Im Spektrogramm der höchsten Noten liegt zwischen den Obertönen nur ein Rauschteppich
um −95 dB.

## Presets

| Preset | Stimmen | Idee |
|---|---|---|
| `bass` | Sägezahn und leicht verstimmter Puls | Tiefpass mit Filterhüllkurve, die pro Bild um den Faktor 0,7 fällt. Die Pulsbreite schwankt leicht. |
| `lead` | Puls | Pulsbreitenmodulation als Dreieck über 40 Bilder, Vibrato 5,5 Hz mit ±0,35 Halbtönen, das nach 0,2 s einsetzt. |
| `sync-lead` | Sägezahn, synchronisiert auf eine stumme Stimme | Die synchronisierte Stimme gleitet vom 3,2-fachen zum 1,5-fachen der Note, die Tonhöhe bleibt die der Führungsstimme. |
| `ring-bell` | Dreieck mit Ringmodulation und Dreieck eine Oktave höher | Die stumme Modulationsstimme läuft beim 2,76-fachen, das gibt unharmonische Teiltöne. Ohne Haltepegel, langer Ausklang. |
| `arp` | Puls | Akkord als Arpeggio im Bildtakt: jede fünfzigstel Sekunde der nächste Akkordton. Auswahl mit `chord`. |
| `pad` | Zwei Pulse und ein Dreieck eine Oktave tiefer | Langsamer Anstieg (500 ms), zwei langsame, unabhängige Pulsbreitenmodulationen, ein langsam atmender Cutoff. |
| `combo` | Sägezahn mit Dreieck, Puls mit Dreieck eine Oktave höher | Die kratzigen Mischwellenformen. |
| `drum-kick` | eine Stimme, Wellenform pro Bild | Bild 0 Rauschen als Klick, Bild 1 Puls, danach ein Dreieck, dessen Frequenz pro Bild fällt. |
| `drum-snare` | eine Stimme, Wellenform pro Bild | Zwei Bilder Dreieck als Körper, danach hohes Rauschen. |

Drums ignorieren `duration` (Gate 9 bzw. 7 Bilder) und nehmen die Note als Stimmung: MIDI 60 gibt
eine Bassdrum mit 65 Hz und eine Snare mit 196 Hz.

## Parameter

| Parameter | Bereich | Wirkung |
|---|---|---|
| `midi` | 24 … 96 | Note, auf ganze Zahlen gerundet |
| `velocity` | 0 … 1 | 4-Bit-Lautstärkeregister `max(1, round(15 v))`, dazu die Tiefe der Filterhüllkurve |
| `duration` | 0,01 … 30 s | Gate, auf das 50-Hz-Raster gerundet |
| `filter` | 0 … 1 | Cutoff-Register `round(2047 · filter)`, Voreinstellung je Preset |
| `resonance` | 0 … 1 | Resonanzregister `round(15 · resonance)` |
| `pw` | 0 … 1 | Pulsbreite von 2 % bis 98 %, nur bei Presets mit Puls |
| `chord` | `major`, `minor`, `sus4`, `power` | Akkord des Presets `arp` |
| `seed` | Zahl | Stand von Oszillatoren und Rauschregistern beim Anschlag |

Ein Ton beginnt und endet exakt bei null.

## Messwerte

Pegelprüfung über jede zweite Note des Umfangs, alle Presets, Anschlag 0,2, 0,6 und 1, die
Extremwerte von `filter`, `resonance` und `pw` sowie mehrere Seeds (14580 Töne): lautester Ton
−1,96 dBFS, kein NaN, erster und letzter Sample 0, Gleichanteil unter 4 · 10⁻⁵. Die
Ausgangsverstärkung ist pro Preset fest. Am lautesten wird jeder Preset mit Filter und Resonanz
voll offen.

Rechenzeit: etwa zehnmal schneller als Echtzeit, die meiste Zeit kostet der Chip selbst mit
960000 Takten pro Sekunde.

Hörbeispiel `demos/homecomputer-synth.mjs`: 16 Takte in d-Moll mit allen Presets, −17,9 LUFS,
True Peak −1,0 dBTP.

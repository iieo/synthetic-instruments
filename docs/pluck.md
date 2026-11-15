# Pluck

`instruments/pluck.mjs` erzeugt kurze, helle Synthesizer-Töne für Trance, House und Eurodance:
den gezupften Sägezahn-Pluck mit schnell schließendem Filter, einen glasigen Glocken-Pluck, einen
Marimba-artigen Synth-Mallet und einen Rechteck-Lead im Stil früher Spielkonsolen. Jede Note bringt
auf Wunsch ihr eigenes Stereo-Echo mit, die Wiederholungen stecken also schon im zurückgegebenen
Puffer.

```js
import { render, meta } from './instruments/pluck.mjs';
// meta.presets: ['pluck', 'bell', 'mallet', 'chip'], meta.range: [36, 96]
const [L, R] = render({ preset: 'pluck', midi: 76, velocity: 0.9, duration: 0.1 });
const dry = render({ preset: 'bell', midi: 84, mix: 0 });
const lead = render({ preset: 'chip', midi: 79, duration: 0.8, delay: 0.3, feedback: 0.4 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `pluck`, `bell`, `mallet` oder `chip` |
| `midi` | Tonhöhe als MIDI-Note, 36 bis 96 |
| `velocity` | 0 bis 1, steuert Pegel und Helligkeit (Filterhüllkurve oder FM-Index) |
| `duration` | Haltezeit in Sekunden; die gezupften Presets klingen auch vorher von selbst aus |
| `seed` | Startwert für die Oszillatorphasen |
| `delay` | Echozeit in Sekunden, frei und ohne Tempobezug; `0` schaltet das Echo ab |
| `feedback` | Rückkopplung des Echos, 0 bis 0,9 |
| `mix` | Pegel der Wiederholungen, 0 bis 1, `0` ergibt den trockenen Ton |
| `bend`, `glide` | Pitch-Bend in Halbtönen (Zahl, Funktion oder Stützpunkte) und Portamento in Sekunden |

Das Ergebnis ist ein Paar `[left, right]` aus `Float64Array` bei 48 kHz, einschließlich der
Echo-Fahne.

## Signalfluss

```
Klangerzeuger (4x überabgetastet) -> Hüllkurve -> Dezimation auf 48 kHz
  -> Ping-Pong-Echo -> DC-Blocker -> Ausblendung am Ende
```

### `pluck`: Sägezähne und Filter

Drei band-begrenzte Sägezähne (PolyBLEP, Välimäki und Huovilainen 2007): einer in der Mitte, zwei um
±9 Cent verstimmt und links und rechts verteilt. Dazu ein leises Rechteck eine Oktave tiefer, das
dem Ton Körper gibt. Alles läuft durch zwei zustandsvariable Filter in Reihe (Tiefpass vierter
Ordnung, Zavalishin 2012), die Grenzfrequenz fällt schnell:

```
fc = 150 Hz + 1,3·f0 + (2500 + 9500·v²) · e^(−t/50 ms)
```

Dieses Zuschnappen des Filters ist der eigentliche Pluck: Der Anschlag ist hell, nach wenigen
Zehntelsekunden bleibt nur der Grundton mit wenigen Obertönen.

### `bell` und `mallet`: Phasenmodulation

Zwei Sinus-Operatoren, bei denen ein Modulator die Phase des Trägers verschiebt
(`sin(2π·fc·t + I(t)·sin(2π·fm·t))`, Chowning 1973). Der Index `I` bestimmt, wie viele Seitenbänder
entstehen, und klingt schneller ab als der Ton. So ist der Anschlag reich und das Ende fast ein
reiner Sinus.

- `bell`: Modulator beim 3,5fachen Grundton. Das Verhältnis ist nicht ganzzahlig, die Seitenbänder
  liegen unharmonisch wie bei einer Glocke. Index `(0,8 + 2,4·v)·e^(−t/0,22 s) + 0,25`. Links und
  rechts haben je einen eigenen Operator, rechts 3 Cent höher, das ergibt eine langsame Schwebung im
  Raum. Dazu ein kurzer heller Anteil eine Oktave höher (Verhältnis 2 : 1).
- `mallet`: Modulator beim 4fachen Grundton, Index fällt in 25 ms. Das gibt den hölzernen Anschlag.
  Ein leiser Sinus bei 4·f0, der in 70 ms abklingt, erinnert an den gestimmten Oberton eines
  Klangstabs. Mono.

Für hohe Töne wird der Index zurückgenommen (ab C5 bis zu Faktor 0,3), damit der Klang oben nicht
schrill wird. Die Seitenbänder reichen bei 192 kHz Rechenrate nicht bis in den Spiegelbereich.

### `chip`: Rechteck mit Stufen

Ein band-begrenztes Pulssignal (zwei PolyBLEP-Korrekturen, an steigender und fallender Flanke).
Das Tastverhältnis springt nach 60 ms von 12,5 % auf 25 %, wie bei den Soundchips früher
Heimcomputer und Konsolen, die nur wenige feste Pulsbreiten kannten. Der Wechsel passiert nur am
Periodenanfang, damit keine Flanke ungeglättet springt. Nach 180 ms setzt ein Vibrato ein (6 Hz,
±30 Cent). Ein sanfter Tiefpass bei 11 kHz nimmt die letzte Schärfe.

### Hüllkurven

Halbkosinus-Attack (1 bis 2 ms), dann exponentieller Abfall. Die Abklingzeit ist für C4 angegeben
und halbiert sich alle 30 Halbtöne, hohe Töne sind also kürzer, wie bei echten gezupften
Instrumenten. Die gezupften Presets fallen auf null, `chip` hält 70 %. Am Ende der Haltezeit
folgt ein Halbkosinus-Release.

### Echo

Ein Ping-Pong-Echo mit fester Zeit in Sekunden. Der Ton geht in die linke Leitung, ihr Ausgang
speist die rechte, deren Ausgang über die Rückkopplung wieder die linke. Die erste Wiederholung
kommt links, die zweite rechts. In der Schleife liegen ein Tiefpass bei 3,8 kHz und ein Hochpass
bei 220 Hz, jede Wiederholung wird also dunkler und dünner, wie bei einem Band- oder Eimerketten-Echo.
Die Pufferlänge wird so gewählt, dass die Wiederholungen unter etwa −66 dB fallen (höchstens 4 s).

| Preset | Echozeit | Rückkopplung | Mischung |
| --- | --- | --- | --- |
| `pluck` | 0,30 s | 0,38 | 0,30 |
| `bell` | 0,36 s | 0,35 | 0,24 |
| `mallet` | 0,25 s | 0,30 | 0,16 |
| `chip` | 0,20 s | 0,30 | 0,14 |

## Demo

`node demos/pluck.mjs` schreibt `out/pluck.wav` (27,6 s, Stereo, 24 Bit):

- 0 bis 10 s: jedes Preset mit einer kurzen Figur, der letzte Pluck mit Echo
- ab 10 s: acht Takte mit 128 BPM, ein Pluck-Arpeggio in Sechzehnteln über a-Moll, F, C und G mit
  Echo, Glocken-Akzente auf jedem Takt und ab Takt 5 eine eigene Melodie auf dem Chip-Lead

Normalisierung mit einer einzigen linearen Verstärkung auf −1 dBFS Spitze, True-Peak unter
−0,6 dBTP. Kein Limiter.

## Messungen

- **Pegel:** einzelne Noten mit Anschlag 1 von MIDI 36 bis 96, drei Seeds, kurz und lang, mit
  Standard-Echo: höchste Spitze −2,0 dBFS, kein NaN, Gleichanteil unter 1e−8. Mit Rückkopplung 0,9
  und Mischung 1 türmen sich kurze Echos auf einem gehaltenen Ton auf, ohne Schutz bis +5,6 dBFS
  (Chip, 50 ms Echozeit). Deshalb wird eine Note, deren Spitze über −1,2 dBFS läge, als Ganzes
  linear auf −1,2 dBFS abgesenkt. Höchste Spitze über alle Presets, Echozeiten, Rückkopplungen und
  Mischungen damit −1,2 dBFS.
- **Ränder:** erstes und letztes Sample exakt null, größter Sprung in den ersten fünf Samples
  1,5e−3 (der gewollte Anschlag des Mallets bei 1 ms Attack).
- **Aliasing:** Chip-Lead mit einem Bend über drei Oktaven bis 2,1 kHz, Glocke auf MIDI 96. Keine
  gespiegelten Teiltöne im Spektrogramm.
- **Tonhöhe:** bei 440 Hz zwischen −2,5 und +1,5 Cent.
- **Stereo:** Korrelation L/R mit Echo: Pluck 0,77, Glocke 0,26, Mallet 0,97, Chip 0,99.
- **Demo:** Spitze −1,0 dBFS, True-Peak −1,0 dBTP, integrierte Lautheit −12,7 LUFS.

## Grenzen

- Das Echo ist fest pro Note. Für ein Echo im Tempo eines Songs `delay` passend setzen oder das
  Echo abschalten und in der Mischung nachbauen.
- Keine Filterresonanz-Sättigung, das Filter ist linear.

## Quellen

- V. Välimäki, A. Huovilainen: Antialiasing Oscillators in Subtractive Synthesis. IEEE Signal
  Processing Magazine 24(2), 2007.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.
- J. M. Chowning: The Synthesis of Complex Audio Spectra by Means of Frequency Modulation.
  JAES 21(7), 1973.
- J. F. Kaiser: Nonrecursive Digital Filter Design Using the I0-sinh Window Function. ISCAS 1974.

Der gesamte Code ist eigenständig geschrieben. Aus den Quellen stammen nur Verfahren, kein Code.

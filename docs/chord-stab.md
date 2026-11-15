# Chord Stab

`instruments/chord-stab.mjs` spielt mit einem Tastendruck einen ganzen Akkord, kurz und
perkussiv, wie die Akkord-Stabs aus House, Rave und Eurodance. Fünf Klangfarben, drei davon
subtraktiv aus Sägezähnen, zwei additiv aus Sinustönen: eine Orgel mit gestapelten Quinten und ein
anschlagartiger Klavierklang. Alles ist synthetisiert, kein Sample.

```js
import { render, meta, SHAPES } from './instruments/chord-stab.mjs';
// meta.presets: ['minor7', 'major', 'sus', 'organ', 'piano'], meta.range: [36, 79]
const [L, R] = render({ preset: 'minor7', midi: 57, velocity: 1, duration: 0.2 });
const own = render({ preset: 'piano', midi: 57, shape: 'maj7' });
const free = render({ preset: 'organ', chord: [45, 52, 57, 64] });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `minor7`, `major`, `sus`, `organ` oder `piano` |
| `midi` | Grundton des Akkords, 36 bis 79 |
| `velocity` | 0 bis 1, Pegel und Helligkeit |
| `duration` | Haltezeit in Sekunden |
| `seed` | Startwert für Phasen und Toleranzen |
| `shape` | optional: anderer Akkordtyp aus `SHAPES` |
| `chord` | optional: Liste von MIDI-Noten, ersetzt `midi` und `shape` |

Akkordformen in Halbtönen über dem Grundton:

| Form | Töne |
| --- | --- |
| `minor7` | 0, 3, 7, 10 |
| `minor` | 0, 3, 7, 12 |
| `major` | 0, 4, 7, 12 |
| `maj7` | 0, 4, 7, 11 |
| `sus` | 0, 5, 7, 12 |
| `fifths` | 0, 7, 12, 19 (gestapelte Quinten) |

Ergebnis ist `[left, right]` bei 48 kHz, unterhalb von 120 Hz mono.

## Synth-Stabs: `minor7`, `major`, `sus`

Pro Akkordton zwei bis fünf Oszillatoren, über ±6 bis ±24 Cent verstimmt und im Stereobild
abwechselnd links und rechts verteilt. Sägezahn und Puls sind mit PolyBLEP band-begrenzt und
laufen mit doppelter Abtastrate. Alle Töne des Akkords gehen durch ein gemeinsames
Kaskadenfilter pro Kanal, wie bei einem paraphonen Synthesizer. Die Sättigung am Filtereingang
mischt die Akkordtöne dadurch etwas miteinander, das gibt Biss.

Die Filterhüllkurve macht den Stab: Die Grenzfrequenz springt beim Anschlag um 5 bis 8 kHz nach
oben und fällt mit 50 bis 120 ms zurück. Die Amplitude fällt nach 1 ms Attack mit 120 bis 200 ms
auf 15 bis 35 % ab.

| Preset | Form | Stimmen | Klang |
| --- | --- | --- | --- |
| `minor7` | minor7 | 3 Sägen mit Pulsanteil, ±9 Cent | klassischer House-Stab |
| `major` | major | 5 Sägen, ±24 Cent, breit | heller Rave-Stab |
| `sus` | sus | 2 Pulse, ±6 Cent, Resonanz 0,5 | kurzer, gezupfter Stab |

## Orgel: `organ`

Sinustöne auf den Harmonischen 1, 2, 3, 4, 6 und 8 jeder Note, mit festen Pegeln wie gezogene
Register. Dazu zwei schnell abklingende Teiltöne auf der 3. und 5. Harmonischen als
Perkussionsregister. Ihr Pegel hängt von der Velocity ab. Mit der Form `fifths` (Grundton, Quinte,
Oktave, Duodezime) ergibt das den typischen Orgel-Stab aus 90er-House. Harmonische oberhalb von
9 kHz klappen eine Oktave nach unten, so wie einem Tonradsatz die oberen Räder ausgehen. Damit
bleibt auch der höchste Akkord weich.

## Klavier: `piano`

Ein Klang, der wie ein angeschlagenes Klavier wirkt, additiv gebaut:

- zwei Saiten pro Ton, um ±0,7 Cent verstimmt, das gibt die Schwebung im Ausklang
- Teiltöne einer steifen Saite: `f_n = n · f0 · √(1 + B·n²)` mit `B` ≈ 0,00025 um das
  eingestrichene C, nach oben wachsend
- Pegel der Teiltöne `|sin(π·n·β)| / n^0,85` mit Anschlagpunkt `β` = 1/7,3, dazu eine
  Helligkeit `e^(−f/fb)` mit `fb` = 1,2 bis 6,7 kHz je nach Velocity
- jeder Teilton klingt zweistufig ab, schnell und dann langsamer, hohe Teiltöne kürzer als tiefe
- ein kurzer, tiefpassgefilterter Rauschstoß als Hammergeräusch

Teiltöne über 16 kHz werden weggelassen, Teiltöne über 0,42·48 kHz nie erzeugt. Damit ist der
additive Teil von vornherein band-begrenzt und braucht keine Überabtastung. Die Sinustöne
entstehen durch komplexe Rotation, ohne `sin()` pro Sample. Die Standardform ist `minor`.

## Klickfreiheit und Pegel

Halbkosinus-Attack und -Release, DC-Blocker, 1 ms Halbkosinus-Blende an beiden Pufferenden. Jedes
Preset hat eine feste Verstärkung. Mit seiner eigenen Form liegt die Spitze bei Velocity 1 über den
ganzen Umfang (MIDI 36 bis 79), zwei Haltezeiten und drei Seeds höchstens bei −1,4 dBFS (`piano`),
−1,5 (`organ`, `major`, `sus`) und −1,7 (`minor7`). Andere Formen können Teiltöne genau
übereinanderlegen, etwa Oktaven oder gestapelte Quinten. Ohne Schutz kämen sie bis −0,1 dBFS
(`piano` und `sus` mit `fifths`). Deshalb wird ein Stab, dessen Spitze über −1,2 dBFS läge, als
Ganzes linear auf −1,2 dBFS abgesenkt. Das gilt auch für eigene Akkorde über `chord`. Höchste
gemessene Spitze damit −1,2 dBFS.

## Demo

`node demos/chord-stab.mjs` schreibt `out/chord-stab.wav` mit 132 BPM: jedes Preset mit zwei
Akkorden, dann vier Takte Klavier mit einem eigenen synkopierten Rhythmus über a, f, c, g und vier
Takte `minor7` mit Orgel-Quinten auf den Offbeats.

## Quellen

- V. Välimäki, A. Huovilainen: Antialiasing Oscillators in Subtractive Synthesis. IEEE Signal
  Processing Magazine 24(2), 2007.
- H. Fletcher: Normal Vibration Frequencies of a Stiff Piano String. JASA 36(1), 1964.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.

Der Code ist eigenständig geschrieben. Aus den Quellen stammen nur Verfahren, kein Code.

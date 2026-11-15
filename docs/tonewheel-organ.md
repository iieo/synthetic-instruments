# Drawbar-Orgel mit Tonrädern

`instruments/tonewheel-organ.mjs` erzeugt eine elektromechanische Orgel mit Zugriegeln, wie sie
in Jazz, Gospel und Rock gespielt wird, zusammen mit dem Rotorlautsprecher, der zu ihrem Klang
gehört. Es gibt keine Samples. Der Ton entsteht aus einem Modell des Tongenerators, der
Tastenkontakte, des Vibratoscanners, des Röhrenvorverstärkers und des rotierenden Lautsprechers.

Umfang: MIDI 36 bis 96 (C2 bis C7, 61 Tasten). Ausgabe stereo, 48 kHz.

```js
import { render, meta } from './instruments/tonewheel-organ.mjs';
const [L, R] = render({ midi: 60, velocity: 0.8, duration: 1.5, preset: 'jazz', registration: '888000000' });
```

`duration` ist die Zeit, die die Taste gehalten wird. Gleiche Parameter ergeben exakt dasselbe Signal.

## Tongenerator

Eine Welle dreht sich mit 20 Umdrehungen pro Sekunde. Über zwölf Zahnradpaare, eines pro
Tonklasse, treibt sie Tonräder mit 2, 4, 8 bis 256 Zähnen an. Vor jedem Rad sitzt ein
Magnet mit Spule. Jeder Zahn, der vorbeiläuft, ändert den magnetischen Fluss und induziert eine
Spannung. Die Frequenz eines Rades ist

    f = 20 Hz · (a / b) · Zähne

mit dem Übersetzungsverhältnis a / b seiner Tonklasse:

| Ton | a / b | Abweichung von gleichstufiger Stimmung |
|---|---|---|
| C | 85 / 104 | −0,58 Cent |
| Cis | 71 / 82 | −0,68 Cent |
| D | 67 / 73 | +0,20 Cent |
| Dis | 35 / 36 | −0,09 Cent |
| E | 69 / 67 | −0,40 Cent |
| F | 12 / 11 | −0,68 Cent |
| Fis | 37 / 32 | +0,03 Cent |
| G | 49 / 40 | +0,02 Cent |
| Gis | 48 / 37 | −0,71 Cent |
| A | 11 / 8 | 0 (A = 440 Hz) |
| Ais | 67 / 46 | −0,29 Cent |
| H | 54 / 35 | −0,59 Cent |

Weil alle Oktaven einer Tonklasse am selben Zahnradpaar hängen, sind die Oktaven exakt rein, die
zwölf Tonklassen aber um bis zu 0,7 Cent zu tief oder 0,2 Cent zu hoch. Das Modell rechnet genau diese
Frequenzen. Es gibt 91 Räder, von 32,7 Hz bis 5920 Hz.

Ein Tonrad liefert keinen reinen Sinus. Das Zahnprofil der tiefen Räder erzeugt etwas dritte und
ein wenig zweite Harmonische (höchstens −24,6 dB und −36,0 dB), zur Höhe hin werden die Räder fast rein.
Jedes Rad hat außerdem eine feste kleine Pegelstreuung von ±1 dB. Diese Eigenschaften hängen nur von
der Radnummer ab, nicht vom Seed: Es ist immer dieselbe Orgel. Ein Rad teilt sich im Modell das
Gehäuseabteil mit einem Rad vier Oktaven entfernt, dessen Signal mit etwa −42 dB übersprecht.

Die Räder laufen ständig. Beim Tastendruck beginnt der Ton deshalb mitten in der Schwingung, mit
einer zufälligen Phase pro Rad (vom Seed abhängig).

## Zugriegel

Neun Zugriegel mischen pro Taste neun Räder: 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓' und 1'. Das sind
Tonhöhen von −12, +7, 0, +12, +19, +24, +28, +31 und +36 Halbtönen relativ zur Taste. Jede Stufe
eines Zugriegels ist etwa 3 dB, Stufe 0 ist stumm. Die Registrierung wird als Zeichenkette von
links nach rechts angegeben, `"888000000"` zieht also 16', 5⅓' und 8' ganz heraus. Ein Array aus
neun Zahlen geht auch.

Oberhalb des letzten Rades gibt es keine Töne mehr. Ein Zugriegel, der dort landen würde, nimmt das
Rad eine Oktave tiefer (Rückfaltung). In der obersten Oktave klingen 1' und 2' deshalb gleich hoch.

## Tastenkontakte und Klick

Jeder Zugriegel hat unter der Taste einen eigenen Kontakt auf einer Sammelschiene. Die neun
Kontakte schließen nicht gleichzeitig, sondern innerhalb von 0,6 bis 3 ms, und einzelne prellen
einmal kurz. Jeder Übergang ist im Modell eine Rampe von 0,08 ms (bei `click: 1`) bis 5 ms (bei
`click: 0`) in Form eines erhöhten Kosinus. Weil die Räder frei laufen, setzt jeder Kontakt eine
Sinusschwingung mitten in der Periode ein. Der typische Tastenklick entsteht also aus dem
Mechanismus selbst, ohne zusätzliches Geräusch. Beim Loslassen öffnen die Kontakte ebenso gestaffelt.

## Perkussion

Die Perkussion schaltet beim Anschlag kurz die zweite (4') oder dritte Harmonische (2⅔') der Taste
dazu und lässt sie exponentiell abklingen, schnell mit τ = 0,12 s oder langsam mit τ = 0,42 s. Sie
wird über den Kontakt des 1'-Zugriegels getastet, deshalb ist der 1' bei eingeschalteter Perkussion
stumm. Bei Lautstärke „normal“ sinken die Zugriegel um 3 dB, damit die Perkussion hervortritt.
In der echten Schaltung zündet die Perkussion nur, wenn vorher alle Tasten losgelassen waren.
Wer gebunden spielt, gibt den folgenden Tönen `legato: true` mit.

## Vibrato und Chorus

Der Scanner besteht aus einer Verzögerungskette aus Spulen und Kondensatoren mit Abgriffen. Ein
rotierender kapazitiver Abnehmer fährt etwa 6,9 Mal pro Sekunde vom ersten zum letzten Abgriff und
zurück. Das Modell nimmt neun Abgriffe, zwischen denen linear überblendet wird, und eine
Abtastbewegung, die einem Dreieck mit gerundeten Umkehrpunkten folgt. Die längste Verzögerung
beträgt 0,26 ms (V1, C1), 0,48 ms (V2, C2) oder 0,85 ms (V3, C3). Die späten Abschnitte dämpfen die
Höhen etwas (Tiefpass 7,5 kHz im modulierten Zweig). Bei Chorus wird das modulierte Signal zur
Hälfte mit dem unverzögerten gemischt. Die Perkussion läuft am Scanner vorbei.

## Vorverstärker

`drive` (0 bis 1) steuert eine asymmetrische Röhrenkennlinie
`y = (tanh(g x + b) − tanh b) / (√g (1 − tanh² b))` mit `g = 1 + 7 · drive` und `b = 0,2 · drive`.
Kleine Signale werden um √g lauter, große gehen weich in die Sättigung, eine Halbwelle etwas
früher als die andere (gerade Harmonische). Mit `drive > 0` rechnet der ganze Generator mit
vierfacher Überabtastung, sonst mit doppelter. Danach filtert ein Kaiser-Tiefpass bei 20,5 kHz und
dezimiert auf 48 kHz.

## Rotorlautsprecher

Eine Frequenzweiche bei 800 Hz (Linkwitz-Riley, 4. Ordnung) teilt das Signal. Die Höhen gehen in
ein rotierendes Horn, die Tiefen auf eine rotierende Trommel. Zwei Mikrofone stehen bei ±60° vor
dem Gehäuse. Für jeden Rotor und jedes Mikrofon gilt mit dem Rotorwinkel θ:

- Abstand und damit Laufzeit ändern sich mit `R cos(θ − φ_Mikrofon) / c`. Bei R = 15 cm (Horn) sind
  das ±0,44 ms, bei der Trommel ±0,23 ms. Die modulierte Verzögerung erzeugt die Dopplerverschiebung.
  Gelesen wird mit kubischer Hermite-Interpolation.
- Der Pegel folgt der Richtwirkung: `1 − a (1 − cos)/2` mit a = 0,55 (Horn) und 0,32 (Trommel).
- Das Horn klingt abgewandt dumpfer: Ein Tiefpass wandert zwischen 9 kHz und 2,5 kHz.

| Rotor | langsam | schnell | Hochlaufen | Auslaufen |
|---|---|---|---|---|
| Horn | 0,83 Hz | 6,75 Hz | τ = 0,6 s | τ = 0,9 s |
| Trommel | 0,7 Hz | 5,9 Hz | τ = 3,5 s | τ = 5 s |

Die Drehzahl nähert sich dem neuen Wert exponentiell. Das leichte Horn ist nach etwa einer Sekunde
auf Tempo, die schwere Trommel braucht mehrere Sekunden, und in dieser Zeit schweben die beiden
gegeneinander. Drei frühe Reflexionen im Gehäuse (3 bis 8 ms), über Kreuz zwischen den Kanälen,
machen den Raum etwas breiter.

`rotor` ist `off`, `slow`, `fast`, `slow-fast` oder `fast-slow`; die letzten beiden schalten nach
`switchAt` Sekunden um. Für ganze Stücke exportiert `instruments/tonewheel-organ/effects.mjs` die
Funktion `rotary(mono, { schedule: [[0, 'slow'], [8, 'fast'], ...] })`. Damit teilen sich alle Töne
einen Lautsprecher, so wie in der Demo.

## Parameter

| Parameter | Werte | Standard |
|---|---|---|
| `midi` | 36 bis 96 | 60 |
| `velocity` | 0 bis 1, wirkt wie das Schwellerpedal | 0,8 |
| `duration` | Haltezeit in s, 0,02 bis 60 | 1 |
| `preset` | `jazz`, `gospel`, `rock`, `ballad`, `full`, `clean` | `jazz` |
| `registration` | neun Ziffern 0 bis 8 | aus dem Preset |
| `percussion` | `off`, `2nd`, `3rd` | aus dem Preset |
| `percussionDecay` | `fast`, `slow` | `fast` |
| `percussionLevel` | `normal`, `soft` | `normal` |
| `vibrato` | `off`, `v1`, `v2`, `v3`, `c1`, `c2`, `c3` | aus dem Preset |
| `rotor` | `off`, `slow`, `fast`, `slow-fast`, `fast-slow` | aus dem Preset |
| `switchAt` | Umschaltzeit in s | 0 |
| `drive` | 0 bis 1 | aus dem Preset |
| `click` | 0 bis 1 | aus dem Preset |
| `legato` | `true` unterdrückt die Perkussion | `false` |
| `seed` | Zahl | 1 |

Presets:

| Preset | Registrierung | Perkussion | Vibrato | Rotor | Drive |
|---|---|---|---|---|---|
| `jazz` | 888000000 | 3., schnell | C3 | langsam | 0,15 |
| `gospel` | 888800008 | aus | C3 | langsam nach schnell | 0,35 |
| `rock` | 888000000 | aus | aus | schnell | 0,8 |
| `ballad` | 838000000 | aus | C2 | langsam | 0 |
| `full` | 888888888 | aus | V3 | schnell | 0,4 |
| `clean` | 888000000 | aus | aus | aus | 0 |

Ungültige Namen und nicht endliche Zahlen führen zu einem Fehler mit dem Namen des Parameters,
Zahlen außerhalb des Bereichs werden begrenzt.

## Messwerte

Gemessen mit einem Durchlauf über jede zweite Taste, Anschlag 0,2, 0,6 und 1, alle Presets und
dazu jeweils Extremwerte (alle neun Zugriegel, beide Perkussionen, `drive` 0, 0,26 und 1, `click` 1,
`rotor` aus und mit Umschaltung), zwei Seeds:

- Lautester Ton bei Anschlag 1: −2,0 dBFS (alle neun Zugriegel, ohne Drive, 40 Seeds, Töne von 1 s).
  Der feste Ausgangspegel ist so gewählt, dass selbst die Summe aller Rad- und Obertonamplituden,
  also der Fall, dass alle Räder im selben Augenblick ihre Spitze erreichen, höchstens −1,15 dBFS
  ergibt (am lautesten auf Taste 36). Drive senkt die Spitzen deutlich, der Rotor ändert sie kaum.
  Eine Sicherheitsgrenze bei −1 dBFS bleibt im Code, hat im Durchlauf aber nie gegriffen.
  Volle Register mit Drive 0, 0,26 und 1 sowie mit Perkussion lagen höchstens bei −2,5 dBFS.
  Mehrere Tasten addieren sich: Ein Dreiklang mit allen Zugriegeln erreicht +2,4 dBFS und muss
  beim Mischen leiser gestellt werden.
- Keine NaN, erstes und letztes Sample exakt 0, Gleichanteil unter 0,002 (Mittel über Töne von 0,4 s).
- Größter Sprung von Sample zu Sample: 0,31 (volle Registrierung in der obersten Oktave, das ist
  ein Ton von 5,9 kHz und kein Knacken).
- Tonhöhe des 8'-Zugriegels allein: gemessen exakt die Zahnradstimmung (C: −0,58 Cent, A: 0,00 Cent).
- Rechenzeit: ein Ton von 10 s braucht etwa 0,2 s (ohne Drive) bis 1,1 s (Drive, volle
  Registrierung, schneller Rotor).
- Spektrogramme der obersten Töne mit Drive und schnellem Rotor zeigen keine Spiegelfrequenzen.

Die Demo `demos/tonewheel-organ.mjs` spielt eine eigene Jazz-Phrase in F-Dur mit Begleitakkorden,
Pedalbass und Melodie mit Perkussion über einen gemeinsamen Rotorlautsprecher, der im fünften Takt
schnell wird und am Schluss ausläuft. Spitzenpegel −1,0 dBFS, True Peak −1,0 dBTP, Lautheit
etwa −13 LUFS.

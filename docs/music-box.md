# Spieluhr

`instruments/music-box.mjs` erzeugt eine Spieluhr. Ein Kamm aus gestimmten Stahlzungen sitzt auf
einem schweren Sockel in einem kleinen Holzkasten. Eine Walze mit Stiften dreht sich langsam, und
jeder Stift hebt eine Zunge an und lässt sie abschnellen.

Umfang: MIDI 53 bis 100 (F3 bis E7). Ausgabe mono, 48 kHz.

```js
import { render, renderTune, meta, PLUCK_AT } from './instruments/music-box.mjs';
const x = render({ midi: 76, velocity: 0.8 });
const tune = renderTune({ seed: 1, tempo: 92, windDown: 0.6 });
```

Eine Spieluhr hat keine Tasten und damit keine Notenlänge. Eine Zunge klingt, bis sie verklungen
ist oder bis der nächste Stift sie wieder anhebt. Dafür gibt es `ring`: die Zeit nach dem Anreißen,
nach der die Zunge gedämpft wird. Ohne `ring` klingt sie frei aus. Der Puffer beginnt 12 ms vor dem
Anreißen (`PLUCK_AT`), denn in dieser Zeit legt sich bei den tiefen Zungen der Dämpfer an.

## Zungen als Kragbalken

Jede Zunge ist ein einseitig eingespannter Balken. Für einen gleichförmigen Balken nach
Euler-Bernoulli liegen die Eigenfrequenzen bei `f_n ∝ β_n²` mit
`1 + cos β cosh β = 0`, also im Verhältnis 1 : 6,27 : 17,55 : 34,39 (Fletcher und Rossing 1998).

Die tiefen Zungen tragen unter der Spitze ein Bleigewicht. So klingen sie tief, ohne länger zu
sein. Mit einer Punktmasse M an der Spitze und der Balkenmasse m lautet die Eigenwertgleichung

    1 + cos β cosh β + μ β (cos β sinh β − sin β cosh β) = 0,   μ = M / m

Das Modell löst sie numerisch (Vorzeichenwechsel suchen, dann Bisektion) für die ersten vier Moden.
Die Masse senkt vor allem den Grundton, die Obertöne rücken dadurch weiter nach oben:

| Zunge | μ | Modenverhältnisse |
|---|---|---|
| F3 (MIDI 53) | 0,9 | 1 : 10,05 : 31,4 : 64,8 |
| D4 (MIDI 62) | 0,51 | 1 : 8,45 : 25,9 : 53,1 |
| ab D5 (MIDI 74) | 0 | 1 : 6,27 : 17,55 : 34,39 |

Die Masse wächst im Modell linear von 0 bei MIDI 74 bis 0,9 bei MIDI 53. Gestimmt wird der Grundton;
die Zungen eines Kamms streuen fest um ±3 Cent, denn sie werden von Hand gefeilt. Diese Streuung
hängt nur von der Note ab, nicht vom Seed. Die Obertöne bekommen pro Anschlag eine Streuung von
0,4 Prozent. Eine schwache Torsionsmode bei etwa 4,1 f1 kommt dazu, angeregt, wenn der Stift die
Zunge nicht genau mittig trifft.

Jede Mode ist ein gedämpfter Zweipol-Resonator. Der Grundton hat `T60 = 6 s · (f1 / 175 Hz)^−0,7`,
begrenzt auf 0,8 bis 7 s. Höhere Moden haben eine Güte von etwa 900, also
`τ = 900 / (π f)`, und klingen viel schneller ab.

## Anreißen

Der Stift biegt die Zungenspitze aus der Ruhelage und rutscht dann ab. Eine statische Auslenkung
der Spitze legt in Mode n eine Amplitude proportional zu `1 / β_n⁴`. Hörbar wird die Zunge über
das Biegemoment an der Einspannung, das den Sockel und den Kasten antreibt; es wichtet jede Mode
mit `β_n²`. Zusammen gehen die Obertöne mit `(β_1 / β_n)²` ein, mit wechselndem Vorzeichen, und
alle Obertöne bekommen zusätzlich den Faktor 1,6 gegenüber dem Grundton. Dieser Faktor ist eine
klangliche Einstellung, keine Folge der Mechanik. Das Abrutschen dauert
`T = (0,55 − 0,3 · velocity) ms · (523 Hz / f1)^0,15`, also 0,2 ms bei der höchsten Zunge mit vollem
Hub bis 0,65 ms bei der tiefsten mit kleinem Hub, dazu eine Streuung von ±10 % je Ton. Diese Zeit ist ein
geglätteter Impuls, dessen Spektrum die hohen Moden sanft abschwächt. Tiefe Zungen sind breiter
und bekommen längere Stifte, ihr Hub ist um `(523 Hz / f1)^0,3` größer (begrenzt auf 0,8 bis 1,6).
Das Abgleiten des Stifts von der Spitze gibt zusätzlich ein kurzes, gefiltertes Ticken.

## Dämpfer

Zungen unterhalb von etwa A5 haben einen Dämpfer: eine dünne Drahtfeder, die sich an die Zunge legt,
kurz bevor der nächste Stift kommt. Schwingt die Zunge noch, schnarrt der Draht kurz dagegen. Das
Modell erzeugt in den 12 ms vor dem Anreißen ein bandbegrenztes Rauschen um 3,3 kHz, das im Takt
der Zungenschwingung aufgetastet wird, dazu den Rest des alten Tons, der schnell verstummt. Die
Stärke ist `damper` (0 bis 1). `renderTune` setzt sie aus der Restschwingung der Zunge vom letzten
Anreißen.

## Kasten

Der Sockel strahlt selbst kaum ab. Den Klang macht der kleine dünnwandige Kasten, dessen Moden
zwischen 430 Hz und 5,6 kHz liegen (sieben Bandpässe mit Güte 8 bis 22). Ein Hochpass bei 120 Hz
nimmt den Rest unterhalb der tiefsten Kastenmode. Die tiefen Zungen hört man deshalb vor allem über
ihre Obertöne, wie bei einer echten Spieluhr.

## Melodie mit `renderTune`

`renderTune` spielt einen eigenen Walzer in C-Dur, 16 Takte im Dreivierteltakt mit Bass auf der Eins
und Zweiklängen auf zwei und drei, wie ihn eine Walze spielen würde:

- Die Stifte sitzen nicht exakt: Jeder Einsatz streut um einige Millisekunden (`jitter`, 0 bis 3).
- Der Fliehkraftregler hält die Drehzahl nur ungefähr, sie schwankt um ±1,2 Prozent mit 0,55 Hz.
- Mit `windDown` (0 bis 1) läuft die Feder ab, und die letzten Takte werden bis zu 35 Prozent langsamer.
- Wird eine Zunge erneut angerissen, dämpft der neue Stift den alten Ton (`ring`), und der Dämpfer
  schnarrt so stark, wie die Zunge noch schwingt.

Parameter: `seed`, `tempo` (30 bis 200, Standard 92), `windDown` (Standard 0,6), `jitter`
(Standard 1), `transpose` (−12 bis 12 Halbtöne; Töne außerhalb des Kamms werden oktaviert) und
`velocity`.

## Parameter von `render`

| Parameter | Werte | Standard |
|---|---|---|
| `midi` | 53 bis 100 | 72 |
| `velocity` | 0,02 bis 1, Hub des Stifts | 0,8 |
| `ring` | Zeit bis zum Dämpfen in s, 0,02 bis 20 | frei ausklingen |
| `damper` | 0 bis 1 | 0,15 |
| `seed` | Zahl | 1 |

## Messwerte

Durchlauf über alle 48 Zungen, Anschlag 0,2, 0,6 und 1, `damper` 0 und 1, mit und ohne `ring`,
drei Seeds:

- Lautester Ton bei Anschlag 1: −3,1 dBFS (Ziel −3 dBFS, fester Ausgangspegel ohne Begrenzer).
- Keine NaN, erstes und letztes Sample exakt 0, Gleichanteil unter 10⁻⁹.
- Größter Sprung von Sample zu Sample: 0,12.
- Tonhöhe: Der gemessene Grundton entspricht der festen Stimmstreuung des Kamms auf 0,0001 Cent genau,
  also innerhalb von ±3 Cent der gleichstufigen Stimmung.
- `renderTune` über fünf Seeds mit und ohne Federablauf: lautester Wert −3,4 dBFS.
- Rechenzeit: die ganze Melodie (37 s, 122 Töne) in etwa 1 s.

Die Demo `demos/music-box.mjs` spielt den Walzer mit ablaufender Feder. Spitzenpegel −3,0 dBFS,
Lautheit etwa −20 LUFS.

# Koto

`instruments/koto.mjs` ist eine Wölbbrettzither mit 13 Saiten. Die Saiten laufen über einen langen, hohlen Kasten aus weichem Holz, jede liegt auf einem eigenen beweglichen Steg, der ihre Tonhöhe festlegt. Gezupft wird mit Plektren, die auf Daumen, Zeige- und Mittelfinger stecken. Links vom Steg kann die Spielerin die Saite niederdrücken: die Spannung steigt und der Ton wird um einen Halbton oder Ganzton höher, auch während er klingt.

```js
import { render, meta } from './instruments/koto.mjs';
// meta.presets: ['pick', 'silk', 'finger'], meta.range: [45, 86]
const note = render({ midi: 67, velocity: 0.8, duration: 2, oshide: 2, oshideAt: 0.5 });
```

Hilfsbausteine liegen in `instruments/koto/varloop.mjs` (Saitenschleife mit veränderlicher Länge). Anregung und modaler Korpus kommen aus `instruments/strings-plucked/`.

## Saite mit veränderlicher Spannung

Die Saite ist eine Wellenleiter-Schleife (Karplus und Strong 1983, Jaffe und Smith 1983): eine Verzögerungsleitung und ein Verlust-Tiefpass erster Ordnung `g (1 - a) / (1 - a z⁻¹)`. Weil sich die Tonhöhe beim Drücken während des Tons ändert, wird die Verzögerung nicht mit einem festen Allpass gestimmt, sondern in jedem Sample an einer gebrochenen Stelle gelesen, mit Lagrange-Interpolation dritter Ordnung (Laakso et al. 1996). Die Leselänge ist

```
D(t) = fs / f(t) - τ_LP(f(t))
```

mit der aktuellen Frequenz `f(t)` und der Phasenlaufzeit des Verlust-Tiefpasses `τ_LP`. So stimmt die Schleife auch während des Drückens. Die Saite läuft mit doppelter Abtastrate (96 kHz), damit die Interpolation die hohen Obertöne nicht zusätzlich dämpft, und wird danach mit einem Kaiser-Tiefpass dezimiert.

`a` und `g` folgen aus zwei Abklingzeiten: T60 beim Grundton und T60 bei einer hohen Frequenz `fh`. Pro Periode muss die Schleife um `10^(-3 / (T60 · f0))` abklingen; `a` wird per Bisektion so bestimmt, dass das Verhältnis der Beträge bei `fh` und `f0` passt, `g` danach so, dass der Betrag bei `f0` stimmt.

| Preset | Saite | T60 Grundton (147 / 880 Hz) | T60 bei fh |
|---|---|---|---|
| `pick` | Polyester, Plektrum | 4,5 / 2,2 s | 0,55 / 0,45 s bei 3 kHz |
| `silk` | Seide, Plektrum | 3,0 / 1,5 s | 0,30 / 0,25 s bei 2,5 kHz |
| `finger` | Polyester, Fingerkuppe | 4,5 / 2,2 s | 0,55 / 0,45 s bei 3 kHz |

Seide hat mehr innere Reibung als Polyester, ihre Höhen sterben schneller und der Ton ist kürzer.

## Länge der Saite und Stegposition

Alle Saiten haben etwa dieselbe Spannung und Masse, also dieselbe Wellengeschwindigkeit `c` (hier 420 m/s). Der Steg steht dort, wo `2 L f0 = c` gilt: beim tiefen D (147 Hz) bei 1,43 m, beim hohen A (880 Hz) bei 0,24 m. Die ganze Saite ist 1,82 m lang. Der Teil hinter dem Steg schwingt mit: er ist eine zweite Schleife der Länge `1,82 m - L` mit der Grundfrequenz `c / (2 (1,82 m - L))`, die über den Steg vom Hauptteil angetrieben wird. Sie klingt etwa 30 dB unter dem Grundton und gibt einen leisen, nicht harmonischen Schimmer. Drückt die Spielerin die Saite, steigt die Spannung auf beiden Seiten des Stegs, also wird auch dieser Teil höher.

## Anschlag

Die Saite wird als Dreieck ausgelenkt und losgelassen. Was der Steg spürt, ist die Steigung der Saite, und die Steigung eines Dreiecks ist ein Rechteck. Eine Periode davon wird in die Schleife gespeist, geglättet über die Kontaktbreite des Plektrums (3 bis 3,5 mm, bei leisem Anschlag bis gut doppelt so breit) oder der Fingerkuppe (2 cm). Angeschlagen wird 7,5 cm vor dem festen Endsteg, mit der Fingerkuppe 11 cm, je Ton um ±15 % gestreut. Weil hohe Saiten kurz sind, rückt die relative Zupfstelle dort zur Mitte.

Das Plektrum aus hartem Kunststoff oder Elfenbein schlägt hörbar auf die Saite. Dafür gibt es 4 ms bandpassgefiltertes Rauschen (Mitte 3,2 bis 4,7 kHz) direkt in den Korpus, bei `finger` nicht.

## Drücken (Oshide)

`oshide` gibt an, um wie viele Halbtöne (0 bis 3) die Saite durch Drücken höher wird. `oshideAt` ist der Zeitpunkt, an dem der Druck beginnt, `oshideTime` die Dauer bis zur vollen Tiefe, mit einem Kosinus-Übergang. Mit `oshideAt: 0` und kurzer `oshideTime` ist die Saite schon vor dem Anschlag gedrückt, so spielt man Töne, die nicht in der Stimmung liegen. Mit späterem `oshideAt` steigt der Ton, während er klingt.

## Korpus

Der Kasten ist etwa 1,8 m lang, hohl und hat dünne Wände aus weichem Holz. Er hat viele tiefe, dicht liegende und stark gedämpfte Moden. Modelliert ist das als Parallelbank aus Zwei-Pol-Resonatoren: acht Moden zwischen 92 und 640 Hz mit Güten von 7 bis 18, darüber ein fester, pseudozufälliger Satz schwächerer Moden bis 4,2 kHz. Ein Hochpass zweiter Ordnung bei 260 Hz (Güte 0,5, also ohne Überhöhung, darunter 12 dB pro Oktave) bildet nach, dass ein Kasten, der wie ein Monopol strahlt, tiefe Frequenzen schwächer abgibt. Dazu ein Hochpass bei 70 Hz und ein Tiefpass bei 7 kHz.

## Parameter

| Name | Bereich | Standard | Bedeutung |
|---|---|---|---|
| `midi` | 45 bis 86 | 62 | Tonhöhe der ungedrückten Saite, auch gebrochen |
| `velocity` | 0,05 bis 1 | 0,8 | Anschlagstärke, steuert Pegel und Helligkeit |
| `duration` | 0 bis 30 s | 2 | Zeit bis zum Abdämpfen mit der Hand, danach 0,35 s Ausklang |
| `seed` | Zahl | 1 | Streuung von Stimmung (±1 Cent), Zupfstelle, Kontaktbreite, Abklingzeit |
| `preset` | `pick`, `silk`, `finger` | `pick` | Saitenmaterial und Anschlag |
| `pluckPosition` | 0,02 bis 0,98 | etwa 0,05 bis 0,4 | Zupfstelle als Anteil der Länge, über 0,5 wie `1 - x` |
| `oshide` | 0 bis 3 | 0 | Tonerhöhung durch Drücken in Halbtönen |
| `oshideAt` | 0 bis 30 s | 0 | Beginn des Drückens |
| `oshideTime` | 0,01 bis 5 s | 0,18 | Dauer bis zur vollen Tiefe |

Werte außerhalb des Bereichs werden auf den Rand gesetzt, ein Wert, der keine endliche Zahl ist, oder ein unbekanntes Preset ergibt einen Fehler mit dem Namen des Parameters. Ausgabe ist mono mit 48 kHz.

## Messwerte

Gemessen über alle drei Presets, jeden zweiten Halbton von 45 bis 85, drei Seeds, Zupfstelle 0,02 und 0,5, Drücken um drei Halbtöne vor und nach dem Anschlag sowie Velocity 0,2, 0,6 und 1 (1071 Töne):

| Messgröße | Ergebnis |
|---|---|
| Lautester Ton bei Velocity 1 | `pick` −3,1, `silk` −3,1, `finger` −3,0 dBFS |
| Lautester Ton mit Standardeinstellungen (Velocity 0,8, jeder Halbton, Seed 1) | −6,2 bis −6,5 dBFS je Preset, mit Velocity 1 −3,7 bis −3,9 dBFS |
| Größter Sprung von Sample zu Sample | 0,24 |
| Nicht endliche Werte | keine |
| Erstes und letztes Sample | exakt 0 |
| Gleichanteil | höchstens 6·10⁻⁵ |
| Stimmung (Spektralspitze 0,25 bis 1,1 s) | höchstens 1,0 Cent, das ist die gewollte Streuung von ±1 Cent |
| Stimmung gedrückt um 2 Halbtöne | höchstens 1,0 Cent neben dem Zielton |
| Rechenzeit für einen 10 s langen Ton | 0,5 s |
| Hörbeispiel `demos/koto.mjs` | −25,7 LUFS, Sample-Spitze −3,0 dBFS, True Peak −3,0 dBTP |

Auch bei einem Drücken um drei Halbtöne in der obersten Lage zeigt das Spektrogramm keine zurückgespiegelten Obertöne.

## Grenzen

- Der Steg ist ein fester Punkt; seine eigene Bewegung und die Kopplung zwischen benachbarten Saiten fehlen.
- Gleit- und Wischtechniken über mehrere Saiten (etwa das Streichen mit dem Plektrum entlang der Saite) gibt es nicht als eigene Anregung.
- Die Saite ist ohne Steifigkeit gerechnet, bei Seide und Polyester ist die Inharmonizität sehr klein.

## Quellen

- K. Karplus, A. Strong: Digital synthesis of plucked-string and drum timbres. Computer Music Journal 7(2), 1983.
- D. A. Jaffe, J. O. Smith: Extensions of the Karplus-Strong plucked-string algorithm. Computer Music Journal 7(2), 1983.
- T. I. Laakso, V. Välimäki, M. Karjalainen, U. K. Laine: Splitting the unit delay. IEEE Signal Processing Magazine 13(1), 1996 (Lagrange-Interpolation).
- J. O. Smith: Physical Audio Signal Processing. Online-Buch, CCRMA Stanford.
- N. H. Fletcher, T. D. Rossing: The Physics of Musical Instruments. 2. Aufl., Springer 1998 (gezupfte Saite, Spektrum nach Zupfstelle).

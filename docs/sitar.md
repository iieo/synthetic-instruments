# Sitar

`instruments/sitar.mjs` ist eine Langhalslaute mit Kürbiskorpus. Ihr Klang lebt von einem besonderen Steg: seine Oberfläche ist breit und fast flach gewölbt, die Saite liegt auf ihr auf und streift sie bei jeder Schwingung. Dadurch wandert der Endpunkt der Saite ständig ein Stück hin und her, und das erzeugt das helle, sich langsam verändernde Schnarren. Unter den Spielsaiten liegen elf Resonanzsaiten, die auf die Töne der gespielten Tonleiter gestimmt sind und mitklingen. Töne werden oft nicht neu angeschlagen, sondern durch seitliches Ziehen der Saite über den Bund erreicht (Meend).

```js
import { render, meta } from './instruments/sitar.mjs';
// meta.range: [48, 84], meta.scales: ['major', 'minor', 'pentatonic']
const note = render({ midi: 63, velocity: 0.8, duration: 2.5, meend: 2, meendAt: 0.5, tonic: 49 });
```

Die Saite mit dem Steg steht in `instruments/sitar/string.mjs`. Die Resonanzsaiten nutzen die Schleife aus `instruments/strings-plucked/`, die Leseposition mit veränderlicher Länge kommt aus `instruments/koto/varloop.mjs`.

## Saite am gewölbten Steg

Die Saite ist ein Wellenleiter in Auslenkungswellen und läuft mit vierfacher Abtastrate (192 kHz). Die 16 Samples direkt am Steg, gut 2 cm Saite, sind als zwei gegenläufige Wellen `a_k` (zum Steg) und `b_k` (vom Steg weg) einzeln gespeichert, damit die Form der Saite dort bekannt ist: `y_k = a_k + b_k`. Am Endpunkt wird die Welle umgekehrt reflektiert, `b_0 = -a_0`, die Auslenkung dort ist null. Der Rest der Saite bis zum Sattel und zurück ist eine einzige Verzögerung mit gebrochener Länge, gelesen mit Lagrange-Interpolation dritter Ordnung, gefolgt vom Verlust-Tiefpass erster Ordnung und der umkehrenden Reflexion am Sattel. Die Länge der Verzögerung ist in jedem Sample `fs / f(t) - 2 (K - 1) - τ_LP`, so stimmt die Saite auch während eines Meend.

**Einseitige Grenze.** Die Stegoberfläche liegt im Abstand `k` vom Endpunkt um

```
h_k = κ · k³
```

unter der Ruhelage der Saite. Die Saite darf auf dem Steg liegen, aber nicht in ihn eindringen. Ist in einem Sample `y_k < -h_k`, wird die Eindringtiefe je zur Hälfte auf beide Wellen verteilt zurückgeschoben, `a_k += c/2`, `b_k += c/2` mit `c = -h_k - y_k`. Das ist die Randbedingung eines starren Hindernisses im Wellenleiter (Ansatz nach Krishnaswamy und Smith 2003). Eine laute Saite legt sich über viele Samples auf den Steg, eine leise nur kurz am Endpunkt. Weil der Auflagepunkt in jeder Periode wandert, bekommt die Saite laufend neue hohe Obertöne, auch während sie leiser wird. Im Spektrogramm zeigt sich das als Formant, dessen Lücken langsam durch die Obertöne wandern.

**Profil.** Ein Profil `κ k²` (Kreisbogen) lässt die Saite nur bei großer Auslenkung aufliegen, das Schnarren stirbt nach dem ersten Teil des Tons. Bei `κ k³` ist der Steg nahe dem Endpunkt flacher. Die Auflagelänge folgt dann der Wurzel aus der Steigung der Saite, `k* = √(s / κ)`, und die Saite schnarrt über etwa 40 dB ihres Abklingens. Der Parameter `jawari` stellt `κ = 6·10⁻⁶ · 2^(5,3 (0,6 - jawari))` ein: 1 ist ein offener, sehr flacher Steg mit langem, hellem Schnarren, 0 ein geschlossener, bei dem es nur in den ersten lauten Perioden schnarrt. Ein offener Steg gibt mehr Kraft weiter. Den Unterschied in der Aussteuerung gleicht ein fester Pegelversatz je Stellung aus, beschrieben am Ende des Abschnitts zum Korpus.

**Kraft auf den Steg.** Abgestrahlt wird, was der Steg an Kraft weitergibt: die Saitenspannung mal Steigung am Endpunkt, `y_1`, plus der Druck, mit dem die Saite auf den Steg schlägt (die Summe der Korrekturen `c`). Der langsame Teil dieses Drucks ist die mittlere Last einer aufliegenden Saite, also eine statische Kraft. Klingen kann nur sein schneller Teil, deshalb läuft er durch einen Hochpass bei 300 Hz.

## Anschlag

Gespielt wird mit einem Drahtplektrum am Zeigefinger, 8 bis 10,5 % der Saitenlänge vor dem Steg. Die Saite wird als Dreieck ausgelenkt und losgelassen; in Auslenkungswellen ist eine Periode der Schleife die Form hin und ihr umgekehrtes Spiegelbild zurück. Geglättet wird über die Breite des Drahts, etwa 2 mm, bei leisem Anschlag bis 3,5 mm. Die Auslenkung ist proportional zu `β (1 - β) / f0`: ein Anschlag mit gegebener Kraft lenkt die Saite nahe am Steg weniger aus (`d = F β (1 - β) L / T`), und eine kürzer gegriffene Saite bei gleicher Kraft ebenfalls. So ist die Steigung am Steg, die über das Schnarren entscheidet, für alle Töne ähnlich.

## Meend

`meend` gibt das Ziel in Halbtönen an (−5 bis 5), `meendAt` den Beginn, `meendTime` die Dauer des Übergangs (Kosinusform). Positive Werte ziehen den Ton nach oben, wie wenn die Saite seitlich über den Bund gedrückt wird. Negative Werte lassen ihn sinken, als sei die Saite schon vor dem Anschlag gezogen gewesen und werde losgelassen. Die Resonanzsaiten bleiben dabei fest gestimmt und klingen nur mit, wenn der gezogene Ton einen ihrer Töne trifft.

## Resonanzsaiten

Elf Saiten, gestimmt auf die Tonleiter ab einer Oktave über dem Grundton `tonic`:

| `scale` | Halbtöne über `tonic` |
|---|---|
| `major` | 12 14 16 17 19 21 23 24 26 28 29 |
| `minor` | 12 14 15 17 19 20 22 24 26 27 29 |
| `pentatonic` | 12 14 16 19 21 24 26 28 31 33 36 |

Jede ist eine eigene Wellenleiter-Schleife ohne Schnarren (T60 7 s bei 262 Hz, 4 s bei 1047 Hz), angetrieben von der Stegkraft der Hauptsaite. Sie antworten stark, wenn ein Oberton der gespielten Note auf einen ihrer Teiltöne fällt, und klingen weiter, nachdem die Hauptsaite abgedämpft ist. `sympathetic` (0 bis 1) ist ihr Anteil am Klang. Liegt der Ton in der Tonleiter, wird er um 2 bis 3 dB lauter und klingt nach dem Abdämpfen noch etwa 14 dB unter dem Ton weiter; bei Tönen außerhalb sind es nur leise Teiltöne.

## Korpus

Kürbis mit dünner Holzdecke als Parallelbank aus Zwei-Pol-Resonatoren: Luftmode bei 118 Hz, Deckenmoden zwischen 205 und 960 Hz mit Güten von 10 bis 20, darüber ein fester, pseudozufälliger Satz schwächerer Moden bis 6 kHz. Die Decke strahlt bis zu ihren ersten Moden mit steigender Frequenz besser ab, das macht ein Hochpass erster Ordnung bei 450 Hz. Dazu ein Hochpass bei 80 Hz und ein Tiefpass bei 9,5 kHz.

Das Schnarren verändert die Spitze des Anschlags stark und nicht gleichmäßig: Bei mittlerer Wölbung ist der Anschlag am spitzesten, bei geschlossenem Steg baut sich dagegen die Resonanz einer gleich gestimmten Resonanzsaite höher auf. Ein fester Pegelversatz je Stellung gleicht das aus. Er ist für `jawari` 0, 0,1 bis 1 gemessen und dazwischen linear verbunden, von +4,7 dB bei 0 über −1,6 dB bei 0,6 bis −3,2 dB bei 1. So liegt der lauteste Ton bei jeder Stellung nahe −3 dBFS, und der Regler ändert die Farbe, nicht die Aussteuerung.

## Parameter

| Name | Bereich | Standard | Bedeutung |
|---|---|---|---|
| `midi` | 48 bis 84 | 61 | Tonhöhe, auch gebrochen |
| `velocity` | 0,05 bis 1 | 0,8 | Anschlagstärke, steuert Pegel und Stärke des Schnarrens |
| `duration` | 0 bis 30 s | 3 | Zeit bis zum Abdämpfen, danach 0,4 s Ausklang |
| `seed` | Zahl | 1 | Streuung von Stimmung (±0,8 Cent) und Zupfstelle |
| `jawari` | 0 bis 1 | 0,6 | Wölbung des Stegs, 1 ist offen und hell |
| `sympathetic` | 0 bis 1 | 0,5 | Anteil der Resonanzsaiten |
| `tonic` | 40 bis 60 | 49 (C♯3) | Grundton, auf den die Resonanzsaiten gestimmt sind |
| `scale` | `major`, `minor`, `pentatonic` | `major` | Stimmung der Resonanzsaiten |
| `pluckPosition` | 0,05 bis 0,15 | 0,08 bis 0,105 | Zupfstelle als Anteil der Länge vom Steg |
| `meend` | −5 bis 5 | 0 | Ziel des Ziehens in Halbtönen |
| `meendAt` | 0 bis 30 s | 0,3 | Beginn des Ziehens |
| `meendTime` | 0,01 bis 5 s | 0,35 | Dauer des Ziehens |

Werte außerhalb des Bereichs werden auf den Rand gesetzt, ein Wert, der keine endliche Zahl ist, oder eine unbekannte Tonleiter ergibt einen Fehler mit dem Namen des Parameters. Ausgabe ist mono mit 48 kHz.

## Messwerte

Gemessen in drei Läufen. Erstens jeder Halbton von 48 bis 84 bei Velocity 1, `jawari` von 0 bis 1 in Schritten von 0,05 (13 Stellungen), Resonanzsaiten halb und voll, Grundton 42, 52 und 60, Stimmung `major` und `pentatonic`, Zupfstelle 0,05, 0,15 und zufällig, zwei Seeds (34 632 Töne). Zweitens jeder zweite Halbton mit Velocity 0,2, 0,6 und 1, `jawari` 0, 0,3, 0,6 und 1, Resonanzsaiten aus und voll, Grundton 40 und 60 (3648 Töne). Drittens Meend um +5 und −5 Halbtöne bei `jawari` 0, 0,6 und 1 (114 Töne):

| Messgröße | Ergebnis |
|---|---|
| Lautester Ton bei Velocity 1 | −3,1 dBFS, je Stellung von `jawari` zwischen −3,1 und −3,7 dBFS |
| Lautester Ton mit Standardeinstellungen (jeder Halbton, Seed 1) | −12,0 dBFS mit Velocity 0,8, −7,5 dBFS mit Velocity 1 |
| Größter Sprung von Sample zu Sample | 0,31 |
| Nicht endliche Werte | keine |
| Erstes und letztes Sample | exakt 0 |
| Gleichanteil | höchstens 8·10⁻⁵ |
| Stimmung (Spektralspitze 0,25 bis 1,1 s, drei Seeds) | höchstens 1,2 Cent, mit offenem Steg 2,1 Cent; ±0,8 Cent sind gewollte Streuung |
| Stimmung nach einem Meend um 3 Halbtöne | höchstens 1,0 Cent neben dem Zielton |
| Rechenzeit für einen 10 s langen Ton | 0,8 bis 1,0 s |
| Hörbeispiel `demos/sitar.mjs` | −23,1 LUFS, Sample-Spitze −3,0 dBFS, True Peak −3,0 dBTP |

Der große Sprung von Sample zu Sample ist kein Knacken: das Schnarren reicht bis über 15 kHz, und an der Stelle des größten Sprungs verläuft die Welle glatt. Ein Meend um fünf Halbtöne in der obersten Lage zeigt im Spektrogramm keine zurückgespiegelten Obertöne.

## Grenzen

- Nur eine Spielsaite. Die Bordunsaiten, die beim Spiel rhythmisch mitgeschlagen werden, sind nicht eingebaut.
- Die Saite schwingt nur in einer Ebene; die waagrechte Polarisation, die den Steg nicht trifft, fehlt.
- Die Resonanzsaiten haben keinen eigenen Steg mit Schnarren und wirken nicht auf die Hauptsaite zurück.
- Der Steg ist starr; seine Masse und die Bewegung der Decke unter ihm sind im Korpusfilter zusammengefasst.

## Quellen

- C. V. Raman: On some Indian stringed instruments. Proceedings of the Indian Association for the Cultivation of Science 7, 1921 (Wirkung des gewölbten Stegs).
- A. Krishnaswamy, J. O. Smith: Methods for simulating string collisions with rigid spatial obstacles. IEEE Workshop on Applications of Signal Processing to Audio and Acoustics, 2003.
- C. Valette: The mechanics of vibrating strings. In: A. Hirschberg, J. Kergomard, G. Weinreich (Hrsg.), Mechanics of Musical Instruments, Springer 1995 (Saite an gekrümmten Stegen).
- T. I. Laakso, V. Välimäki, M. Karjalainen, U. K. Laine: Splitting the unit delay. IEEE Signal Processing Magazine 13(1), 1996.
- J. O. Smith: Physical Audio Signal Processing. Online-Buch, CCRMA Stanford.

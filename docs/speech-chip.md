# Sprachchip

`instruments/speech-chip.mjs` ist die Roboterstimme der Sprachsynthese-Chips aus den frühen
Achtzigern, wie sie in sprechendem Spielzeug, Spielautomaten und Erweiterungen für Heimcomputer
saßen. Nachgebaut ist das Verfahren dieser Chips: lineare Prädiktion mit einem Kreuzgliedfilter
zehnter Ordnung, grob quantisierte Parameter, 8 kHz Abtastrate, 25 ms pro Rahmen und ein 8-Bit-DAC.
Es gibt keine Sprachaufnahmen. Die Rahmen entstehen im Code aus einem Formantmodell der Vokale und
einiger Konsonanten. Das Instrument singt Vokale und einzelne Silben auf Tonhöhe, keine Wörter.

```js
import { render, meta } from './instruments/speech-chip.mjs';
// meta.presets: aah, ooh, eee, robot, choir, vocoder, ba, da, ka, sa
// meta.vowel: a, e, i, o, u; meta.range: [36, 72]
const [L, R] = render({ preset: 'aah', midi: 57, duration: 1.2 });
const silbe = render({ preset: 'ka', midi: 45, vowel: 'o', duration: 0.3, rough: 0.8 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | Stimme, siehe unten |
| `midi` | Tonhöhe 36 bis 72 (C2 bis C5), wird auf eine ganzzahlige Periode bei 8 kHz gerundet |
| `velocity` | 0 bis 1, wählt die Energiestufe (0 entspricht −20 dB) |
| `duration` | Haltezeit in Sekunden, 0,025 bis 30, auf ganze Rahmen von 25 ms gerundet |
| `vowel` | `a`, `e`, `i`, `o` oder `u`, ersetzt den Vokal des Presets |
| `bend` | Tonhöhenglide in Halbtönen, −12 bis 12, linear über die Haltezeit |
| `rough` | 0 bis 1, vergröbert alle Tabellen (Koeffizienten, Energie, Tonhöhe, DAC) |
| `seed` | Startzustand des Rauschregisters, Phase der Anregung, beim Chor Takt und Einsatz der Chips |

Rückgabe ist immer `[L, R]` als `Float64Array` bei 48 kHz. Nur `choir` ist stereo, sonst sind beide
Kanäle gleich. Gleicher Seed, gleiche Samples. Erstes und letztes Sample sind exakt null.

## Presets

| Preset | Inhalt |
| --- | --- |
| `aah`, `ooh`, `eee` | ein Chip, Vokal a, u oder i, Einsatz über zwei Rahmen, leichtes Vibrato ab 0,3 s |
| `robot` | ein Chip, ohne Vibrato, `rough` 0,6, Einsatz in einem Rahmen: monoton und grob |
| `choir` | vier Chips mit eigenem Takt (±0,6 %), eigenem Vibrato und versetztem Rahmenraster, im Stereobild verteilt, Einsatz über sechs Rahmen |
| `vocoder` | ein stimmhafter und ein stimmloser Chip mit demselben Filter, Formanten 8 % höher und schmaler, `rough` 0,25: hell und rauschig |
| `ba`, `da`, `ka`, `sa` | Silbe aus Konsonant und Vokal (Standard a), danach wird der Vokal gehalten |

## Der Chip

Ein Sprachchip dieser Art speichert keine Wellenform, sondern alle 25 ms einen Rahmen mit rund
50 Bit: Energie, Tonhöhe, stimmhaft oder stimmlos und zehn Reflexionskoeffizienten. Daraus rechnet
er mit 8000 Samples pro Sekunde die Stimme nach dem Quelle-Filter-Prinzip.

```
Anregung (Chirp-Puls oder Schieberegister-Rauschen) · Energie
  -> Kreuzgliedfilter 10. Ordnung (Reflexionskoeffizienten k1 bis k10)
  -> 8-Bit-DAC mit Halteglied bei 8 kHz -> RC-Tiefpass 6 kHz -> Koppelkondensator 40 Hz
```

### Anregung

Stimmhaft: Zu Beginn jeder Periode wird ein kurzer gespeicherter Puls abgespielt, danach Nullen bis
zur nächsten Periode. Der Puls ist ein abklingender Chirp aus 40 Samples, dessen Frequenz in 5 ms
von 3 kHz auf 110 Hz fällt, mittelwertfrei und als 8-Bit-Werte abgelegt. Ist die Periode kürzer als
40 Samples, beginnt der Puls vorzeitig neu, wie im Chip. Die Periode ist eine ganze Zahl von
Samples: `f0 = 8000 / P`.

Stimmlos: Ein 15-Bit-Schieberegister mit Rückkopplung aus den beiden untersten Bits (maximale Länge
32767) liefert pro Sample ±0,35.

### Kreuzgliedfilter

Das Filter ist ein reines Allpolfilter `1/A(z)` in Kreuzgliedform. Pro Sample und Stufe
`m = 10 … 1`:

```
f(m−1) = f(m) − k_m · g(m−1)[n−1]
g(m)[n] = k_m · f(m−1) + g(m−1)[n−1]
```

mit `f(10) = Anregung · Energie` und Ausgang `y = f(0) = g(0)`. Solange alle `|k_m| < 1` sind, ist
das Filter stabil, auch während die Koeffizienten wandern. Deshalb speichern solche Chips
Reflexionskoeffizienten statt Polynomkoeffizienten.

### Interpolation

Jeder Rahmen wird in acht Schritten zu je 25 Samples linear vom alten zum neuen Wert gefahren:
Koeffizienten, Energie und Periode (die Periode nach der Interpolation wieder ganzzahlig). Wechselt
ein Rahmen zwischen stimmhaft und stimmlos, springen Koeffizienten und Periode sofort, nur die
Energie gleitet. Das ergibt die typischen Treppen in Tonhöhenglides und das leichte Zirpen bei
Vokalwechseln.

### DAC und Ausgang

Der Chip rundet sein Ergebnis auf 8 Bit (bei `rough` 1 auf 5 Bit) und begrenzt es auf den
Wertebereich. Ein Halteglied hält jeden Wert 125 µs. Die Spiegelbilder des Spektrums um 8, 16 und
24 kHz, die dabei entstehen, sind Teil des Klangs und bleiben stehen; sie werden nur durch die
sinc-Form des Halteglieds und einen einpoligen RC-Tiefpass bei 6 kHz gedämpft. Die Ausgabe nach
48 kHz erzeugt dagegen keine neuen Spiegelfrequenzen: Jede Stufe der Treppe wird als bandbegrenzter
Sprung eingesetzt (integrierter Kaiser-Sinc mit 20,5 kHz Grenzfrequenz, 64 Abtastwerte breit,
1/512 Sample Auflösung). Beim Chor laufen die vier Chips mit leicht verschiedenen Takten, die
Sprünge liegen dann zwischen den Abtastpunkten und werden genau dort eingesetzt. Ein Hochpass bei
40 Hz entfernt den Gleichanteil wie ein Koppelkondensator.

## Vom Formant zum Rahmen

Die Rahmen werden nicht aus Aufnahmen gewonnen, sondern aus Formanttabellen berechnet.

1. **Pole aus Formanten.** Jeder Formant mit Frequenz `F` und Bandbreite `B` wird bei
   `fs = 8000` zu einem konjugierten Polpaar mit Radius `r = exp(−π·B/fs)` und Winkel
   `θ = 2π·F/fs`, also dem Faktor `1 − 2r·cos θ·z⁻¹ + r²·z⁻²`. Vier Formanten und ein fünftes
   Paar bei 0 Hz mit 560 Hz Bandbreite (zwei reelle Pole, die die Neigung des Stimmlippenpulses
   nachbilden) ergeben ein Polynom zehnten Grades.
2. **Rückwärtsrekursion.** Aus `A(z)` folgen die Reflexionskoeffizienten mit
   `k_m = a_m^(m)` und `a_i^(m−1) = (a_i^(m) − k_m · a_(m−i)^(m)) / (1 − k_m²)`.
3. **Quantisierung.** Die Bitbreiten sind 5, 5, 4, 4, 4, 4, 4, 3, 3, 3 für k1 bis k10. Jede Tabelle
   ist gleichmäßig in `arcsin k` zwischen dem kleinsten und größten Wert verteilt, den das
   Phonem-Inventar braucht (mit etwas Rand). So liegen die Stufen dort dicht, wo `|k|` gegen 1
   geht und kleine Fehler die Formanten stark verschieben. Wird ein Filter durch die Rundung viel
   lauter als das ungerundete (ein Pol rückt an den Einheitskreis), probiert der Encoder für jeden
   Koeffizienten den anderen Nachbarn in der Tabelle und behält, was den Unterschied verkleinert.
4. **Energie.** Der Encoder misst die Leistungsverstärkung des schon quantisierten Filters (für
   stimmhafte Rahmen die Energie eines Chirps durch das Filter geteilt durch die Periode, für
   stimmlose die Impulsantwort mal Rauschleistung) und wählt die Energiestufe, die den Zielpegel
   trifft. Er rundet vorsichtig: höchstens 1 dB über dem Ziel, damit das Gitter nicht übersteuert.
   Bei langen Perioden steckt die ganze Energie in einem Puls; dort zielt der Encoder um den Faktor
   `(60/P)^0,4` tiefer. Die Energietabelle hat 15 Stufen plus Stille, oben 3 dB auseinander und nach
   unten weiter werdend (`−(3j + 0,15j²)` dB), zusammen 71 dB.

| Vokal | F1 | F2 | F3 | F4 |
| --- | --- | --- | --- | --- |
| a | 730 | 1090 | 2440 | 3400 |
| e | 530 | 1840 | 2480 | 3400 |
| i | 270 | 2290 | 3010 | 3500 |
| o | 570 | 840 | 2410 | 3400 |
| u | 300 | 870 | 2240 | 3400 |

Frequenzen in Hz, gerundet im Bereich veröffentlichter Mittelwerte erwachsener Männerstimmen
(Peterson und Barney 1952). Bandbreiten 60 bis 90 Hz für F1, 90 bis 110 Hz für F2, 160 bis 170 Hz
für F3, 250 Hz für F4. Die Formanten bleiben bei jeder Tonhöhe gleich; ein hoher Ton klingt deshalb
wie ein Mann, der Falsett singt.

### Konsonanten

| Silbe | Rahmen vor dem Vokal |
| --- | --- |
| `ba` | zwei stimmhafte Rahmen „Stimmbalken“ (F1 bei 180 Hz, −24 und −22 dB), ein stimmloser flacher Burst (−12 dB), drei Übergangsrahmen vom Lippenlocus (F2 800 Hz) zum Vokal |
| `da` | Stimmbalken wie bei `ba`, ein heller Burst mit Schwerpunkt bei 1,8 und 2,9 kHz (−8 dB), drei Übergänge vom Locus F2 1700 Hz |
| `ka` | ein stiller Rahmen, ein kompakter Burst um 1950 bis 2350 Hz (−6 dB), ein behauchter Rahmen mit halbem Weg zum Vokal, zwei Übergänge vom Locus F2 1950 Hz |
| `sa` | sechs stimmlose Rahmen (150 ms) mit Resonanzen bei 3350, 3750 und 3950 Hz, ansteigend und abfallend zwischen −18 und −6 dB, zwei Übergänge |

Übergänge verlaufen S-förmig und in logarithmischer Frequenz. Da der Chip zwischen den Rahmen
interpoliert, gleiten die Formanten auch innerhalb eines Rahmens.

## Rauheit

`rough` verkleinert alle Tabellen, Zwischenwerte liegen dazwischen:

| Größe | `rough` 0 | `rough` 0,6 | `rough` 1 |
| --- | --- | --- | --- |
| Stufen k1, k2 | 32 | 17 | 11 |
| Stufen k3 bis k7 | 16 | 9 | 6 |
| Stufen k8 bis k10 | 8 | 4 | 3 |
| Energiestufen | 15 | 8 | 8 |
| Perioden | jede ganze Zahl 12 bis 255 | 93, Abstand bis 3 % | 61, Abstand 5 % (85 Cent) |
| DAC | 8 Bit | etwa 6 Bit | 5 Bit |

## Stimmung

Die Periode ist eine ganze Zahl von Samples bei 8 kHz. Tiefe Töne treffen fast genau, oben werden
die Stufen grob. Gemessen per Autokorrelation an `robot` mit `rough` 0, deckungsgleich mit der
Rechnung:

| MIDI | Soll (Hz) | P | Ist (Hz) | Cent |
| --- | --- | --- | --- | --- |
| 36 | 65,4 | 122 | 65,6 | +4 |
| 40 | 82,4 | 97 | 82,5 | +1 |
| 45 | 110,0 | 73 | 109,6 | −6 |
| 48 | 130,8 | 61 | 131,1 | +4 |
| 52 | 164,8 | 49 | 163,3 | −16 |
| 56 | 207,7 | 39 | 205,1 | −21 |
| 57 | 220,0 | 36 | 222,2 | +17 |
| 60 | 261,6 | 31 | 258,1 | −24 |
| 64 | 329,6 | 24 | 333,3 | +19 |
| 66 | 370,0 | 22 | 363,6 | −30 |
| 67 | 392,0 | 20 | 400,0 | +35 |
| 69 | 440,0 | 18 | 444,4 | +17 |
| 72 | 523,3 | 15 | 533,3 | +33 |

Bis MIDI 49 bleibt der Fehler unter 10 Cent, darüber wächst er bis ±35 Cent. Beim Chor mitteln sich
die Fehler der vier Chips teilweise, weil jeder einen etwas anderen Takt hat. Vibrato und `bend`
laufen in ganzzahligen Perioden und klingen deshalb in der Höhe gestuft.

## Pegel und Messung

Jedes Preset hat eine feste Verstärkung, kalibriert mit zufälligen Kombinationen aus allen
Optionen: Tonhöhe stufenlos von 36 bis 72, Velocity 0,2 bis 1, Dauer von einem Rahmen bis 15 s,
jeder Vokal, `rough` und `bend` über den ganzen Bereich samt Grenzen, ganze und gebrochene Seeds
(28 000 Noten, 5200 davon für `choir` und `vocoder`):

| Preset | Verstärkung | lautester Wert (dBFS) |
| --- | --- | --- |
| `aah`, `ooh`, `eee` | 0,95 | −2,04 |
| `robot` | 0,95 | −2,06 |
| `choir` | 0,29 | −2,38 |
| `vocoder` | 0,53 | −3,17 |
| `ba`, `ka`, `sa` | 0,95 | −2,06 |
| `da` | 0,95 | −2,04 |

Ein einzelner Chip kommt nie über etwa −2 dBFS. `choir` mischt vier Chips, `vocoder` zwei, und
ihre Spitzen hängen davon ab, wie die Chips zufällig zusammenfallen. Deshalb sind ihre
Verstärkungen so gewählt, dass sie selbst dann unter −1 dBFS blieben, wenn alle Chips im selben
Sample ihren lautesten Wert erreichten.

Keine Note erreicht die Grenze des DAC (null begrenzte Samples in 6000 nachgezählten Noten), kein
NaN, erstes und letztes Sample immer null, größter Gleichanteil 1,7·10⁻¹², größter Sprung zwischen zwei
Samples 0,39 (eine Stufe des 8-Bit-Signals nach dem Halteglied). Gerechnet wird etwa 200-mal
schneller als Echtzeit.

Kein Begrenzer und keine Normalisierung pro Note. Das Ende jeder Note bekommt 4 ms Ausblendung.

Demo: `node demos/speech-chip.mjs` schreibt `out/speech-chip.wav` (27 s, stereo): ein monotoner
Roboterpuls, eine Silbenfigur aus `da`, `ba` und `ka` mit `sa` als Akzent, Chorakkorde aus je drei
Noten, eine gesungene Melodie und eine helle Antwort mit `vocoder`. Eine lineare Verstärkung auf −1 dBFS Spitze, −16,5 LUFS integriert, True Peak −1,0 dBTP.

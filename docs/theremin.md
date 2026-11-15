# Theremin

`instruments/theremin.mjs` erzeugt ein Theremin. Gespielt wird es ohne Berührung: Die rechte Hand
nähert sich einer senkrechten Antenne und verändert so die Tonhöhe, die linke Hand über einer
Schleifenantenne regelt die Lautstärke. Die Tonhöhe ist stufenlos, zwischen zwei Tönen gleitet
die Hand hindurch.

Umfang: MIDI 36 bis 96 (C2 bis C7), auch gebrochene Werte. Ausgabe mono, 48 kHz.

```js
import { render, meta } from './instruments/theremin.mjs';
const x = render({ midi: 69, velocity: 0.8, duration: 3, preset: 'classic' });
const phrase = render({ duration: 4, line: [[0, 62], [1, 69], [2, 67], [3, 74]] });
```

## Schwebungsoszillator

Im Instrument laufen zwei Hochfrequenzoszillatoren bei etwa 170 kHz. Der eine ist fest, beim
anderen gehört die Antenne mit der Kapazität der Hand zum Schwingkreis. Ein Mischer bildet die
Differenzfrequenz, die im Hörbereich liegt. Das Modell rechnet nicht die 170 kHz selbst, sondern
die Phasendifferenz φ zwischen den beiden Oszillatoren.

**Kopplung.** Zwei Oszillatoren mit fast gleicher Frequenz beeinflussen sich gegenseitig über
Streukapazitäten und die gemeinsame Versorgung. Für die Phasendifferenz gilt dann die
Adler-Gleichung (Adler 1946):

    dφ/dt = Δω − K sin φ

Ohne Kopplung (K = 0) wächst φ gleichmäßig, und der Ton ist ein reiner Sinus. Mit Kopplung zieht
der eine Oszillator den anderen mit: φ verweilt in der Nähe eines Winkels und eilt durch den Rest.
Die Schwingung wird unsymmetrisch und bekommt Obertöne, die etwa wie q^n abfallen, mit
`q = (√(1 + κ²) − 1) / κ` und κ = K / ω. Die mittlere Schwebungsfrequenz ist `√(Δω² − K²)`. Damit
die gewünschte Tonhöhe ω genau stimmt, setzt das Modell `Δω = ω √(1 + κ²)` und `K = κ ω`. Gerechnet
wird mit einem Runge-Kutta-Verfahren zweiter Ordnung bei 192 kHz.

Die Kopplung ist im Bass stärker, `κ = κ₀ (f / 220 Hz)^−0,4`, höchstens 0,9. Tiefe Töne klingen
deshalb rauer, hohe reiner, so wie beim echten Instrument, bei dem die Oszillatoren für tiefe Töne
dichter beieinander liegen.

**Mischer.** Ein Hüllkurvendetektor sieht die Summe zweier Sinusschwingungen mit dem
Amplitudenverhältnis r. Deren Hüllkurve ist exakt

    e = √(1 + r² + 2 r cos φ)

Für kleines r ist das fast ein Sinus, für r gegen 1 nähert es sich einer gleichgerichteten
Kosinusschwingung mit vielen Obertönen. Die Obertöne fallen etwa wie r^n. Im Modell hängt r vom
Lautstärkepegel ab: leise Töne klingen fast rein, laute bekommen Glanz. Der Gleichanteil
`1 + r²/4` wird abgezogen und durch r geteilt, damit der Grundton unabhängig von r gleich laut bleibt.

## Bandbegrenzung

Gerechnet wird mit vierfacher Abtastrate. Ein Oberton fällt dort erst oberhalb von 0,89 · 192 kHz
in den Hörbereich zurück. Das Modell verkleinert r und q gemeinsam, wenn `(r + q)` hoch
`0,89 · 192 kHz / f` größer als 10⁻⁵ wäre. Danach filtert ein Kaiser-Tiefpass bei 20,5 kHz und
dezimiert auf 48 kHz. Verstärker und Lautsprecher des Gehäuses sind ein Hochpass bei 75 Hz und ein
Tiefpass bei 5,5 kHz (je zweiter Ordnung).

## Spielhände

- **Tonhöhe.** Zwei hintereinandergeschaltete Tiefpässe erster Ordnung mit der Zeitkonstante
  `glide / 2` führen die Hand zum Zielton. Das ergibt eine weiche S-Kurve ohne Überschwingen.
  `line` gibt eine gebundene Phrase vor (`[[Sekunden, MIDI], ...]`), `from` lässt einen einzelnen
  Ton von einer anderen Tonhöhe hereingleiten.
- **Vibrato.** Sinusförmig mit `vibrato` Halbtönen Tiefe und `vibratoRate` Hz. Rate und Tiefe
  schwanken langsam um etwa 5 und 15 Prozent. Nach jedem neuen Ton setzt das Vibrato erst nach
  0,15 s ein und blüht über 0,45 s auf, so wie ein Spieler es zulässt, sobald der Ton sitzt. Die
  Lautstärke schwingt leicht mit (2,5 Prozent), weil sich beim Vibrato der ganze Arm bewegt.
- **Lautstärke.** Anschwellen als erhöhter Kosinus über `swell` Sekunden, Ausklang in 0,12 s. Dazu
  ein langsames Atmen von ±3 Prozent und eine Absenkung um bis zu 18 Prozent, solange die Hand
  schnell gleitet. Diese Artikulation kommt aus der Geschwindigkeit der Hand und ist deshalb stetig.
- **Feinstimmung.** Eine langsame Drift von ±3 Cent; das Theremin hat keine Bünde.

## Presets

| Preset | glide | Vibrato | Rate | Anschwellen | r (leise bis laut) | κ₀ |
|---|---|---|---|---|---|---|
| `classic` | 0,07 s | 0,22 Halbtöne | 6,0 Hz | 0,18 s | 0,12 bis 0,62 | 0,35 |
| `scifi` | 0,25 s | 0,9 Halbtöne | 7,2 Hz | 0,35 s | 0,2 bis 0,7 | 0,55 |
| `soft` | 0,1 s | 0,15 Halbtöne | 5,2 Hz | 0,45 s | 0,05 bis 0,3 | 0,15 |

## Parameter

| Parameter | Werte | Standard |
|---|---|---|
| `midi` | 36 bis 96 | 60 |
| `velocity` | 0 bis 1, Lautstärkehand | 0,8 |
| `duration` | Dauer in s, 0,02 bis 60 | 1 |
| `preset` | `classic`, `scifi`, `soft` | `classic` |
| `glide` | 0,005 bis 2 s | aus dem Preset |
| `vibrato` | 0 bis 2 Halbtöne | aus dem Preset |
| `vibratoRate` | 2 bis 10 Hz | aus dem Preset |
| `swell` | 0,005 bis 3 s | aus dem Preset |
| `from` | Starttonhöhe in MIDI | keine |
| `line` | `[[Sekunden, MIDI], ...]` | keine |
| `seed` | Zahl | 1 |

## Messwerte

Durchlauf über jede zweite Note, Anschlag 0,2, 0,6 und 1, alle Presets, jeweils mit Standardwerten
und mit Extremwerten (Vibrato 2 Halbtöne bei 10 Hz, kürzestes Anschwellen, längstes Gleiten,
Gleiten von ganz unten und ganz oben), mehrere Seeds, dazu Phrasen mit Sprüngen über fünf Oktaven:

- Lautester Ton bei Anschlag 1: −1,5 dBFS, schnellste Sprungphrase −1,7 dBFS.
- Keine NaN, erstes und letztes Sample exakt 0, Gleichanteil unter 10⁻⁶.
- Größter Sprung von Sample zu Sample: 0,25.
- Tonhöhe ohne Vibrato: innerhalb von 2,6 Cent, das ist die gewollte Drift der Hand. Die Kopplung
  selbst verschiebt die Tonhöhe nicht.
- Rechenzeit: ein Ton von 10 s braucht etwa 2,5 s.
- Spektrogramme von Glissandi über den ganzen Umfang zeigen keine Spiegelfrequenzen.

Die Demo `demos/theremin.mjs` spielt eine eigene Phrase in d-Moll auf `classic`, eine Antwort auf
`soft` und zum Schluss weite Sprünge auf `scifi`. Spitzenpegel −1,0 dBFS, True Peak −1,0 dBTP.

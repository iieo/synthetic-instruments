# Handpan

`instruments/handpan.mjs` erzeugt einen Ton einer Handpan ohne Samples, aus einem kleinen modalen
Modell mit nichtlinearer Kopplung. Die festen Eigenschaften des Instruments (Schalenmoden, Stimmung
jedes Notenfelds, Aufspaltung der Modenpaare) liegen in `instruments/handpan/body.mjs`. Die
Schwinger mit exaktem Zeitschritt kommen aus `instruments/steelpan/model.mjs`.
Die Demo `demos/handpan.mjs` schreibt `out/handpan.wav`: ein Groove in d-Moll mit Ding auf der Eins,
gedämpften Klopfern auf den Offbeats, darüber eine Melodie, erst weich, dann hell am Rand gespielt,
zum Schluss ein Arpeggio hinunter zum Ding.

```js
import { render, meta } from './instruments/handpan.mjs';
const x = render({ midi: 57, velocity: 0.8, duration: 3, preset: 'soft', strike: 'center', seed: 3 });
// Float64Array, mono, 48 kHz
```

## Parameter

| Parameter | Bereich | Standard | Bedeutung |
| --- | --- | --- | --- |
| `midi` | 45 bis 79 | 57 | Ton, gerundet und auf `meta.range` begrenzt. Jeder Halbton ist spielbar. |
| `velocity` | 0,01 bis 1 | 0,8 | Anschlagstärke |
| `duration` | 0,02 bis 30 s | 3 | Zeit, die der Ton frei klingt. Danach legt sich eine Hand auf das Feld und dämpft ihn in 0,15 s ab. |
| `preset` | `soft`, `bright`, `ding` | `soft` | Spielweise und Charakter |
| `strike` | `center`, `edge`, `muted` | `center` | Anschlagstelle im Notenfeld |
| `seed` | beliebige Zahl | 1 | Zufall für kleine Schwankungen von Schlag zu Schlag. Gleicher Seed ergibt identische Ausgabe, auch Nachkommastellen zählen. |

Fehlt ein Parameter oder ist er `null`, gilt der Standard. Eine Zahl, die nicht endlich ist, oder
ein unbekannter Name für `preset` oder `strike` führen zu einem Fehler, der den Parameter nennt.

Presets:

- `soft`: weicher Fingerballen, längerer Kontakt, warmer Ton mit wenig hohen Moden.
- `bright`: schneller Fingerschlag etwas näher am Rand, kurzer Kontakt, stärkere Kopplung zwischen
  den Moden, deutlich mehr Oktave, Quinte und Anschlaggeräusch.
- `ding`: der Charakter der großen Mittelnote. Längeres Ausklingen, stärkere Schwebung der
  Modenpaare, mehr Hohlraumresonanz und mehr Schale.

Anschlagstellen: `center` trifft das Feld nahe der Mitte und betont den Grundton, `edge` trifft
näher am Rand und weckt Oktave, Quinte und die höheren Moden. `muted` ist der gedämpfte Schlag, bei
dem die Hand auf dem Feld liegen bleibt: der Ton ist nach wenigen Zehntelsekunden weg, das Klopfen
der Schale bleibt.

## Das Instrument

Eine Handpan besteht aus zwei tiefgezogenen, nitrierten Stahlschalen, die am Rand verklebt sind. In
die obere Schale sind sieben bis zehn flache Notenfelder eingehämmert, jedes mit einer kleinen
Kuppel in der Mitte, dazu in der Mitte eine größere Note, das Ding. Die untere Schale hat ein rundes
Loch, den Port. Gespielt wird mit Fingern und Daumen.

Jedes Notenfeld ist eine gespannte, leicht gewölbte Platte. Der Stimmer bringt drei ihrer Moden auf
harmonische Verhältnisse: Grundton, Oktave und die Duodezime, also die Quinte über der Oktave
(1 : 2 : 3). Der Grundton schwingt als Ganzes, die Oktave hat eine Knotenlinie quer über das Feld,
die Duodezime eine dazu senkrechte. Weil die Felder nicht perfekt rund sind, ist jede dieser Moden ein
Paar mit fast gleicher Frequenz, das langsam gegeneinander schwebt (Morrison und Rossing 2009).

Die Felder sind über die Schale verbunden. Ein angeschlagenes Feld regt andere Felder an, deren
Moden auf seinen Teiltönen liegen, und die Luft im Inneren bildet mit dem Port einen
Helmholtz-Resonator, dessen Frequenz bei rund 130 Hz unter den tiefsten Noten liegt.

## Modell

### Notenfeld

Das angeschlagene Feld hat bis zu sieben Moden mit Einheitsmasse:

- Grundton f0, Oktave 2 f0 und Duodezime 3 f0, jede mit einem festen Stimmfehler von höchstens
  1,2, 2,5 und 4 Cent.
- vier ungestimmte höhere Moden bei etwa 3,85, 4,6, 5,45 und 6,7 f0, die rasch abklingen.

Die Nachhallzeit des Grundtons liegt bei 7,5 s in der Tiefe und 3 s in der Höhe (mal 1,3 beim
`ding`), Oktave und Duodezime haben 75 und 50 Prozent davon. Jede gestimmte Mode bekommt einen
linearen Partner, der um 0,25 bis 2 Hz höher liegt und etwa ein Fünftel ihrer Anregung erhält. Das
gibt die langsame Schwebung.

Jede Mode wird mit dem exakten Propagator eines gedämpften Oszillators fortgeschrieben, Tonhöhe und
Abklingen sind damit unabhängig vom Zeitschritt genau.

### Nichtlineare Kopplung

Die gewölbte Platte hat eine quadratische Rückstellkraft. Als kubisches Potential
c · q_i · q_j · q_k zwischen Moden mit f_i + f_j = f_k geschrieben, verschiebt sie Energie vom
Grundton in die Oktave (1 + 1 = 2) und von Grundton und Oktave in die Duodezime (1 + 2 = 3). Dazu
kommt ein kleiner kubischer Härteterm am Grundton. Die Stärke c ist auf 0,004 bis 0,009 mal ω1²
gesetzt, so dass ein leiser Schlag fast nur den Grundton bringt und ein harter Schlag in den ersten
Zehntelsekunden deutlich mehr Oktave und Duodezime aufbaut (Achong 1996 für das Prinzip bei der Pan).

### Anschlag mit der Hand

Der Finger wird als weicher Kontaktkraftimpuls modelliert, eine Gaußglocke der Breite τ/6 über die
Kontaktzeit τ:

F(t) = A · exp(−((t − τ/2) / (τ/6))²), 0 ≤ t < τ

A ist so gewählt, dass der übertragene Impuls zur Anschlagstärke passt. τ liegt je nach Preset bei
1,3 bis 2,2 ms für ein Feld bei 220 Hz, wird für kleinere, steifere Felder kürzer (τ ∝ f0^−0,6) und
für harte Schläge kürzer. Das Spektrum der Gaußglocke fällt glatt ab und hat keine Nullstellen, so
regt ein weicher Schlag nur die unteren Moden an. Während des Kontakts rechnet das Modell mit achtfach
feinerem Zeitschritt. Wie stark jede Mode angeregt wird, hängt von der Anschlagstelle ab: in der
Mitte vor allem der Grundton, am Rand Oktave, Duodezime und höhere Moden.

### Kopplung über die Schale

Die Nachbarfelder sind lineare Resonatoren, angetrieben von der Auslenkung des angeschlagenen
Felds. Berücksichtigt sind Grundton, Oktave und Duodezime der Felder eine Oktave darüber und
darunter, eine Quinte darüber und darunter, eine Duodezime darüber und darunter sowie des Dings
(D3). Weil sie nur nahe ihrer Resonanz merklich antworten, klingen vor allem die Felder mit, deren
Moden auf Teiltönen des gespielten Tons liegen. Ihr Anteil liegt rund 25 dB unter dem Ton.

Vierzehn feste Schalenmoden zwischen etwa 160 Hz und 3,7 kHz mit Nachhallzeiten von 0,06 bis 0,6 s
werden von der Kontaktkraft angestoßen. Sie geben das kurze metallische Klopfen am Anfang, das beim
gedämpften Schlag fast allein übrig bleibt.

### Helmholtz-Resonanz

Die Luft im Inneren und der Port bilden einen Oszillator bei 128 Hz mit Güte 7. Angetrieben wird er
von der Volumenänderung des Felds, also fast nur vom Grundton, denn bei Oktave und Duodezime heben
sich die Hälften auf beiden Seiten der Knotenlinie weitgehend auf. Abgestrahlt wird die
Beschleunigung des Luftpfropfens im Port. Tiefe Töne nahe 130 Hz bekommen dadurch hörbar mehr Bass
und einen weichen Einschwinger, hohe Töne merken davon wenig.

### Abstrahlung und Pegel

Der Ausgang ist die Summe der Modenbeschleunigungen mit festen Abstrahlgewichten (Grundton 1,
Oktave 0,8, Duodezime 0,6, höhere Moden 0,06 bis 0,12) plus Nachbarfelder, Schale und Port. Alle
Anteile sind Sinusschwinger unter 0,4 · SR, das Signal ist damit bandbegrenzt, ohne
Überabtastung. Die Modenbeschleunigung wird aus der Auslenkung gerechnet, −ω²·q, ohne den direkten
Kraftanteil während des Kontakts. Ohne Ausgleich trüge deshalb jeder Schlag einen Gleichanteil in
Höhe seines Impulses, besonders bei kurzen, gedämpften Tönen. Eine geschlossene Schale strahlt
keinen Gleichanteil ab, ein Hochpass vierter Ordnung bei 20 Hz entfernt ihn. Die tiefsten Felder
(110 Hz) und ihre Nachbarn eine Oktave tiefer liegen deutlich darüber. Jeder Ton beginnt mit einer Kosinus-Einblendung über 24 Samples und endet mit einer
Ausblendung über 30 ms, erstes und letztes Sample sind exakt null.

Jedes Preset hat einen festen Ausgangspegel, eingemessen über alle Töne, alle Anschlagstellen und
zwölf Seeds bei voller Anschlagstärke: der lauteste Einzelton liegt bei −3,0 dBFS. Es gibt keinen
Limiter. Hohe Töne sind bei gleicher Anschlagstärke bis etwa 3 dB leiser als tiefe, gedämpfte
Schläge 3 bis 5 dB leiser als offene.

## Messwerte

Gemessen über jeden zweiten Halbton von 45 bis 79, Anschlagstärken 0,2, 0,6 und 1, alle Presets,
alle Anschlagstellen, die Dauern 0,02, 0,3 und 3 s und drei Seeds (4374 Töne), dazu der Pegel über alle
Halbtöne mit zwölf Seeds:

| Größe | Wert |
| --- | --- |
| lautester Einzelton (alle Presets) | −3,0 dBFS |
| lautester Ton je Preset in der Mitte angeschlagen | `soft` −4,6, `bright` −5,1, `ding` −3,8 dBFS |
| größter Sprung zwischen zwei Samples | 0,131 (`bright`, Rand, Ton 79, voller Schlag) |
| ungültige Samples (NaN, unendlich) | 0 |
| erstes und letztes Sample | exakt 0 |
| größter Mittelwert eines Tons, über seine eigene Länge | 0,00025 (gedämpft, Ton 45, 20 ms) |
| 24 Schläge im Abstand von 125 ms: stärkste Linie unter 10 Hz | 44 dB (gedämpft, Ton 45) bis 70 dB (offen, Ton 69) unter der stärksten Linie |
| Tonhöhenfehler des Grundtons | höchstens 1,5 Cent, im Mittel 0,6 Cent |
| Rechenzeit | etwa 21 mal schneller als Echtzeit, ein 10 s langer Ton in rund 0,4 s |

Die Tonhöhe wurde über 2 s nach den ersten 0,3 s gemessen. Der Fehler ist der feste Stimmfehler
des Felds plus der Anteil des schwebenden Partners. Spektrogramme einer chromatischen Leiter über den
ganzen Bereich zeigen keine Spiegelfrequenzen, der Inhalt endet auch beim hellsten Schlag auf dem
höchsten Ton unter 12 kHz.

Die Demo ist auf −3 dBFS Spitzenpegel gebracht und hat −21,1 LUFS bei einem True Peak von
−3,0 dBTP.

## Quellen

- Achong, A. (1996): The steelpan as a system of non-linear mode-localized oscillators. Journal of
  Sound and Vibration 197.
- Morrison, A. und Rossing, T. D. (2009): The extraordinary sound of the hang. Physics Today 62.
- Helmholtz-Resonator nach Lehrbuch: f_H = c / (2π) · √(A / (V · L_eff)).

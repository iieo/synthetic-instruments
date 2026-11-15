# Steel Pan (Tenor Pan)

`instruments/steelpan.mjs` erzeugt einen Ton einer Tenor-Pan ohne Samples, nur aus einem kleinen
physikalischen Modell. Die Hilfsfunktionen für die Schwinger liegen in `instruments/steelpan/model.mjs`.
Die Demo `demos/steelpan.mjs` schreibt `out/steelpan.wav`: eine Calypso-Melodie mit Rolls und
Doppelgriffen, leise und laut gespielt, danach eine langsame Balladen-Phrase.

```js
import { render, meta } from './instruments/steelpan.mjs';
const x = render({ midi: 72, velocity: 0.8, duration: 2, seed: 3 }); // Float64Array, mono, 48 kHz
```

`meta.range` ist `[60, 88]` (C4 bis E6). `midi` ist ohne Angabe 60, wird auf ganze Halbtöne
gerundet und auf diesen Bereich begrenzt. Ist `midi`, `velocity`, `duration` oder `seed` keine
endliche Zahl, wirft `render` einen Fehler. `duration` ist die Zeit, die der Ton frei klingt
(mindestens 0,02 s). Danach
dämpft eine Hand ihn innerhalb von 0,12 s ab. Ein Roll entsteht in der Demo aus vielen einzelnen
`render`-Aufrufen mit wechselndem `seed`.

## Physik der Pan

Eine Pan ist ein tiefgezogener Stahlboden. Jede Note ist eine eigene, flach gewölbte Fläche, die durch
Hämmern gespannt und gestimmt wird. Der Stimmer bringt mehrere Moden dieser Fläche auf harmonische
Verhältnisse: Grundton, Oktave und bei größeren Noten die Duodezime (1 : 2 : 3), manchmal auch die
Doppeloktave (1 : 2 : 4). Kleine, hohe Noten bekommen meist nur Grundton und Oktave
(Rossing, Hansen und Hampton 2000; Rossing 2000).

Was die Pan von einer Glocke oder einem Vibraphon unterscheidet, ist die Nichtlinearität. Die Notenfläche
ist gewölbt, ihre Rückstellkraft hat deshalb einen quadratischen Anteil. Weil die Moden harmonisch
liegen, sind sie in innerer Resonanz: die Schwingung des Grundtons treibt über diesen quadratischen
Anteil die Oktave an, Grundton und Oktave zusammen die Duodezime. Energie fließt in den ersten etwa
100 ms vom Grundton in die Oktave und teils wieder zurück. Die Oktave kann nach dem Anschlag sogar
anschwellen. Achong hat das mit gekoppelten nichtlinearen Oszillatoren beschrieben (Achong 1996;
Achong und Sinanan-Singh 1997), Messungen an echten Pans zeigen denselben Effekt (Rossing, Hansen und
Hampton 2000).

Weitere Merkmale:

- Gespielt wird mit Stöcken, deren Spitze mit Gummi umwickelt ist. Der Kontakt ist weich und dauert
  rund eine Millisekunde. Höhere Teiltöne regt der Stock selbst kaum an, sie entstehen erst durch die
  Nichtlinearität. Deshalb klingt ein harter Schlag deutlich heller als ein leiser.
- Benachbarte Noten schwingen mit. Auf einer Tenor-Pan liegen die Noten im Quinten- und Quartenkreis
  nebeneinander, Oktavnoten liegen innen oder außen direkt daneben. Ihre Moden fallen auf Teiltöne der
  angeschlagenen Note und klingen leise mit (Rossing, Hansen und Hampton 2000).
- Die Zarge (der Mantel aus dem Fass) und der übrige Boden haben eigene Moden. Sie färben den Anschlag
  und klingen schnell ab.
- Gestimmt wird von Hand. Die Moden liegen einige Cent neben dem exakten Verhältnis, was dem Ton eine
  leichte Lebendigkeit gibt.

## Modell

### Notenfläche

Die angeschlagene Note hat fünf Moden mit Einheitsmasse. Bei Noten unter F5 liegen sie bei
1, 2, 3, 4 und etwa 5,6 mal dem Grundton, darüber bei 1, 2, etwa 3,55, etwa 4,7 und etwa 5,6. Jede
Note bekommt einen festen Stimmfehler von wenigen Cent pro Mode. Er hängt vom Instrument ab, nicht vom
Anschlag. Die Nachhallzeit des Grundtons liegt bei 2,5 s in der Tiefe und 1,2 s in der Höhe, höhere
Moden klingen schneller ab.

Die Kopplung steht als kubisches Potential zwischen Moden, deren Frequenzen sich addieren:

    V = c12 q1² q2 + c123 q1 q2 q3 + c24 q2² q4 + c134 q1 q3 q4 + d q1⁴ / 4

Die Kräfte sind `-∂V/∂q`. Das Potential sorgt dafür, dass die Kopplung Energie nur verschiebt und
keine erzeugt. Die Stärken sind so gewählt, dass bei einem harten Schlag in C5 die Oktave nach etwa
50 ms ihr Maximum erreicht. Der quartische Term ist eine leichte Versteifung: harte Schläge starten
wenige Cent zu hoch.

### Stock

Der Stock hat eine Masse und eine Anfangsgeschwindigkeit, die mit `velocity` wächst. Die Kontaktkraft
folgt Hertz mit Verlust nach Hunt und Crossley:

    F = K · δ^1,5 · (1 + λ · δ')   für δ > 0

`δ` ist die Eindrückung zwischen Stockspitze und Notenfläche am Anschlagpunkt. `K` wird pro Note so
bestimmt, dass ein mittlerer Schlag etwa 1,25 ms (tief) bis 0,9 ms (hoch) Kontakt hat. Mit der
Hertzschen Abhängigkeit wird der Kontakt bei härteren Schlägen von selbst kürzer. Der Anschlagpunkt
variiert von Schlag zu Schlag, damit ändern sich die Gewichte, mit denen die Kraft auf die Moden
wirkt.

### Abstrahlung

Der Schalldruck folgt der Volumenbeschleunigung der Notenfläche. Das verdrängte Volumen einer gewölbten
Fläche ist nicht linear in ihrer Auslenkung. Das Modell nimmt dafür `u + β u² + γ u³` an, wobei `u`
die gewichtete Summe der Moden ist. Bei leisen Schlägen ist das fast linear, bei lauten entstehen
zusätzliche harmonische Anteile. Diese Nichtlinearität sitzt in der Physik des Instruments, nicht am
Ausgang: der fertige Ton wird nicht gesättigt.

### Nachbarn, Zarge, Boden

- Nachbarnoten (Oktave darüber und darunter, Quinte darüber und darunter) sind lineare Resonatoren mit
  den Moden ihrer eigenen Note. Die Auslenkung der angeschlagenen Note treibt sie schwach an, sie wirken
  nicht zurück.
- Die Zarge hat fünf Moden zwischen 140 und 600 Hz, der Boden 18 Moden zwischen 0,7 und 10 kHz. Beide
  werden von der Kontaktkraft angeregt und klingen in 0,03 bis 0,4 s ab.
- Zum Schluss glättet ein zweistufiger Tiefpass bei 6,5 kHz, damit nichts schrill wird.

### Numerik

Jede Mode wird pro Schritt mit dem exakten Propagator des gedämpften Oszillators fortgeschrieben,
dadurch stimmen Tonhöhe und Abklingen unabhängig von der Abtastrate. Kopplung und Kontaktkraft wirken
als Kraftstoß dazwischen. Solange der Stock die Note berührt, rechnet das Modell mit acht Unterschritten
pro Abtastwert, danach mit der normalen Rate. Alle Indizes sind ganzzahlig, der Zufall kommt aus `rng`
mit festem Seed. Gleiche Parameter ergeben also exakt denselben Ton.

## Parameter

| Größe | Wert | Wirkung |
| --- | --- | --- |
| Nachhall Grundton | 2,5 s bis 1,2 s | Länge des Tons über den Tonumfang |
| Kopplung c12 | 0,06 ω1² | Tempo des Energieflusses Grundton zu Oktave |
| Kopplung c123, c24, c134 | 0,03 bis 0,05 ω1² | Duodezime und Doppeloktave |
| Kontaktdauer | 1,25 ms bis 0,9 ms | Weichheit des Gummistocks |
| β, γ | 0,45, 0,3 | Helligkeit lauter Schläge |
| Stimmfehler | ±2 Cent Grundton, bis ±12 Cent höhere Moden | Lebendigkeit, leichte Schwebung |
| Tiefpass | 6,5 kHz, 2 Pole | keine scharfen Höhen |

## Messung

Als Vergleich diente der General-MIDI-Klang Steel Drums (Programm 115) aus einer freien Soundfont.

- Stimmung: im ausgeklungenen Ton liegen alle geprüften Noten (C4 bis E6) innerhalb von ±2 Cent. Ein
  harter Schlag beginnt bis zu 5 Cent zu hoch.
- Spektrale Entwicklung (C5, Schlag mit voller Stärke): der Grundton fällt in den ersten 50 ms um gut
  6 dB, die Oktave steigt in derselben Zeit um knapp 3 dB und liegt danach über dem Grundton. Die
  Duodezime wächst bis etwa 100 ms um 9 dB. Danach wandert Energie teils zurück in den Grundton. Ein
  leiser Schlag (`velocity` 0,3) ist etwa 17 dB leiser, die Duodezime liegt dort 13 dB tiefer relativ
  zum Grundton, die fünfte Harmonische fast 30 dB.
- Abklingen: Grundton etwa 2 s Nachhall in der Mitte des Umfangs. Der Vergleichsklang klingt schneller
  ab (rund 0,7 s) und hat eine stärkere vierte Harmonische. Echte Pans liegen je nach Instrument und
  Note dazwischen.
- Demo: Spitze −3 dBFS, integriert −22,3 LUFS, größter Sprung zwischen zwei Abtastwerten 0,086. Die
  Demo rendert in rund 4 s.

## Grenzen

- Ein Roll ist eine Summe einzelner Töne. Dass der Stock auf eine schon schwingende Fläche trifft,
  bildet das Modell nicht ab.
- Die Nachbarnoten wirken nicht auf die angeschlagene Note zurück.
- Die Moden haben keine räumliche Form und keine Abstrahlrichtung, das Ergebnis ist mono.

## Quellen

- A. Achong: The steelpan as a system of non-linear mode-localized oscillators, Part I: Theory,
  simulations, experiments and bifurcations. Journal of Sound and Vibration 197 (4), 1996, S. 471 bis 487.
- A. Achong, K. Sinanan-Singh: The steelpan as a system of non-linear mode-localized oscillators,
  Part II: Coupled sub-systems, simulations and experiments. Journal of Sound and Vibration 203 (4),
  1997, S. 547 bis 561.
- T. D. Rossing, U. J. Hansen, D. S. Hampton: Vibrational mode shapes in Caribbean steelpans.
  Journal of the Acoustical Society of America 108 (2), 2000, S. 803 bis 812.
- T. D. Rossing: Science of Percussion Instruments. World Scientific, 2000 (Kapitel über Steelpans).
- K. H. Hunt, F. R. E. Crossley: Coefficient of restitution interpreted as damping in vibroimpact.
  Journal of Applied Mechanics 42 (2), 1975, S. 440 bis 445.
- K. L. Johnson: Contact Mechanics. Cambridge University Press, 1985 (Hertzscher Kontakt).

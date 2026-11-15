# Streicherensemble

Eine Streichergruppe im Orchester: pro Note acht bis zehn Spielerinnen und Spieler aus Violinen,
Bratschen und Celli, jede Stimme ein eigenes physikalisches Modell einer gestrichenen Saite, mit
eigener Verstimmung, eigenem Vibrato, Bogendruck und Einsatz. Dazu ein kleiner Konzertsaal als
Rückkopplungsnetz aus Verzögerungsleitungen. Kein Sample, keine Impulsantwort.

Dateien: `instruments/string-ensemble.mjs` (Einstieg, Pegel, `render`),
`instruments/string-ensemble/sections.mjs` (Gruppen, Sitzordnung, Korpusvarianten),
`instruments/string-ensemble/voice.mjs` (Steuerung einer gestrichenen Stimme, Pizzicato),
`instruments/string-ensemble/hall.mjs` (Saal). Die gestrichene Saite selbst und die Korpusfilter
kommen aus `instruments/strings-bowed/` (siehe `docs/bowed-strings.md`). Demo:
`node demos/string-ensemble.mjs` schreibt `out/string-ensemble.wav`.

## Schnittstelle

```js
import { render } from './instruments/string-ensemble.mjs';
const [left, right] = render({ midi: 62, velocity: 0.7, duration: 2, preset: 'legato', seed: 1, hall: 0.35 });
```

| Parameter | Bereich | Bedeutung |
| --- | --- | --- |
| `midi` | 36 bis 96 (C2 bis C7), Standard 60 | Tonhöhe |
| `velocity` | 0,01 bis 1 | Bogengeschwindigkeit, beim Pizzicato die Stärke des Zupfens |
| `duration` | 0,05 bis 20 s, Standard 2 | Länge des Bogenstrichs. Kurze Striche dauern mindestens 0,07 s und mindestens sechs Perioden, denn so lange braucht die Saite zum Ansprechen. Bei `staccato` höchstens 0,2 s, beim Pizzicato der Zeitpunkt, an dem die Saite abgedämpft wird |
| `preset` | `legato`, `staccato`, `tremolo`, `pizzicato` | Spielweise |
| `seed` | beliebige Zahl | Alle Unterschiede zwischen den Stimmen. Gleicher Seed, gleiche Samples |
| `hall` | 0 bis 1, Standard 0,35 | Anteil des Saals. 0 ist trocken und ohne Nachhall |

Das Ergebnis ist stereo, `[links, rechts]`, 48 kHz. Werte außerhalb der Bereiche werden auf die
Grenze gesetzt, fehlende Werte nehmen den Standard. NaN, unendliche Werte und Text statt einer Zahl
bei `midi`, `velocity`, `duration`, `seed` oder `hall` werfen einen Fehler mit dem Namen des
Parameters, ebenso ein unbekanntes Preset.

## Wer spielt

| MIDI | Stimmen |
| --- | --- |
| 36 bis 47 | 8 Celli |
| 48 bis 54 | 5 Celli und 4 Bratschen |
| 55 bis 61 | 5 Bratschen und 5 Violinen |
| 62 bis 96 | 10 Violinen |

Sitzordnung vom Dirigenten aus: Violinen links (Panorama −0,8 bis −0,15), Bratschen halbrechts
(−0,05 bis 0,45), Celli rechts (0,3 bis 0,85), jede Stimme mit eigenem Platz und konstanter
Leistung im Panorama.

## Eine Stimme

Jede Stimme ist eine vollständige gestrichene Saite: Wellenleiter mit Reibungskennlinie am Bogen,
Torsion und Verlusten an Steg und Griffstelle, wie bei Violine und Cello in diesem Repo. Was sich
pro Stimme unterscheidet (alles aus dem Seed):

| Größe | Streuung |
| --- | --- |
| Verstimmung | normalverteilt, σ = 3,5 Cent, begrenzt auf ±9 Cent |
| Vibrato | 4,7 bis 6,1 Hz, 7 bis 18 Cent tief, setzt nach 0,12 bis 0,42 s ein |
| Bogendruck | 0,85 bis 1,15 des Nennwerts |
| Bogengeschwindigkeit | 0,9 bis 1,1 des Nennwerts, velocity ebenfalls ±10 % |
| Bogenposition | 0,12 bis 0,17 der Saitenlänge vom Steg |
| Einsatz | Legato bis 45 ms später, Staccato bis 14 ms, Tremolo bis 20 ms, Pizzicato bis 25 ms |
| Anstrich | Legato 0,16 bis 0,28 s, mindestens 12 Perioden, damit sich die Helmholtz-Bewegung sauber aufbaut. Bei kurzen Noten höchstens 35 % der Strichlänge (aber mindestens 18 ms oder fünf Perioden), dazu ein stärkerer Druckakzent am Anfang |

Zusätzlich driftet die Intonation jeder Stimme langsam um knapp einen Cent.

**Korpus.** Gleiche Saiten auf demselben Korpus würden bei bestimmten Tönen alle gemeinsam auf eine
Korpusresonanz treffen. Jede Gruppe hat deshalb drei Korpusvarianten, deren Moden um −4,5 %, 0 und
+4,5 % verschoben und einzeln um bis zu 2 % gestreut sind, mit je eigenem dichten Modenfeld. Die
Stimmen werden reihum verteilt. Weil der Korpus linear ist, werden alle Stimmen einer Variante
zuerst summiert und dann einmal pro Kanal gefiltert. Die Bratsche nutzt die Violinmoden um den
Faktor 0,8 tiefer und eine eigene Brückenhügel-Hüllkurve um 2,3 kHz.

**Rechenaufwand.** Pro Stimme läuft nur der Wellenleiter, die Korpusfilter laufen einmal pro
Variante und Kanal. Ein Akkordton mit 2 s Strich und Saal (4,5 s Audio) rechnet in
0,6 s, ein Legato von 10 s (12,5 s Audio) in 2,1 s, ein Pizzicato in einem Bruchteil davon.

## Spielweisen

* `legato`: langsamer Anstrich, volles Vibrato, am Ende hebt der Bogen ab und die Saite wird
  gedämpft (T60 0,3 s).
* `staccato`: kurzer Strich von höchstens 0,2 s, schneller Anstrich (18 ms oder fünf Perioden) mit
  Druckakzent, danach bleibt der Bogen auf der Saite und stoppt sie (T60 0,08 s).
* `tremolo`: 11,6 bis 15 Bogenwechsel pro Sekunde, jede Stimme mit eigener Rate. Bei jedem Wechsel
  läuft die Bogengeschwindigkeit durch null und die Helmholtz-Bewegung baut sich in der Gegenrichtung
  neu auf. Weil die Stimmen nicht synchron sind, entsteht das typische Flirren.
* `pizzicato`: Der Finger zieht die Saite bei 24 bis 34 % der Länge zur Seite. Kraft am Steg pro
  Teilton ∝ sin(mπβ)/m, die Fingerkuppe rundet die Ecke ab (Gaußfenster über die Teiltonzahl,
  breiter bei leisem Zupfen). Teiltöne bis 16 kHz, T60 0,7 s (Violine), 0,9 s (Bratsche) und
  1,3 s (Cello) für tiefe Teiltöne, kürzer nach oben. Danach derselbe Korpus wie beim Streichen.

## Saal

Ein eigenes Rückkopplungsnetz (Feedback Delay Network) mit acht Verzögerungsleitungen zwischen
31,7 und 73,7 ms und einer orthogonalen Hadamard-Mischmatrix, dazu fünf frühe Reflexionen pro Seite
zwischen 7 und 52 ms und 19 ms Vorverzögerung. Jede Leitung hat eine Verstärkung aus ihrer Länge,
sodass der Nachhall bei tiefen Frequenzen T60 = 2,1 s hat, und einen Tiefpass erster Ordnung,
dessen Pol so gelöst ist, dass die T60 bei 5 kHz 40 % davon beträgt (Luft und Publikum schlucken
die Höhen). Links und rechts lesen die Leitungen mit verschiedenen Vorzeichenmustern, das macht den
Nachhall breit. Bei `hall` > 0 wird die Note um 2,1 s verlängert, damit der Nachhall ausklingt.

## Pegel und Messwerte

Die Pegel unterscheiden sich stark über das Register: Im Mittelbereich spielen zwei Gruppen,
einzelne Töne treffen Korpusresonanzen. Eine Tabelle pro Preset und Halbton gleicht das aus. Sie
ist so gesetzt, dass der lauteste von sieben Seeds bei velocity 1, mit und ohne Saal, etwa bei
−4 dBFS liegt. Mit frischen Seeds kann eine Note darüber liegen:

Prüfung über jeden Halbton von 36 bis 96, velocity 0,2 und 1, `hall` 0, 0,35 und 1, drei frische
Seeds (darunter 10,25):

| Preset | lautester Fall | ungültige Werte | Gleichanteil (relativ) |
| --- | --- | --- | --- |
| `legato` | −2,6 dBFS | 0 | unter 10⁻⁷ |
| `staccato` | −3,0 dBFS | 0 | unter 2·10⁻⁶ |
| `tremolo` | −2,8 dBFS | 0 | unter 2·10⁻⁷ |
| `pizzicato` | −2,9 dBFS | 0 | unter 10⁻⁷ |

Kurze Noten sprechen in allen Lagen an. Spitzenpegel bei velocity 0,8 ohne Saal, über die Töne 36,
40, 48, 54, 60, 66, 72, 84 und 96:

| Preset | 0,05 s | 0,1 s | 0,15 s | 1 s |
| --- | --- | --- | --- | --- |
| `legato` | −11 bis −23 dBFS | −12 bis −20 dBFS | −10 bis −21 dBFS | −7 bis −15 dBFS |
| `tremolo` | −9 bis −19 dBFS | −9 bis −19 dBFS | −9 bis −13 dBFS | −7 bis −12 dBFS |
| `staccato` | −8 bis −17 dBFS | −6 bis −17 dBFS | −6 bis −17 dBFS | −6 bis −17 dBFS |

Noten ab etwa 0,8 s bekommen den vollen, langsamen Anstrich ohne zusätzlichen Akzent.
Eine Prüfung über jeden zweiten Halbton, alle Presets, velocity 0,2, 0,6 und 1, `hall` 0 und 1,
Dauern 0,05, 0,1, 0,2 und 2 s und zwei Seeds (5952 Noten) ergab höchstens −3,1 dBFS, keine
ungültigen Werte und exakte Nullen an beiden Enden.

Der größte Sprung von Sample zu Sample liegt bei 0,26, im Verhältnis zur Spitze so groß wie bei der
einzelnen Violine dieses Repos: Die Helmholtz-Bewegung hat eine scharfe Ecke.

Stimmung: Gemessen wird der leistungsgewichtete Mittelwert der Frequenz um einen Teilton nahe
400 Hz, 0,8 bis 3 s einer Legato-Note ohne Saal, Mittel über drei Seeds. Von 36 bis 93 liegt er
innerhalb von ±3,7 Cent, meist innerhalb von ±2 Cent, beim höchsten Ton 96 bei −6 Cent. Einzelne
Seeds weichen bis 6 Cent ab, denn zehn Stimmen mit je bis zu 9 Cent Verstimmung mitteln sich nie
ganz. Jede Note beginnt und endet bei exakt null, am Ende mit 60 ms Raised
Cosine nach dem Ausklingen des Saals.

## Grenzen

* Jede Note ist ein eigener Satz Spieler. Legato zwischen Noten (Lagenwechsel ohne Bogenwechsel)
  gibt es nur bei Violine und Cello über `renderPhrase`.
* Keine Kontrabässe.
* Der Saal ist ein künstlicher Nachhall ohne Geometrie.

## Quellen

* M. E. McIntyre, R. T. Schumacher, J. Woodhouse: On the oscillations of musical instruments.
  J. Acoust. Soc. Am. 74 (1983).
* J.-M. Jot, A. Chaigne: Digital delay networks for designing artificial reverberators.
  AES Convention 90 (1991).
* J. C. Schelleng: The bowed string and the player. J. Acoust. Soc. Am. 53 (1973).
* J. Meyer: Akustik und musikalische Aufführungspraxis. Bergkirchen, 5. Auflage 2004, für Sitzordnung und Abstrahlung.

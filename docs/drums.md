# Drums

Ein akustisch klingendes Schlagzeug aus Physik und Zufall, ohne Samples. Elf Stimmen:
`kick`, `snare`, `rim`, `hihatClosed`, `hihatOpen`, `ride`, `crash`, `tomLow`, `tomMid`, `tomHigh`, `shaker`.

```js
import { render } from './instruments/drums.mjs';
const hit = render({ voice: 'snare', velocity: 0.3, seed: 7 }); // Float64Array, mono, 48 kHz
```

`render` ist deterministisch: gleicher Seed, gleiche Samples. Andere Seeds verschieben Modenfrequenzen
um wenige Promille, Schlagposition, Kontaktzeit und Rauschen. Bei Fellen unterscheiden sich zwei Seeds
um etwa −2 bis −8 dB (Differenzenergie zur Signalenergie), es klingt also nach demselben Instrument,
aber nie nach Maschinengewehr. Jeder Schlag beginnt und endet bei exakt null und enthält das
vollständige Ausklingen bis etwa −75 dB.

Demo: `node demos/drums.mjs` schreibt `out/drums.wav` (Stereo, etwa 28 s, Rendern unter 5 s):
jede Stimme einzeln, dann ein Boom-Bap-Groove mit 85 BPM, 58 % Swing, Ghost Notes auf der Snare,
einem Tom-Fill und einem Crash zum Schluss. Ein geschlossenes Hi-Hat würgt ein offenes ab (Choke).

## Dateien

| Datei | Inhalt |
| --- | --- |
| `instruments/drums.mjs` | Stimmen, Pegel, Kalibrierung, `render` |
| `instruments/drums/membrane.mjs` | Kreismembran: Bessel-Nullstellen, Schlagposition, Spannungsglide |
| `instruments/drums/cymbal.mjs` | Becken als dichte inharmonische Modenwolke mit Energiefluss nach oben |
| `instruments/drums/shaker.mjs` | Stochastisches Teilchenmodell |
| `instruments/drums/dsp.mjs` | Biquads, Kontaktspektrum, Hertz-Kontaktzeit, Ränder |

## Gemeinsame Bausteine

**Kontaktkraft.** Schlägel und Stock berühren das Fell eine kurze Zeit `T`. Eine Halbsinus-Kraft dieser
Dauer hat ein Spektrum, das bis etwa `1/(2T)` flach ist und darüber mit `f^-2` fällt. Die exakten
Nullstellen des Halbsinus treten bei echten Stöcken nicht auf, weil die Kontaktfläche nicht punktförmig
ist. Deshalb wird nur die Hüllkurve `1 / (1 + (1.25 f T)^2)` benutzt. Typische Werte: Filzschlägel
2,1 ms, Stock auf Fell 0,55 bis 0,8 ms, Stockspitze auf Becken 0,1 bis 0,18 ms.

**Hertz-Kontakt.** Für zwei elastische Körper gilt `T ∝ v^(-1/5)`. Ein härterer Schlag ist also kürzer
und heller. Die Velocity wirkt deshalb auf Pegel und Klangfarbe zugleich, nicht nur auf die Lautstärke.

**Modale Synthese.** Jede Mode ist eine gedämpfte Sinusschwingung `a e^{-t/τ} sin(2π f t)`. Für Becken mit
Hunderten Moden läuft das über rotierende Zeiger (eine komplexe Multiplikation pro Mode und Sample, kein
`sin` pro Sample). Die Abklingzeit wird als T60 angegeben und hängt von der Frequenz ab.

**Ränder.** Der Einsatz wird über die halbe bis ganze Kontaktzeit (mindestens 4 Samples) mit
Raised-Cosine eingeblendet, das Ende nach dem Abschneiden bei −75 dB über höchstens 40 ms ausgeblendet.
Ein Hochpass entfernt Gleichanteile. Am Ausgang gibt es keine Sättigung.

## Felle: Kick, Snare, Toms

Ideale Kreismembran: Mode `(m, n)` schwingt mit `f_mn = f01 · j_mn / j_01`, wobei `j_mn` die n-te
Nullstelle der Besselfunktion `J_m` ist (1; 1,593; 2,136; 2,296; 2,653; 2,918; …). Die ersten Nullstellen
stehen als Tabelle im Code, höhere kommen aus der McMahon-Entwicklung.

* **Schlagposition** `ρ` (0 Mitte, 1 Rand): Amplitude ∝ `J_m(j_mn ρ) · sqrt(j_mn)`. Die Wurzel normiert
  die Modenform näherungsweise. Mitte regt fast nur `m = 0` an (Kick, `ρ ≈ 0,12`), ein Schlag weiter
  außen auch die Knotendurchmesser-Moden (Snare `ρ ≈ 0,33`, Toms `ρ ≈ 0,3`).
* **Abstrahlung:** Höhere Multipole strahlen unterhalb der Koinzidenz schlecht ab, deshalb fallende
  Gewichte für `m = 0, 1, 2, ≥3`. Achsensymmetrische Moden verlieren dafür schneller Energie durch
  Abstrahlung und klingen kürzer aus (Faktor 0,6 bis 0,7 auf T60).
* **Luftlast:** Die mitschwingende Luft senkt vor allem die tiefen Moden (`ratio / (1 + k/ratio)`), die
  eingeschlossene Luft im Kessel versteift die achsensymmetrischen Moden leicht. Beides gibt die
  bekannte Abweichung echter Trommeln von den idealen Besselverhältnissen in der Tendenz wieder.
* **Spannungsmodulation:** Große Auslenkung dehnt das Fell und erhöht die Spannung. Die Phase aller Moden
  folgt `Φ(t) = t + G τ (1 − e^{-t/τ})`, die Tonhöhe fällt also nach dem Anschlag exponentiell zurück.
  `G ∝ velocity²` (Kick 11 %, Toms 7 %, Snare 4 %).
* **Obere Modenregion:** Oberhalb einiger Kilohertz liegen die Moden so dicht und sind so stark
  gedämpft, dass sie während des Kontakts wie bandbegrenztes Rauschen wirken. Das ist der „Slap“ von
  Kick und Toms: Rauschen unter der Kontakthüllkurve mit wenigen Millisekunden Nachklang, Bandpass bei
  2,4 bis 2,6 kHz. Er macht die Kick auf Laptop-Lautsprechern hörbar.

**Kick:** Grundton 57 Hz, Moden bis zum 22-fachen, Grundmode T60 0,55 s (gedämpftes Fell), höhere Moden
deutlich kürzer. Hochpass bei 42 Hz, damit Anteile unter 45 Hz nicht dominieren (Messung: Band
20 bis 45 Hz rund 16 dB unter dem Band 45 bis 120 Hz).

**Toms:** 84, 112 und 150 Hz. Das Resonanzfell ist etwa 3,5 % höher gestimmt und wird nur über die
Kesselluft angeregt. Im Modell heißt das `ρ = 0`, wodurch nur achsensymmetrische Moden entstehen. Die
leichte Verstimmung der beiden Felle ergibt die typische Schwebung im Ausklang.

**Snare:** Schlagfell 208 Hz, Moden bis 16-fach. Die Teppichspiralen sind keine eigene Rauschspur. Das
Resonanzfell folgt dem Schlagfell über die eingeschlossene Luft, vor allem in den Moden mit `m ≤ 1`.
Die Spiralen schlagen, sobald die Fellgeschwindigkeit über einer Schwelle liegt, ab der sie dem Fell
nicht mehr folgen. Treiber ist `max(0, |v| − θ)`, mit 0,4 ms Anstieg und 30 ms Abfall geglättet. Damit
wird weißes Rauschen moduliert und auf das Band der Spiralen gefiltert (Hochpass 1,4 kHz, Anhebung um
3,6 kHz, Tiefpass je nach Velocity 4 bis 6,4 kHz). Ein leiser Schlag überschreitet die Schwelle nur kurz:
Ghost Notes haben einen kürzeren, dunkleren Teppich (Schwerpunkt 0,8 kHz bei Velocity 0,2 statt 2,4 kHz
bei 1,0).

**Rim (Cross-Stick):** Der Stock liegt auf dem Fell und schlägt auf den Spannreifen. Klang aus den
Biegemoden eines frei-frei gelagerten Stabs (Verhältnisse 1; 2,756; 5,404; 8,933; 13,34) mit etwa
410 Hz Grundton, der für einen Hickory-Stock von 40 cm Länge und 15 mm Durchmesser aus
`f1 = 22,37/(2π L²) · sqrt(E I / ρ A)` folgt. Dazu kommen 30 kurze Moden für Reifen und Kessel
zwischen 0,65 und 3,4 kHz sowie ein schwach angeregtes Snarefell mit Teppich.

## Becken: Hi-Hat, Ride, Crash

Für eine dünne Platte ist die Modendichte der Biegewellen etwa konstant über der Frequenz. Die
Modenfrequenzen werden deshalb gleichmäßig mit Zufallsversatz zwischen etwa 300 Hz und 14 kHz verteilt
(Hi-Hat 260 und 340 Moden, Ride 420 plus vier tiefe „Ping“-Moden, Crash 620). Die Amplituden haben ein
breites Spektralprofil und zufällige Vorzeichen, die Abklingzeit fällt mit der Frequenz
(`T60 ∝ f^-0.3` bis `f^-0.4`).

**Energiefluss nach oben.** Becken sind stark nichtlinear (von-Kármán-Kopplung zwischen Biegung und
Dehnung). Der Stock regt vor allem tiefe Moden an, die Kopplung pumpt Energie danach innerhalb von
Zehntelsekunden in höhere Moden. Die Hüllkurve jeder Mode ist deshalb

`e^{-t/τ_d} · ( W(f) + B(f) · (1 − e^{-t/τ_b}) )`

`W` ist die direkte Anregung durch das Kontaktspektrum. `B` ist der nachgelieferte Anteil, er läuft nicht
durch das Kontaktfilter und wächst mit der Velocity. `τ_b` steigt mit der Frequenz und sinkt bei harten
Schlägen. Gemessen steigt der spektrale Schwerpunkt des Crash in den ersten 80 ms von 3,4 auf 4,2 kHz,
beim Ride von 4,1 auf 4,7 kHz. Leise Schläge bleiben dunkler (Crash bei Velocity 0,2 etwa 3,4 statt
4,3 kHz). Beide Terme laufen als zwei rotierende Zeiger pro Mode.

**Hi-Hat geschlossen:** Die aufeinandergepressten Teller dämpfen stark, T60 rund 0,1 s.
**Hi-Hat offen:** T60 bis 1,6 s. Die lose aufeinanderliegenden Teller klappern gegeneinander. Das ergibt
eine langsame, zufällige Amplitudenmodulation, die in den ersten 0,4 s abklingt.

Gegen Schärfe: Tiefpass bei 12 bis 12,5 kHz und ein Höhenregal von −2 dB. Die Becken sind bewusst
dunkler als die Referenz (Schwerpunkt Hi-Hat etwa 5 kHz statt 11 kHz).

## Shaker

Teilchenmodell: 48 Kugeln in einer Hülle. Ein Handstoß führt kinetische Energie `E(t)` zu (Gauß-Puls um
12 ms). Die Stoßrate ist proportional zu Kugelzahl und Kugelgeschwindigkeit, also zu `sqrt(E)`. Jeder
Stoß kostet einen zufälligen Bruchteil der Energie und erzeugt einen Klick von 2 bis 4 Samples mit
zufälliger Stärke. Die Klicks regen drei Resonanzen der Hülle an (etwa 3,2; 5,1 und 7,3 kHz, niedrige
Güte). Das Prinzip folgt der Idee stochastischer Teilchenmodelle (Cook 1997). Der Code ist eigenständig
geschrieben.

## Pegel und Kalibrierung

Jede Stimme wird einmal bei Velocity 1 und Seed 1 berechnet und auf einen festen Zielpegel skaliert
(Kick 0,85, Snare 0,78, Toms 0,64 bis 0,68, Becken 0,28 bis 0,4, Shaker 0,2), danach mit einem festen
Ausgangsfaktor von 0,44. Darunter bleibt das
Verhalten linear in der Velocity, plus die Klangfarbenänderung durch Kontaktzeit, Glide, Teppichschwelle
und Becken-Nichtlinearität. Andere Seeds liegen bis zu etwa 6 dB über Seed 1. Mit dem Ausgangsfaktor erreichen Einzelschläge bei
Velocity 1 über 300 Seeds höchstens etwa −3 dBFS, ein typischer Kick liegt bei etwa −8 dBFS.

## Messungen

Referenz: FluidR3_GM über FluidSynth, GM-Noten 36, 38, 37, 42, 46, 51, 49, 41, 45, 48, 70. Die Referenz
liegt nur lokal in `reference/` und gehört nicht ins Repository. Spektraler Schwerpunkt der ersten 80 ms:

| Stimme | Referenz | Modell (Velocity 0,8) |
| --- | --- | --- |
| Kick | 72 Hz | 92 Hz (mehr Klick im Bereich 2 bis 6 kHz) |
| Snare | 1,2 kHz | 2,1 kHz |
| Rim | 4,3 kHz | 1,5 kHz (holziger) |
| Hi-Hat zu / offen | 11,0 / 8,0 kHz | 4,9 / 5,8 kHz |
| Ride / Crash | 8,5 / 3,8 kHz | 4,2 / 4,2 kHz |
| Toms | 120 bis 180 Hz | 160 bis 230 Hz |
| Shaker | 9,7 kHz | 5,1 kHz |

Die Abklingzeiten der Referenz sind länger, weil FluidSynth Hall hinzufügt. Das Modell ist trocken.

Demo `out/drums.wav`: Spitze −3,0 dBFS, integrierte Lautheit −24,7 LUFS (Schlagzeug allein hat einen
hohen Crestfaktor), größter Sprung zwischen zwei Samples 0,27 bei einer Spitze von 0,71. Das ist der
steile, aber stetige Einsatz von Snare und Becken. Keine NaN, keine Gleichanteilsprünge, alle Schläge
beginnen und enden bei null.

## Bekannte Schwächen

* Die Becken sind phänomenologisch: Die Modenfrequenzen sind zufällig verteilt, nicht aus der
  Geometrie eines echten Beckens berechnet, und der Energiefluss nach oben ist als Hüllkurve modelliert,
  nicht als gekoppelte nichtlineare Differentialgleichung.
* Keine Rückwirkung des Teppichs auf das Fell und kein Mitschwingen der übrigen Trommeln (Snare-Teppich
  bei Tomschlägen).
* Kein Raum. Für Mischungen empfiehlt sich ein kurzer Hall außerhalb des Instruments.

## Quellen

* N. H. Fletcher, T. D. Rossing: *The Physics of Musical Instruments*, 2. Aufl., Springer 1998,
  Kap. 3 (Membranen und Platten), Kap. 18 (Trommeln), Kap. 20 (Becken und Gongs).
* T. D. Rossing: *Science of Percussion Instruments*, World Scientific 2000.
* M. Abramowitz, I. A. Stegun: *Handbook of Mathematical Functions*, 1964, Tabelle 9.5 (Nullstellen
  von `J_m`) und 9.5.12 (McMahon-Entwicklung).
* K. L. Johnson: *Contact Mechanics*, Cambridge University Press 1985 (Hertz-Kontakt, `T ∝ v^-1/5`).
* A. Chaigne, C. Touzé, O. Thomas: „Nonlinear vibrations and chaos in gongs and cymbals“,
  *Acoustical Science and Technology* 26(5), 2005.
* P. R. Cook: „Physically Informed Sonic Modeling (PhISM): Synthesis of Percussive Sounds“,
  *Computer Music Journal* 21(3), 1997 (nur als Idee, kein Code übernommen).
* R. Bristow-Johnson: „Cookbook formulae for audio EQ biquad filter coefficients“ (Formeln für die
  Biquads, Code eigenständig geschrieben).

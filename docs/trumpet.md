# Trompete

Physikalisches Modell einer B-Trompete, komplett aus Gleichungen berechnet. Es gibt keine Samples,
keine gemessenen Impulsantworten und keine Soundfont-Daten. Der Code ist selbst geschrieben, keine
Zeile ist aus einer Bibliothek oder einem Paper-Code übernommen. Aus der Literatur stammen nur
physikalische Gesetze und veröffentlichte Messwerte (siehe Quellen).

Dateien:

- `instruments/trumpet.mjs`: das Instrument (`meta`, `render`)
- `instruments/trumpet/bore.mjs`: Griffwahl und nichtlineare Ausbreitung in der Bohrung
- `instruments/trumpet/dsp.mjs`: Filter, Verzögerungsleitung, Dezimierung
- `instruments/trumpet/tuning.mjs`: gemessene Stimmkorrektur (erzeugt)
- `instruments/trumpet/calibrate.mjs`: misst die Stimmung und schreibt `tuning.mjs`
- `instruments/trumpet/room.mjs`: kleiner Hall für die Demo (Feedback-Delay-Netz)
- `demos/trumpet.mjs`: Jazzballade, schreibt `out/trumpet.wav`

## Aufbau des Modells

Das Modell hat drei gekoppelte Teile: die Lippen als schwingendes Ventil, die Luftsäule als
Wellenleiter und den Schalltrichter als frequenzabhängigen Reflektor und Abstrahler. Gerechnet wird
mit doppelter Abtastrate (96 kHz), am Ende filtert ein Fensterfilter (Blackman, 96 Taps) auf 48 kHz
herunter. Der Grund steht unten bei den Stoßwellen.

### Lippen: nach außen schlagendes Ventil

Die Lippen sind ein gedämpfter Feder-Masse-Schwinger. Der Mundraumdruck `p_m` drückt sie auf, der
Druck im Mundstück `p` drückt sie zu:

```
y'' + (ω_l / Q_l) y' + ω_l² y = (p_m − p) / μ
```

`y` ist die Öffnung in Metern, `μ` die Masse pro Fläche, `Q_l` die Güte. In Ruhe sind die Lippen
geschlossen, erst der Blasdruck öffnet sie. Ein solches Ventil („outward striking“ nach Fletcher)
schwingt nur oberhalb seiner eigenen Resonanz, deshalb liegt die Lippenfrequenz bei 0,88 des
gespielten Tons. Welche Resonanz der Bohrung einrastet, entscheidet also die Lippenspannung, genau
wie beim Spieler.

Die Masse pro Fläche fällt mit dem Quadrat der Tonhöhe (`μ = 3 · (262 Hz / f)²` kg/m²). Bei hohen
Tönen schwingt weniger Lippengewebe mit, und ohne diese Abnahme würden die Lippen bei hohen Tönen zu
steif und sprächen nicht an.

Der Luftstrom folgt Bernoulli durch einen Spalt der Breite 9 mm:

```
u = b · max(y, 0) · sign(Δp) · sqrt(2 |Δp| / ρ),   Δp = p_m − p
```

Weil `p` selbst vom Strom abhängt (`p = 2 p⁻ + Z_c u`), ist das eine implizite Gleichung. Sie hat
eine geschlossene Lösung (quadratische Gleichung in `u`), die numerisch stabil als
`u = 2 k a / (k Z_c + sqrt(k² Z_c² + 4 |a|))` mit `a = p_m − 2 p⁻` und `k = b y sqrt(2/ρ)`
berechnet wird. Es gibt also keine Iteration und keinen Verzögerungstrick zwischen Lippe und Rohr.

### Bohrung: Wellenleiter mit harmonischen Resonanzen

Die Luftsäule ist eine Verzögerungsleitung für die hinlaufende und die rücklaufende Druckwelle.
`Z_c = ρ c / S` gehört zu einem Rohr mit 5,8 mm Radius (Ventilteil einer Trompete).

Ein reiner Zylinder, an den Lippen geschlossen und am Ende offen, hätte nur ungerade Resonanzen
(1, 3, 5, …). Bei der echten Trompete ziehen Mundstück und Schalltrichter diese Reihe auf fast
harmonische Resonanzen bei 2, 3, 4, 5, 6 … mal der Pedalfrequenz zusammen (Benade, Campbell). Das
Modell bildet dieses Ergebnis direkt ab: Die Schleife aus Hinweg, Reflexion und Rückweg hat die
Laufzeit `n / f` und keine Vorzeichenumkehr, die Resonanzen liegen damit bei Vielfachen von
`F = f / n`. Ein Hochpass bei `F/2` in der Schleife schwächt die Pedalresonanz und entfernt den
Gleichanteil. Gemessen an einer Impulsantwort des Rohrs liegen die Spitzen der Eingangsimpedanz bei
dem 15- bis 20-fachen von `Z_c`, also um 60 bis 75 MPa·s/m³, in der Größenordnung gemessener
Trompeten. Die Phasen von Tief- und Hochpass verschieben die Nachbarresonanzen etwas: tiefe Moden
liegen bis 25 Cent höher, hohe bis 6 Cent tiefer als das exakte Vielfache. Echte Trompeten zeigen
ähnliche Abweichungen.

Griffe: Die offene Trompete hat die Naturtonreihe über B2 (116,5 Hz). Die Ventile verlängern das
Rohr um 0 bis 6 Halbtöne. `fingering()` wählt den Naturton, der die wenigsten Halbtöne Ventilrohr
braucht, so wie es die Standardgriffe tun. Daraus folgt `n` und die Schleifenlänge.

### Schalltrichter: Reflexion tief, Abstrahlung hoch

Am Schallstück wird die Welle reflektiert, aber nur unterhalb der Trichter-Grenzfrequenz. Die
Reflexion ist deshalb ein Tiefpass zweiter Ordnung bei 1,4 kHz mit Verlustfaktor 0,93 (Wandreibung
und Abstrahlung). Was nicht reflektiert wird, verlässt das Instrument: Die Abstrahlung ist der
komplementäre Hochpass, also das Signal am Trichter minus dem reflektierten Anteil. Daher kommt die
typische Färbung, schwacher Grundton im Raum, starke Obertöne zwischen 1 und 3 kHz.

### Stoßwellen: warum laute Trompeten schmettern

Bei hohem Pegel ist die Schallgeschwindigkeit nicht mehr konstant. Druckspitzen laufen schneller
als Druckmulden:

```
c(p) ≈ c · (1 + (γ + 1) / 2 · p / (ρ c²)),   γ = 1,4
```

Auf dem Weg durch das enge Rohr holt die Front jeder Periode deshalb auf, sie wird steiler und kann
zu einer Stoßwelle werden. Hirschberg und Kollegen haben solche Stöße in Posaunen gemessen. Sie sind
der Grund, warum das Spektrum bei Lautstärke so stark nach oben wächst und nicht nur lauter wird.

Umsetzung in `NonlinearSlice`: Der Hinweg ist in 8 Scheiben aufgeteilt, zusammen 0,7 m wirksame
Länge. Jede Eingangsprobe bekommt eine eigene Ankunftszeit, früher bei Überdruck, später bei
Unterdruck, verschoben um `β · p` mit `β = L · 1,2 / (ρ c³)` pro Scheibe. Die Ausgabe wird an
ganzzahligen Zeitpunkten zwischen diesen ungleichmäßig liegenden Proben interpoliert. Die
Ankunftszeiten bleiben streng steigend. Wo sich die Welle überschlagen würde, rücken die Proben
dicht zusammen, und genau das ist die Stoßfront. Den mittleren Druck zieht jede Scheibe ab, denn
der Gleichdruck aus dem Blasen darf die Laufzeit nicht ändern, sonst verstimmt sich das Rohr.

Eine Stoßfront hat Anteile weit über 24 kHz. Bei 48 kHz falten sie zurück und ergeben ein
unharmonisches Rauschen um −50 dB. Mit doppelter Abtastrate und Dezimierfilter liegt dieser Boden
bei etwa −75 dB.

Die Kopplung wirkt in beide Richtungen: Der steilere Puls am Trichter wird teilweise reflektiert,
trifft wieder auf die Lippen und ändert ihre Bewegung. Das ist kein nachgeschalteter Effekt.

### Anstoß, Atem, Vibrato, Bindungen

- **Zunge:** Hinter der Zunge baut sich Druck auf. Beim Lösen sind die Lippen schon aufgedrückt,
  das Modell startet sie deshalb mit einer Auslenkung von 1,5 mal der statischen Öffnung, und der
  Mundraumdruck schießt in den ersten 25 ms um bis zu 50 % über. `tongue` regelt das stufenlos
  vom harten „t“ (1) bis zum Atemanstoß (0). Harte Anstöße schwingen in 10 bis 50 ms ein, Atemanstöße
  in 30 bis 140 ms.
- **Atemgeräusch:** Turbulenz im Lippenstrahl als Schwankung des Volumenstroms, proportional zum
  Strom selbst, bandbegrenzt zwischen 400 Hz und 4 kHz. Das Rauschen läuft durch das Rohr und wird
  von dessen Resonanzen gefärbt.
- **Vibrato:** Lippenvibrato. Die Lippenspannung schwankt mit etwa 5 Hz, die Tonhöhe folgt nur
  so weit, wie das Rohr sie lässt (gemessen etwa +20/−11 Cent bei Tiefe 1). Die Schwankung ist
  asymmetrisch, weil die Lippen nichtlinear an der Rohrresonanz ziehen.
- **Scoop und Fall:** Rohrlänge und Lippenfrequenz werden gemeinsam gleitend verstellt, wie bei
  einem halb gedrückten Ventil. Beim Fall sinkt gleichzeitig der Blasdruck.
- **Dämpfer (`mute: 'cup'`):** Filter auf der Abstrahlung, die einen Cup-Dämpfer nachbilden: Kerbe
  bei 250 Hz, Anhebung bei 1,5 kHz, Tiefpass bei 3,2 kHz. Das ist die einzige rein
  signaltechnische Stufe, der Dämpfer ist nicht physikalisch modelliert.

### Blasdruck und Dynamik

`p_m = (800 Pa + 15 kPa · v^2,2) · (1 + 0,03 · (midi − 60))`. Das reicht von 0,6 kPa (leisester
tiefster Ton) bis 28 kPa (lautester höchster Ton). Fletcher und Tarnopolsky haben an Trompetern
Blasdrücke bis in diesen Bereich gemessen, steigend mit Tonhöhe und Lautstärke. `velocity` kann auch ein Paar `[start, ende]` sein, dann ändert sich der
Druck über die Note (Crescendo, Diminuendo).

### Stimmung

Das gekoppelte System spielt etwas höher als die Rohrresonanz, weil die Lippen die Frequenz zu sich
ziehen: zwischen 12 und 46 Cent, mehr bei hohem Druck. `calibrate.mjs` misst das für jeden Ton im
Umfang und sieben Lautstärken (FFT über 0,7 s, logarithmisch-parabolische Spitzeninterpolation) und
schreibt die Tabelle `tuning.mjs`. Beim Rendern werden Rohrlänge und Lippenfrequenz gemeinsam um
diesen Wert verschoben, auch während eines Crescendos. Ein zweiter Durchlauf misst den Rest und
addiert ihn. Wer Parameter am Modell ändert, muss danach zweimal
`node instruments/trumpet/calibrate.mjs` aufrufen.

## Schnittstelle

```js
import { render, meta } from './instruments/trumpet.mjs';
// meta = { name: 'Trumpet', range: [52, 86] }  (E3 bis D6, klingend)
render({
  midi: 70,              // Standard 60, wird auf meta.range begrenzt
  velocity: 0.8,         // 0..1 oder [start, ende]
  duration: 1,           // Sekunden bis zum Absetzen, Ausklang kommt dazu
  seed: 1,               // Zufallsdrift von Druck und Lippe, deterministisch
  vibrato: undefined,    // undefined: automatisch bei langen Noten, 0: aus, Zahl: Tiefe
  scoop: 0, fall: 0,     // Halbtöne, scoop 0 bis 3, fall 0 bis 12
  mute: null,            // oder 'cup'
  tongue: true,          // true, 0..1 oder false
}); // Float64Array, mono, 48 kHz
```

Werte außerhalb der Bereiche werden begrenzt, `duration` auf mindestens 0,02 s. Ist eine Zahl nicht
endlich (etwa `NaN`) oder `mute` weder `null` noch `'cup'`, wirft `render` einen Fehler mit dem
Namen des Parameters.

Pegel: Der Ausgangsfaktor sitzt hinter der Rückkopplung und ändert deshalb die Stimmung nicht. Er ist
so gewählt, dass der lauteste Fall im ganzen Bereich (Velocity 1, `scoop: 3`) um −3 dBFS liegt.
Ohne Scoop liegt die Spitze bei Velocity 1 etwa 1 dB tiefer.

Jede Note beginnt und endet exakt bei null (0,5 ms Einblendung nach dem Dezimierfilter, 5 ms
Ausblendung am Ende). Rechenzeit etwa 0,05 s pro Sekunde Ton, die ganze Demo braucht gut 1 s.

## Messungen

Referenz zum Vergleich: General-MIDI-Trompete (Programm 57) aus einer freien Soundfont.

Spektraler Schwerpunkt im eingeschwungenen Ton:

| Ton | Referenz leise / laut | Modell v 0,25 / v 1 |
|-----|-----------------------|---------------------|
| G3  | 935 / 1068 Hz         | 359 / 1001 Hz       |
| C4  | 1165 / 1460 Hz        | 495 / 1534 Hz       |
| G4  | 1177 / 1554 Hz        | 694 / 1606 Hz       |
| D5  | 1351 / 1785 Hz        | 901 / 1582 Hz       |
| A5  | 1587 / 2060 Hz        | 1142 / 1692 Hz      |

Die Referenz ist ein einzelnes Sample mit Velocity-Filter, ihr Schwerpunkt steigt nur um den Faktor
1,1 bis 1,3. Im Modell steigt er bei G4 von 620 Hz (v 0,1) auf 1600 Hz (v 1), bei C4 um den Faktor 3.
Ab etwa v 0,7 bildet sich am Trichter eine Stoßfront, die Obertöne 8 bis 16 liegen dann nur noch 13
bis 19 dB unter dem Grundton. Dieser Sprung ist das Schmettern echter Blechbläser.

Stimmung: Über alle 35 Töne, vier Lautstärken und zwei Seeds liegt die größte Abweichung bei 2,3 Cent.
Alle 560 Prüfnoten (35 Töne, vier Lautstärken, mit und ohne Zunge, mit und ohne Dämpfer) sprechen an.

Demo (`out/trumpet.wav`, 28 s, Stereo mit Hall): Spitze −3,0 dBFS, −17,7 LUFS integriert,
Lautheitsumfang 17 LU, größter Sprung zwischen zwei Proben 0,47. Dieser Sprung sitzt an den
Stoßfronten der lautesten Stelle und ist Teil der Wellenform, kein Knacken.

## Grenzen

- Leise tiefe Töne sind sehr dunkel (G3 bei v 0,25 hat einen Schwerpunkt von 360 Hz). Ob echte
  Trompeten im Piano so weich klingen, lässt sich ohne Aufnahme nicht sicher prüfen.
- Das Mundstück ist nicht eigens modelliert. Seine Helmholtz-Resonanz um 800 Hz, die echte
  Impedanzspitzen in diesem Bereich anhebt, fehlt.
- Jede Note wird einzeln gerendert. Gebundene Töne mit durchgehendem Luftstrom und echtem
  Ventilwechsel gibt es noch nicht, Legato entsteht über weiche Anstöße.
- Die Abweichungen der Rohrresonanzen von der harmonischen Reihe ergeben sich nur aus den Filtern
  und sind nicht an eine gemessene Trompete angepasst (bei echten Instrumenten ist etwa der
  5. Naturton deutlich zu tief).
- Der Cup-Dämpfer ist nur ein Filter.

## Quellen

Physikalische Grundlagen und Messwerte, keine Code-Übernahme:

- A. H. Benade: *Fundamentals of Musical Acoustics*. Oxford University Press, 1976. Kapitel zu
  Blechblasinstrumenten, Resonanzen und Schalltrichter.
- N. H. Fletcher, T. D. Rossing: *The Physics of Musical Instruments*, 2. Aufl., Springer, 1998,
  Kapitel 8 und 14.
- N. H. Fletcher: Autonomous vibration of simple pressure-controlled valves in gas flows. J. Acoust.
  Soc. Am. 93(4), 2172-2180, 1993.
- S. J. Elliott, J. M. Bowsher: Regeneration in brass wind instruments. J. Sound Vib. 83(2),
  181-217, 1982.
- S. Adachi, M. Sato: Trumpet sound simulation using a two-dimensional lip vibration model.
  J. Acoust. Soc. Am. 99(2), 1200-1209, 1996.
- J. Cullen, J. Gilbert, D. M. Campbell: Brass instruments: linear stability analysis and
  experiments with an artificial mouth. Acta Acustica 86, 704-724, 2000.
- A. Hirschberg, J. Gilbert, R. Msallam, A. P. J. Wijnands: Shock waves in trombones. J. Acoust.
  Soc. Am. 99(3), 1754-1758, 1996.
- R. Msallam, S. Dequidt, R. Caussé, S. Tassart: Physical model of the trombone including nonlinear
  effects. Acta Acustica 86, 725-736, 2000.
- D. M. Campbell: Nonlinear dynamics of musical reed and brass wind instruments. Contemporary
  Physics 40(6), 415-431, 1999.
- N. H. Fletcher, A. Tarnopolsky: Blowing pressure, power, and spectrum in trumpet playing.
  J. Acoust. Soc. Am. 105(2), 874-881, 1999.
- M. F. Hamilton, D. T. Blackstock (Hrsg.): *Nonlinear Acoustics*. Academic Press, 1998
  (Ausbreitungsgeschwindigkeit bei endlicher Amplitude).
- J. O. Smith: Physical modeling using digital waveguides. Computer Music Journal 16(4), 74-91, 1992.
- J.-M. Jot, A. Chaigne: Digital delay networks for designing artificial reverberators. 90. AES
  Convention, 1991 (Prinzip des Hall-Netzes in `room.mjs`).

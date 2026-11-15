# Tuba und Euphonium

Physikalisches Modell eines tiefen Blechblasinstruments mit weiter, konischer Bohrung, komplett aus
Gleichungen berechnet. Zwei Presets: eine B-Tuba (`tuba`) und ein Euphonium in B (`euphonium`). Es
gibt keine Samples, keine gemessenen Impulsantworten und keine Soundfont-Daten. Der Aufbau folgt dem
Trompetenmodell (siehe `trumpet.md`): Lippen als schwingendes Ventil, Luftsäule als Wellenleiter,
Schalltrichter als frequenzabhängiger Reflektor. Die Unterschiede liegen in den Abmessungen, im
Blasdruck, in der viel schwächeren Aufsteilung der Wellen und im dunkleren Trichter.

Dateien:

- `instruments/tuba.mjs`: das Instrument (`meta`, `render`)
- `instruments/tuba/bore.mjs`: Daten der Presets, Griffwahl, Faltung in den Tonumfang
- `instruments/tuba/tuning.mjs`: gemessene Stimmkorrektur (erzeugt)
- `instruments/tuba/calibrate.mjs`: misst die Stimmung und schreibt `tuning.mjs`
- `demos/tuba.mjs`: acht Takte in B-Dur, Tuba im Bass, Euphonium in der Melodie, schreibt `out/tuba.wav`

Filter, Verzögerungsleitung, Dezimierfilter und die nichtlineare Rohrscheibe kommen aus dem
Trompetenmodell, der Hall der Demo ebenfalls.

## Aufbau des Modells

Gerechnet wird mit 96 kHz, am Ende filtert ein Fensterfilter (Blackman, 96 Taps) auf 48 kHz herunter.
Die einzige starke Nichtlinearität, der Bernoulli-Strom durch den Lippenspalt und die
amplitudenabhängige Laufzeit im Rohr, erzeugt so keine hörbaren Spiegelfrequenzen.

### Lippen

Die Lippen sind ein gedämpfter Feder-Masse-Schwinger, der nach außen aufschlägt (Fletcher 1993):

```
y'' + (ω_l / Q_l) y' + ω_l² y = (p_m − p) / μ
```

`p_m` ist der Mundraumdruck, `p` der Druck im Mundstück, `y` die Öffnung. Die Lippenresonanz liegt
bei 0,88 des gespielten Tons, denn ein nach außen schlagendes Ventil schwingt oberhalb seiner
eigenen Resonanz. Die Steifigkeit pro Fläche `K = μ ω_l²` ist über den ganzen Umfang konstant
(Tuba 3,0 MPa/m, Euphonium 3,6 MPa/m), die schwingende Masse wächst also nach unten mit `1/f²`.
Die Lippe einer Tuba ist groß und weich, ihre Güte ist mit `Q_l = 5` etwas kleiner als bei der
Trompete.

Der Strom durch den Spalt folgt Bernoulli, `u = b · y · sign(Δp) · sqrt(2 |Δp| / ρ)`, mit der
Spaltbreite `b` = 20 mm (Tuba) beziehungsweise 16 mm (Euphonium). Zusammen mit `p = 2 p⁻ + Z_c u`
ist das eine quadratische Gleichung in `u`, die geschlossen gelöst wird, ohne Iteration.

### Bohrung, Ventile und Naturtöne

Die Luftsäule ist eine Verzögerungsleitung mit Hinweg und Rückweg. Der Wellenwiderstand
`Z_c = ρ c / (π r²)` gehört zum Ventilteil: Radius 9,5 mm bei der Tuba, 7,5 mm beim Euphonium. Eine
weite Bohrung hat einen kleinen Wellenwiderstand, derselbe Luftstrom erzeugt darin weniger Druck.

Wie bei der Trompete bildet das Modell das Ergebnis der konischen Bohrung mit Mundstück und Trichter
direkt ab: Die Resonanzen liegen fast harmonisch bei Vielfachen der Pedalfrequenz `F` (Benade 1976).
Die Schleife hat die Laufzeit `n / f`, `n` ist der gespielte Naturton. Ein Hochpass bei `F / 2` in
der Schleife schwächt die Pedalresonanz und hält Gleichanteil aus dem Rohr.

Beide Instrumente stehen in B und haben vier Ventile, die das Rohr um 0 bis 11 Halbtöne verlängern:

| Preset    | Pedalton     | Rohrlänge etwa | Tonumfang (klingend) |
|-----------|--------------|----------------|----------------------|
| tuba      | B0 (29 Hz)   | 5,5 m          | D1 bis F4 (MIDI 26 bis 65) |
| euphonium | B1 (58 Hz)   | 2,7 m          | H1 bis C5 (MIDI 35 bis 72) |

Die Griffwahl nimmt den Naturton (2, 3, 4, 5, 6, 8, 9, 10 oder 12), der die wenigsten Halbtöne
Ventilrohr braucht. Den 7. Naturton lässt sie aus, er liegt bei echten Instrumenten stark zu tief.
Die tiefsten Töne beider Presets brauchen das vierte Ventil: D1 auf der Tuba ist der 2. Naturton mit
8 Halbtönen Ventilrohr, H1 auf dem Euphonium der 2. Naturton mit 11 Halbtönen.

`meta.range` ist die Vereinigung beider Umfänge (MIDI 26 bis 72). Den Umfang je Preset nennt
`meta.ranges`: `{ tuba: [26, 65], euphonium: [35, 72] }`. Eine Oberfläche zeigt daraus die
spielbaren Tasten des gewählten Presets. Ein Ton außerhalb davon wird als Rückfallebene um ganze
Oktaven hineingeschoben: Die Tuba spielt ein verlangtes C5 als C4, das Euphonium ein verlangtes D1
als D2. So bleibt der Tonname erhalten, statt dass am Rand immer derselbe Ton erklingt.

### Schalltrichter: dunkler als bei der Trompete

Der Trichter reflektiert tiefe Frequenzen und strahlt hohe ab. Die Reflexion ist ein Tiefpass zweiter
Ordnung (Güte 0,6) mit Verlustfaktor 0,9 (Tuba) beziehungsweise 0,91 (Euphonium), die Abstrahlung
ist der komplementäre Anteil, also das Signal am Trichter minus der Reflexion. Ein großer Trichter
hat eine tiefe Grenzfrequenz: 480 Hz bei der Tuba, 720 Hz beim Euphonium, gegenüber 1,4 kHz bei der
Trompete. Darüber verlässt der Schall das Rohr, die oberen Teiltöne bauen sich deshalb kaum auf.

Der komplementäre Hochpass steigt unterhalb der Grenzfrequenz nur mit 6 dB pro Oktave. Auf
Grundtönen um 40 Hz wäre die Tuba damit fast stumm, obwohl gerade dort ihr Fundament liegt. Zwei
Vereinfachungen halten den Grundton hörbar:

- Ein kleiner Teil des reflektierten Anteils (12 % bei der Tuba, 10 % beim Euphonium) wird ebenfalls
  abgestrahlt. Das steht für den Schall, den Wand und Trichtermündung auch unterhalb der Grenzfrequenz
  abgeben.
- Ein Pegelausgleich über den Umfang, `(f_oben / f)^0,4`, sitzt hinter der Rückkopplung und ändert
  weder Klangfarbe noch Stimmung. Ohne ihn lägen die tiefsten Töne bei Velocity 1 rund 13 dB unter
  den höchsten, mit ihm sind es etwa 5 dB. Echte Spieler geben tiefen Tönen sehr viel mehr Luft.

Am Ausgang sitzen zwei Hochpässe erster Ordnung bei 14 Hz (zusammen etwa 1,5 dB Abschwächung bei
D1) gegen Gleichanteil und Unterschall aus dem Druckaufbau beim Anstoß, dazu ein Tiefpass bei 9 kHz.

### Schwache Aufsteilung

Die Ausbreitung im engen Teil des Rohrs ist nichtlinear wie bei der Trompete:
`c(p) ≈ c · (1 + (γ + 1) / 2 · p / (ρ c²))`, Druckspitzen laufen schneller als Mulden (Hirschberg
1996). Umgesetzt in 8 Scheiben mit eigener Ankunftszeit jeder Probe. Die wirksame Länge ist mit
1,2 m (Tuba) und 1,0 m (Euphonium) sogar länger als bei der Trompete. Weil die weite Bohrung bei viel
kleinerem Blasdruck aber nur einen Bruchteil des Drucks im Rohr aufbaut, bleibt die Aufsteilung
schwach. Gemessen am spektralen Schwerpunkt bei Velocity 1:

| Ton | ohne Aufsteilung | mit Aufsteilung |
|-----|------------------|-----------------|
| Tuba B2 (MIDI 46)      | 300 Hz | 341 Hz |
| Tuba B3 (MIDI 58)      | 415 Hz | 515 Hz |
| Euphonium B3 (MIDI 58) | 582 Hz | 945 Hz |

Die Tuba wird im Fortissimo etwas runder und kerniger, schmettert aber nicht. Das Euphonium mit der
engeren Bohrung und dem höheren Druck bekommt in der Höhe deutlich mehr Glanz.

### Blasdruck, Anstoß, Atem, Vibrato

- **Blasdruck:** `p_m = (p0 + p1 · v^2,2) · (1 + s · (midi − tiefster Ton))`, Tuba `p0` = 550 Pa,
  `p1` = 4,8 kPa, `s` = 0,012; Euphonium 700 Pa, 7 kPa, 0,015. Das reicht von etwa 0,6 kPa
  (leisester tiefster Tubaton) bis 12 kPa (lautester höchster Euphoniumton). Tubisten spielen mit
  deutlich weniger Druck, aber viel mehr Luft als Trompeter (Bouhuys 1968). `velocity` kann auch ein
  Paar `[start, ende]` sein (Crescendo, Diminuendo).
- **Zunge:** Beim Lösen der Zunge sind die Lippen schon aufgedrückt. Das Modell startet sie mit bis
  zu 1,5 mal der statischen Öffnung, und der Mundraumdruck schießt in den ersten 30 ms um bis zu
  40 % über. `tongue` regelt das stufenlos vom harten „t“ (1) bis zum Atemanstoß (0), der
  Druckanstieg dauert dabei 10 bis 40 ms.
- **Absetzen:** Der Druck fällt in 40 bis 70 ms ab. Danach liegen die Lippen geschlossen, aber
  entspannt am Mundstück und schlucken einen Teil jeder zurücklaufenden Welle (Reflexion geht in
  50 ms auf 0,6). Ohne diese Dämpfung würde die lange Luftsäule tiefer Töne noch Sekunden nachklingen.
  Der Ausklang ist `0,3 s + 10 Perioden` lang, vor der letzten Blende ist das Signal um mehr als
  60 dB abgeklungen.
- **Atem und Lippengeräusch:** Turbulenz im Lippenstrahl als Schwankung des Volumenstroms,
  proportional zum Strom, bandbegrenzt (Tuba 150 Hz bis 2,2 kHz, Euphonium 200 Hz bis 3 kHz). Das
  Rauschen läuft durch das Rohr und wird von dessen Resonanzen gefärbt. Langsame Zufallsdrift von
  Druck und Lippenspannung kommt dazu.
- **Vibrato:** Lippenvibrato, die Lippenspannung schwankt mit etwa 4,6 Hz (Tuba) oder 5,2 Hz
  (Euphonium), die Tonhöhe folgt so weit, wie das Rohr es zulässt. Ohne Angabe setzt es auf Noten
  über 0,8 s verzögert ein, bei der Tuba sparsam (Tiefe 0,25), beim Euphonium deutlicher (0,55).

### Stimmung

Das gekoppelte System spielt etwas höher als die Rohrresonanz, weil die Lippen die Frequenz zu sich
ziehen: zwischen 12 und 61 Cent, mehr bei hohem Druck und auf dem 2. Naturton. `calibrate.mjs` misst
das für jeden Ton beider Presets bei sechs Lautstärken und schreibt die Tabelle `tuning.mjs`. Die
Tonhöhe kommt aus den ersten acht Harmonischen eines 1,4 s langen Hann-Fensters: Jede Spitze wird
logarithmisch-parabolisch interpoliert, durch ihre Ordnungszahl geteilt und nach Amplitude
gewichtet. Bei tiefen Tönen liegen die Grundtöne nur wenige FFT-Bins auseinander, die Obertöne
tragen dann die Genauigkeit. Beim Rendern werden Rohrlänge und Lippenfrequenz gemeinsam um diesen
Wert verschoben, auch während eines Crescendos. Ein zweiter Durchlauf misst den Rest und addiert ihn.
Wer Parameter am Modell ändert, ruft danach zweimal `node instruments/tuba/calibrate.mjs` auf.

## Schnittstelle

```js
import { render, meta } from './instruments/tuba.mjs';
// meta = { name: 'Tuba', presets: ['tuba', 'euphonium'], range: [26, 72],
//          ranges: { tuba: [26, 65], euphonium: [35, 72] } }
render({
  preset: 'tuba',       // oder 'euphonium'
  midi: 41,             // Standard: F2 (Tuba) bzw. F3 (Euphonium), in den Umfang des Presets gefaltet
  velocity: 0.8,        // 0,05 bis 1 oder [start, ende]
  duration: 1,          // Sekunden bis zum Absetzen (0,02 bis 30), Ausklang kommt dazu
  seed: 1,              // Zufallsdrift, deterministisch, auch gebrochene Werte
  vibrato: undefined,   // undefined: automatisch, 0: aus, bis 2: Tiefe
  tongue: true,         // true, 0..1 oder false
}); // Float64Array, mono, 48 kHz
```

`render()` und `render({})` spielen ein F2 auf der Tuba. Werte außerhalb der Bereiche werden
begrenzt, ein leeres `velocity`-Array gilt als 0,8, ein Array mit mehr als zwei Werten nutzt den
ersten und den letzten. Ist eine Zahl nicht endlich (etwa `NaN`), `tongue` weder Wahrheitswert noch
Zahl oder das Preset unbekannt, wirft `render` einen Fehler mit dem Namen des Parameters. Gleiche
Argumente ergeben bitgleich dasselbe Signal.

Pegel: Der Ausgangsfaktor jedes Presets ist so gewählt, dass die lauteste Einzelnote über den ganzen
Umfang (Velocity 1, alle Töne, acht Seeds, Vibrato 2, Atemanstoß, Crescendo) bei −3 dBFS liegt.
Jede Note beginnt und endet exakt bei null (0,5 ms Einblendung, 6 ms Ausblendung, beide als
Kosinusflanke). Rechenzeit etwa 0,11 s pro Sekunde Ton.

## Messungen

Spektraler Schwerpunkt im eingeschwungenen Ton (Velocity 0,2 / 1):

| Ton | Tuba | Euphonium |
|-----|------|-----------|
| D1 (MIDI 26) | 72 / 133 Hz  |              |
| H1 (MIDI 35) |              | 146 / 289 Hz |
| D2 (MIDI 38) | 135 / 248 Hz |              |
| H2 (MIDI 47) |              | 266 / 553 Hz |
| D3 (MIDI 50) | 239 / 397 Hz |              |
| H3 (MIDI 59) |              | 436 / 979 Hz |
| D4 (MIDI 62) | 366 / 595 Hz |              |
| H4 (MIDI 71) |              | 636 / 1094 Hz |

Der Grundton ist bei fast allen Tönen der stärkste Teilton. Nur im tiefen Euphonium-Fortissimo
überholt ihn der 5. Teilton um 2 dB. Von Velocity 0,2 bis 1 steigt der Pegel um 22 bis 27 dB.

Prüflauf über jeden zweiten Halbton beider Presets, Velocity 0,05 / 0,2 / 0,6 / 1, drei Seeds
(auch ein gebrochener), dazu Atemanstoß, halbe Zunge, Vibrato 0 und 2, Crescendo und Diminuendo über
den ganzen Bereich (1170 Noten):

- lauteste Note −3,2 dBFS, im dichteren Lauf mit allen Tönen und acht Seeds −3,0 dBFS
- größter Sprung zwischen zwei Proben 0,40
- keine `NaN`, alle Noten beginnen und enden bei exakt null
- Gleichanteil höchstens 3 · 10⁻⁷
- Energie unter 18 Hz höchstens −53 dB unter der Gesamtenergie
- Stimmung: größte Abweichung 2,2 Cent (D1, Velocity 0,05, Atemanstoß), alle Noten sprechen auf dem
  richtigen Naturton an

Demo (`out/tuba.wav`, 24,6 s, Stereo mit Hall): Spitze −3,0 dBFS, True Peak −3,0 dBTP, −16,4 LUFS
integriert, Lautheitsumfang 4,3 LU, größter Sprung zwischen zwei Proben 0,20. Die 44 Noten brauchen
knapp 3 s Rechenzeit.

## Grenzen

- Die Bohrung ist kein echter Konus mit Ventilschleifen. Ein gedrücktes Ventil verlängert nur die
  Schleife, die Unharmonizität echter Ventilkombinationen (vor allem mit dem vierten Ventil) fehlt,
  ebenso die Kompensation, die manche Instrumente dafür haben.
- Pedaltöne unterhalb des 2. Naturtons gibt es nicht.
- Der Grundton tiefer Töne hängt an zwei Vereinfachungen am Trichter (Anteil des reflektierten
  Signals und Pegelausgleich), die nicht aus einer Trichtergeometrie gerechnet sind.
- Jede Note wird einzeln gerendert. Gebundene Töne mit durchgehendem Luftstrom gibt es nicht, Legato
  entsteht über weiche Anstöße.

## Quellen

Physikalische Grundlagen und Messwerte, keine Code-Übernahme:

- A. H. Benade: *Fundamentals of Musical Acoustics*. Oxford University Press, 1976.
- N. H. Fletcher, T. D. Rossing: *The Physics of Musical Instruments*, 2. Aufl., Springer, 1998,
  Kapitel 8 und 14.
- N. H. Fletcher: Autonomous vibration of simple pressure-controlled valves in gas flows. J. Acoust.
  Soc. Am. 93(4), 2172-2180, 1993.
- A. Bouhuys: Pressure-flow events during wind instrument playing. Annals of the New York Academy of
  Sciences 155, 264-275, 1968.
- S. J. Elliott, J. M. Bowsher: Regeneration in brass wind instruments. J. Sound Vib. 83(2),
  181-217, 1982.
- A. Hirschberg, J. Gilbert, R. Msallam, A. P. J. Wijnands: Shock waves in trombones. J. Acoust.
  Soc. Am. 99(3), 1754-1758, 1996.
- M. Campbell, J. Gilbert, A. Myers: *The Science of Brass Instruments*. Springer, 2021.
- J. O. Smith: Physical modeling using digital waveguides. Computer Music Journal 16(4), 74-91, 1992.

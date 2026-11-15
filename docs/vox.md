# Vox

`instruments/vox.mjs` ist eine synthetische Stimme für Vocal-Hooks: kein aufgenommener Gesang,
sondern ein Modell aus Stimmlippen und Vokaltrakt. Sie singt Vokale, keine Wörter. Neben einer
natürlichen Gesangsstimme gibt es eine hochgepitchte Stimme, die so klingt, als hätte jemand einen
Gesangsschnipsel schneller abgespielt, wie bei den Hooks aus dem Partyrap mit Rave-Beats. Das
dritte Preset ist ein Chor als Fläche.

```js
import { render, meta } from './instruments/vox.mjs';
// meta.presets: ['lead', 'pitched', 'choir'], meta.vowel: ['a', 'e', 'i', 'o', 'u', 'ah-oh'], meta.range: [45, 88]
const [L, R] = render({ preset: 'pitched', midi: 77, vowel: 'ah-oh', duration: 0.4, velocity: 1 });
const chor = render({ preset: 'choir', midi: 60, vowel: 'o', duration: 3 });
```

| Name | Bedeutung |
| --- | --- |
| `preset` | `lead`, `pitched` oder `choir` |
| `midi` | Tonhöhe als MIDI-Note, 45 bis 88 |
| `vowel` | `a`, `e`, `i`, `o`, `u` oder `ah-oh` (gleitet von a nach o) |
| `velocity` | 0 bis 1, steuert Pegel, Helligkeit der Quelle und Hauchanteil |
| `duration` | Haltezeit in Sekunden, danach folgt das Release |
| `seed` | Startwert für Phasen, Jitter, Atemrauschen und die Stimmen im Chor |
| `bend`, `glide` | Pitch-Bend in Halbtönen (Zahl, Funktion oder Stützpunkte) und Portamento in Sekunden |

Das Ergebnis ist ein Paar `[left, right]` aus `Float64Array` bei 48 kHz. `lead` und `pitched` sind
mono (beide Kanäle gleich), `choir` ist stereo.

## Das Modell

Die Stimme folgt der Quelle-Filter-Theorie (Fant 1960): Die Stimmlippen erzeugen einen periodischen
Luftstrom mit vielen Obertönen, der Vokaltrakt (Rachen, Mund, Lippen) formt daraus mit seinen
Resonanzen, den Formanten, den Vokal. Quelle und Filter werden getrennt gerechnet.

```
Stimmlippen (Obertonsumme + Atemrauschen) -> fünf Formant-Resonatoren in Reihe -> (+ Präsenz)
  -> Hochpass 110 Hz -> (Tiefpass beim Chor) -> Hüllkurve -> DC-Blocker -> Ausgang
```

### Quelle

Der Puls der Stimmlippen ist hier eine Summe von Sinustönen bei Vielfachen des Grundtons. Die
Amplitude des `k`-ten Obertons:

```
A_k = 1 / (k · sqrt(1 + (k·f0 / f_tilt)²))
```

Bis `f_tilt` fällt das Spektrum mit 6 dB pro Oktave, das entspricht dem Schließen der Stimmritze
zusammen mit der Abstrahlung an den Lippen. Darüber fällt es mit 12 dB pro Oktave. Lauter gesungen
liegt `f_tilt` höher, die Stimme wird heller. Weil nur Obertöne unterhalb von 18 kHz vorkommen
(zwischen 14 und 18 kHz weich ausgeblendet), kann nichts spiegeln, egal wie hoch der Ton liegt
oder wie stark das Vibrato ist. Die Sinustöne entstehen über die Rekursion
`sin(kφ) = 2·cos φ · sin((k−1)φ) − sin((k−2)φ)`, eine Sinusberechnung pro Sample reicht.

Was die Stimme lebendig macht:

- **Jitter:** Die Periode schwankt zufällig, tiefpassgefiltertes Rauschen (18 Hz) mit 0,2 bis
  0,5 % Standardabweichung.
- **Shimmer:** Die Amplitude schwankt ebenso, 2 bis 4 %.
- **Vibrato:** setzt nach 0,15 bis 0,25 s ein und wächst über 0,35 s auf seine Tiefe.
- **Atem:** Rauschen, das im Takt der Stimmlippen geöffnet wird (stärker, wenn die Stimmritze
  offen ist), hochpassgefiltert bei 1,2 kHz und durch dieselben Formanten geschickt. Leise
  gesungen ist der Hauchanteil größer.
- **Ansatz:** Die natürliche Stimme setzt 0,6 Halbtöne zu tief an und gleitet in 50 ms auf den Ton.

### Formanten

Fünf Resonatoren zweiter Ordnung in Reihe, wie im Kaskaden-Formantsynthesizer (Klatt 1980). Jeder
ist ein zustandsvariables Filter (Zavalishin 2012) mit Verstärkung 1 bei 0 Hz und der Güte
`F/B`. In Reihe geschaltet ergeben sich die relativen Pegel der Formanten von selbst, ohne
eigene Gewichte pro Formant. Das Filter bleibt stabil, auch wenn sich die Frequenzen alle 16
Samples ändern.

| Vokal | F1 | F2 | F3 | F4 | F5 |
| --- | --- | --- | --- | --- | --- |
| a | 800 | 1250 | 2700 | 3700 | 4600 |
| e | 450 | 2150 | 2850 | 3800 | 4700 |
| i | 300 | 2500 | 3200 | 3900 | 4800 |
| o | 480 | 850 | 2700 | 3700 | 4600 |
| u | 330 | 750 | 2650 | 3700 | 4600 |

Frequenzen in Hz, gerundete Werte im Bereich veröffentlichter Mittelwerte für erwachsene Stimmen
(Peterson und Barney 1952), leicht in Richtung einer höheren Stimme verschoben. Bandbreiten 60 bis
110 Hz für F1, 100 bis 120 Hz für F2, darüber 160 bis 300 Hz.

Bei hohen Tönen liegen die Obertöne weit auseinander. Ein einzelner Oberton auf einem schmalen
Formanten würde dann pfeifen. Deshalb ist die Bandbreite mindestens ein Viertel des Grundtons.
Sängerinnen und Sänger öffnen in der Höhe ebenfalls den Mund weiter und verbreitern damit die
Resonanzen (Sundberg 1987).

`ah-oh` gleitet nach 80 ms innerhalb von höchstens 350 ms von a nach o, mit S-förmigem Verlauf und
in logarithmischer Frequenz. Kurze Noten gleiten entsprechend schneller.

Die Kaskade fällt oberhalb des fünften Formanten sehr steil ab. Ein kleiner Teil der Quelle,
hochpassgefiltert oberhalb von F5, wird deshalb dazugemischt. Das ist die Präsenz, die eine echte
Stimme dort noch hat.

### Hochgepitcht

Wird eine Aufnahme schneller abgespielt, steigen Tonhöhe und Formanten gemeinsam. Der Vokaltrakt
klingt dann kleiner. Das Preset `pitched` multipliziert deshalb alle Formanten mit 1,34 (etwa fünf
Halbtöne) und lässt die Tonhöhe unabhängig davon spielen. Dazu kommen ein schneller Einsatz (6 ms),
kein Ansatz von unten, ein schnelles, schmales Vibrato (6,4 Hz, ±12 Cent) und wenig Atem. Kurze
Noten klingen so wie zerschnittene Gesangsschnipsel.

### Chor

Sechs Stimmen, jede mit eigener Verstimmung (bis ±11 Cent), eigenem Vibrato-Tempo (4,5 bis
5,5 Hz) und eigener Phase, eigenem Jitter und um bis zu ±5 % verschobenen Formanten, als wären es
verschieden große Sängerinnen und Sänger. Die Stimmen werden abwechselnd links und rechts verteilt.
Formanten 6 % tiefer, mehr Atem, 350 ms Einsatz, 0,9 s Release und ein Tiefpass bei 7 kHz machen
daraus eine weiche Fläche.

### Pegel und Ränder

Jeder Vokal hat einen festen Ausgleichsfaktor (i, e und u sind von Natur aus leiser als a), jedes
Preset eine feste Verstärkung. Es gibt keine Normalisierung pro Note und keinen Begrenzer.
Halbkosinus-Attack und -Release, dazu 1 ms Einblendung und 20 ms Ausblendung: Jede Note beginnt
und endet exakt bei null.

## Demo

`node demos/vox.mjs` schreibt `out/vox.wav` (18,5 s, Stereo, 24 Bit):

- 0 bis 4 s: die natürliche Stimme auf allen Vokalen, zuletzt `ah-oh`
- 4,4 bis 6 s: eine kurze Figur auf der hochgepitchten Stimme
- 6,4 bis 10 s: ein Chorakkord in F-Dur, der von a nach o gleitet
- ab 10,6 s: vier Takte mit 140 BPM, Chorakkorde und darüber eine synkopierte, hochgepitchte Hook
  aus eigener Erfindung

Normalisierung mit einer einzigen linearen Verstärkung auf −1 dBFS Spitze, True-Peak unter
−0,6 dBTP. Kein Limiter.

## Messungen

- **Pegel:** einzelne Noten mit Anschlag 1 von MIDI 45 bis 88 in Zweierschritten, alle sechs Vokale,
  drei Seeds: höchste Spitze −1,7 dBFS (`lead`, `ah-oh`), `pitched` −2,6 dBFS, `choir` −3,4 dBFS.
  Beim Vokal a kann ein Teilton genau auf dem ersten Formanten (800 Hz) liegen, dann ist die
  Spitze deutlich höher als bei den anderen Vokalen. Deshalb ist a um 1,2 dB leiser abgeglichen.
  Wird eine Note trotzdem lauter als −1,2 dBFS (selten, etwa bei bestimmten Seeds), wird sie als
  Ganzes linear auf −1,2 dBFS abgesenkt. Kein NaN, Gleichanteil unter 3e−6.
- **Ränder:** erstes und letztes Sample exakt null, größter Sprung in den ersten fünf Samples 1,4e−7.
- **Aliasing:** `pitched` mit einem Bend über drei Oktaven bis 1,3 kHz Grundton. Oberhalb von 18 kHz
  ist das Spektrogramm leer, es gibt keine gespiegelten Teiltöne. Das folgt schon aus der Bauart
  der Quelle.
- **Tonhöhe:** bei 440 Hz `lead` +2,0, `pitched` +1,0, `choir` +4,5 Cent (die Chorstimmen sind
  absichtlich verstimmt).
- **Vokale:** Im Spektrogramm sind die Formanten der fünf Vokale klar getrennt. Hohe `i` und `u`
  am oberen Rand von `pitched` sind etwa 10 dB leiser als ein `a` auf demselben Ton, weil der erste Formant dort
  unter dem Grundton liegt und keinen Oberton mehr verstärkt.
- **Demo:** Spitze −1,0 dBFS, True-Peak −1,0 dBTP, integrierte Lautheit −11,1 LUFS.

## Grenzen

- Nur Vokale, keine Konsonanten und keine Wörter.
- Die Quelle hat eine feste Phasenlage der Obertöne. Echte Stimmlippenpulse haben eine eigene
  Form, die Unterschiede hört man vor allem bei tiefen Tönen.
- Kein Nasaltrakt, keine Antiresonanzen.

## Quellen

- G. Fant: Acoustic Theory of Speech Production. Mouton, 1960.
- D. H. Klatt: Software for a cascade/parallel formant synthesizer. JASA 67(3), 1980.
- G. E. Peterson, H. L. Barney: Control Methods Used in a Study of the Vowels. JASA 24(2), 1952.
- J. Sundberg: The Science of the Singing Voice. Northern Illinois University Press, 1987.
- V. Zavalishin: The Art of VA Filter Design. 2012, überarbeitet 2018.

Der gesamte Code ist eigenständig geschrieben. Aus den Quellen stammen nur Verfahren und
Messwerte, kein Code.
